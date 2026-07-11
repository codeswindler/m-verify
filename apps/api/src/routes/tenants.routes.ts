import { Router } from "express";
import { z } from "zod";
import {
  createTenantSchema,
  updateTenantSchema,
  upsertMpesaCredentialSchema
} from "@m-verify/shared";
import type { MpesaCredentialSummary, TenantStatus, TenantSummary } from "@m-verify/shared";
import type { DbParam, ResultSetHeader, RowDataPacket } from "../db.js";
import { pool } from "../db.js";
import { config } from "../config.js";
import { SYSTEM_TENANT_SLUG } from "../constants.js";
import { AppError, asyncHandler } from "../http.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  decryptCredential,
  encryptCredential,
  maskSecret
} from "../utils/security.js";

type TenantRow = RowDataPacket & {
  id: number;
  name: string;
  slug: string;
  status: TenantStatus;
  commission_rate_pct: string;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type MpesaCredentialRow = RowDataPacket & {
  tenant_id: number;
  tenant_slug: string;
  environment: "sandbox" | "production";
  payment_method: "paybill" | "till";
  business_shortcode: string;
  till_number: string | null;
  consumer_key_encrypted: string | null;
  consumer_secret_encrypted: string | null;
  passkey_encrypted: string | null;
  active: number;
  updated_at: Date | string | null;
};

type DarajaTokenResponse = {
  access_token?: string;
  error?: string;
  errorMessage?: string;
};

type DarajaRegisterResponse = {
  ResponseCode?: string;
  ResponseDescription?: string;
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
  [key: string]: unknown;
};

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const tenantsRouter = Router();

tenantsRouter.use("/tenants", requireAuth, requireRoles("admin"));

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `tenant-${Date.now()}`;
}

function normalizeEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function callbackUrls(slug: string): Pick<MpesaCredentialSummary, "validationUrl" | "confirmationUrl"> {
  const baseUrl = config.publicApiBaseUrl.replace(/\/+$/, "");
  return {
    validationUrl: `${baseUrl}/mpesa/${slug}/c2b/validation`,
    confirmationUrl: `${baseUrl}/mpesa/${slug}/c2b/confirmation`
  };
}

function mapTenant(row: TenantRow): TenantSummary {
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    status: row.status,
    commissionRatePct: String(row.commission_rate_pct ?? "0.00"),
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function mapMpesaCredential(row: MpesaCredentialRow): MpesaCredentialSummary {
  const consumerKey = decryptCredential(row.consumer_key_encrypted);
  return {
    tenantId: Number(row.tenant_id),
    environment: row.environment,
    paymentMethod: row.payment_method,
    businessShortCode: row.business_shortcode,
    tillNumber: row.till_number,
    consumerKeyMasked: maskSecret(consumerKey),
    hasConsumerSecret: Boolean(row.consumer_secret_encrypted),
    hasPasskey: Boolean(row.passkey_encrypted),
    ...callbackUrls(row.tenant_slug),
    active: Boolean(row.active),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getTenant(id: number): Promise<TenantRow> {
  const [rows] = await pool.execute<TenantRow[]>(
    `SELECT id, name, slug, status, commission_rate_pct, contact_email, contact_phone, created_at, updated_at
     FROM tenants
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(404, "Tenant not found", "TENANT_NOT_FOUND");
  }
  return row;
}

async function getMpesaCredential(id: number): Promise<MpesaCredentialRow | null> {
  const [rows] = await pool.execute<MpesaCredentialRow[]>(
    `SELECT mc.tenant_id, t.slug AS tenant_slug, mc.environment, mc.payment_method, mc.business_shortcode, mc.till_number,
      mc.consumer_key_encrypted, mc.consumer_secret_encrypted, mc.passkey_encrypted,
      mc.active, mc.updated_at
     FROM tenant_mpesa_credentials mc
     INNER JOIN tenants t ON t.id = mc.tenant_id
     WHERE mc.tenant_id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

function darajaOAuthUrl(environment: "sandbox" | "production"): string {
  return environment === "sandbox" ? config.daraja.oauthSandboxUrl : config.daraja.oauthProductionUrl;
}

function darajaRegisterUrl(environment: "sandbox" | "production"): string {
  return environment === "sandbox" ? config.daraja.c2bRegisterSandboxUrl : config.daraja.c2bRegisterProductionUrl;
}

async function readDarajaJson(response: Response): Promise<DarajaRegisterResponse & DarajaTokenResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as DarajaRegisterResponse & DarajaTokenResponse;
  } catch {
    return { errorMessage: text };
  }
}

function darajaErrorMessage(payload: DarajaRegisterResponse & DarajaTokenResponse, fallback: string): string {
  const rawMessage = payload.errorMessage ?? payload.ResponseDescription ?? payload.error ?? fallback;
  if (rawMessage.toLowerCase().includes("invalid access token")) {
    return "Daraja rejected the access token. Confirm this business has the correct sandbox/production environment, consumer key, consumer secret, shortcode, and C2B product access.";
  }
  return rawMessage;
}

async function requestDarajaAccessToken(credentials: MpesaCredentialRow): Promise<string> {
  const consumerKey = decryptCredential(credentials.consumer_key_encrypted);
  const consumerSecret = decryptCredential(credentials.consumer_secret_encrypted);

  if (!consumerKey || !consumerSecret) {
    throw new AppError(400, "Save the Daraja consumer key and consumer secret before registering callbacks.", "DARAJA_CREDENTIALS_REQUIRED");
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`, "utf8").toString("base64");
  const response = await fetch(darajaOAuthUrl(credentials.environment), {
    method: "GET",
    headers: {
      authorization: `Basic ${auth}`
    }
  });
  const payload = await readDarajaJson(response);

  if (!response.ok || !payload.access_token) {
    throw new AppError(
      502,
      darajaErrorMessage(payload, "Daraja token request failed."),
      "DARAJA_TOKEN_FAILED",
      payload
    );
  }

  return payload.access_token;
}

async function registerDarajaCallbacks(credentials: MpesaCredentialRow): Promise<DarajaRegisterResponse> {
  if (!credentials.active) {
    throw new AppError(400, "Enable callbacks before registering URLs with Daraja.", "MPESA_CALLBACKS_DISABLED");
  }

  const token = await requestDarajaAccessToken(credentials);
  const urls = callbackUrls(credentials.tenant_slug);
  const response = await fetch(darajaRegisterUrl(credentials.environment), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ShortCode: credentials.business_shortcode,
      ResponseType: "Completed",
      ConfirmationURL: urls.confirmationUrl,
      ValidationURL: urls.validationUrl
    })
  });
  const payload = await readDarajaJson(response);

  if (!response.ok) {
    throw new AppError(
      502,
      darajaErrorMessage(payload, "Daraja callback registration failed."),
      "DARAJA_REGISTER_FAILED",
      payload
    );
  }

  return payload;
}

tenantsRouter.get(
  "/tenants",
  asyncHandler(async (_request, response) => {
    const [rows] = await pool.execute<TenantRow[]>(
      `SELECT id, name, slug, status, commission_rate_pct, contact_email, contact_phone, created_at, updated_at
       FROM tenants
       WHERE slug <> ?
       ORDER BY status ASC, name ASC`,
      [SYSTEM_TENANT_SLUG]
    );
    response.json({ data: rows.map(mapTenant) });
  })
);

tenantsRouter.post(
  "/tenants",
  validateBody(createTenantSchema),
  asyncHandler(async (request, response) => {
    const body = request.body as typeof createTenantSchema._type;
    const slug = body.slug ?? slugify(body.name);

    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO tenants (name, slug, commission_rate_pct, contact_email, contact_phone)
         VALUES (?, ?, ?, ?, ?)`,
        [body.name, slug, body.commissionRatePct, normalizeEmpty(body.contactEmail), normalizeEmpty(body.contactPhone)]
      );
      const tenant = await getTenant(Number(result.insertId));
      response.status(201).json(mapTenant(tenant));
    } catch (error) {
      if (error instanceof Error && error.message.includes("Duplicate")) {
        throw new AppError(409, "Tenant slug already exists", "TENANT_EXISTS");
      }
      throw error;
    }
  })
);

tenantsRouter.get(
  "/tenants/:id",
  asyncHandler(async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    response.json(mapTenant(await getTenant(id)));
  })
);

tenantsRouter.patch(
  "/tenants/:id",
  validateBody(updateTenantSchema),
  asyncHandler(async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = request.body as typeof updateTenantSchema._type;
    const updates: string[] = [];
    const params: DbParam[] = [];

    if (body.name !== undefined) {
      updates.push("name = ?");
      params.push(body.name);
    }
    if (body.slug !== undefined) {
      updates.push("slug = ?");
      params.push(body.slug);
    }
    if (body.status !== undefined) {
      updates.push("status = ?");
      params.push(body.status);
    }
    if (body.commissionRatePct !== undefined) {
      updates.push("commission_rate_pct = ?");
      params.push(body.commissionRatePct);
    }
    if (body.contactEmail !== undefined) {
      updates.push("contact_email = ?");
      params.push(normalizeEmpty(body.contactEmail));
    }
    if (body.contactPhone !== undefined) {
      updates.push("contact_phone = ?");
      params.push(normalizeEmpty(body.contactPhone));
    }

    if (updates.length === 0) {
      throw new AppError(400, "No tenant changes supplied", "NO_CHANGES");
    }

    params.push(id);
    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE tenants SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
      if (result.affectedRows === 0) {
        throw new AppError(404, "Tenant not found", "TENANT_NOT_FOUND");
      }
      response.json(mapTenant(await getTenant(id)));
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.message.includes("Duplicate")) {
        throw new AppError(409, "Tenant slug already exists", "TENANT_EXISTS");
      }
      throw error;
    }
  })
);

tenantsRouter.get(
  "/tenants/:id/mpesa",
  asyncHandler(async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const tenant = await getTenant(id);
    const credentials = await getMpesaCredential(id);
    response.json({
      data: credentials ? mapMpesaCredential(credentials) : null,
      callbackUrls: callbackUrls(tenant.slug)
    });
  })
);

tenantsRouter.put(
  "/tenants/:id/mpesa",
  validateBody(upsertMpesaCredentialSchema),
  asyncHandler(async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    await getTenant(id);
    const body = request.body as typeof upsertMpesaCredentialSchema._type;
    const existing = await getMpesaCredential(id);

    try {
      await pool.execute<ResultSetHeader>(
        `INSERT INTO tenant_mpesa_credentials (
          tenant_id, environment, payment_method, business_shortcode, till_number, consumer_key_encrypted,
          consumer_secret_encrypted, passkey_encrypted, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          environment = VALUES(environment),
          payment_method = VALUES(payment_method),
          business_shortcode = VALUES(business_shortcode),
          till_number = VALUES(till_number),
          consumer_key_encrypted = VALUES(consumer_key_encrypted),
          consumer_secret_encrypted = VALUES(consumer_secret_encrypted),
          passkey_encrypted = VALUES(passkey_encrypted),
          active = VALUES(active)`,
        [
          id,
          body.environment,
          body.paymentMethod,
          body.businessShortCode,
          body.paymentMethod === "till" ? normalizeEmpty(body.tillNumber) : null,
          normalizeEmpty(body.consumerKey) ? encryptCredential(body.consumerKey) : existing?.consumer_key_encrypted ?? null,
          normalizeEmpty(body.consumerSecret)
            ? encryptCredential(body.consumerSecret)
            : existing?.consumer_secret_encrypted ?? null,
          normalizeEmpty(body.passkey) ? encryptCredential(body.passkey) : existing?.passkey_encrypted ?? null,
          body.active
        ]
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("Duplicate")) {
        throw new AppError(409, "This M-Pesa shortcode is already assigned to another tenant", "MPESA_SHORTCODE_EXISTS");
      }
      throw error;
    }

    const credentials = await getMpesaCredential(id);
    response.json(mapMpesaCredential(credentials!));
  })
);

tenantsRouter.post(
  "/tenants/:id/mpesa/register-callbacks",
  asyncHandler(async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    await getTenant(id);
    const credentials = await getMpesaCredential(id);
    if (!credentials) {
      throw new AppError(404, "Save M-Pesa credentials before registering callbacks.", "MPESA_CREDENTIALS_NOT_FOUND");
    }

    const darajaResponse = await registerDarajaCallbacks(credentials);
    response.json({
      message: darajaResponse.ResponseDescription ?? "Daraja callback URLs registered.",
      daraja: darajaResponse,
      callbackUrls: callbackUrls(credentials.tenant_slug)
    });
  })
);
