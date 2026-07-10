import { Router } from "express";
import { z } from "zod";
import { createUserSchema, updateUserSchema } from "@m-verify/shared";
import type { UserRole } from "@m-verify/shared";
import type { DbParam, ResultSetHeader, RowDataPacket } from "../db.js";
import { pool } from "../db.js";
import { AppError, asyncHandler } from "../http.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthContext } from "../types.js";
import { hashPassword } from "../utils/security.js";
import { toSafeUser } from "../utils/format.js";

type UserRow = RowDataPacket & {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  disabled: number;
  tenant_id: number | null;
  tenant_name: string | null;
  last_login_at: Date | string | null;
  created_at: Date | string;
};

type TenantExistsRow = RowDataPacket & { id: number };

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const usersRouter = Router();

usersRouter.use("/users", requireAuth, requireRoles("admin", "manager"));

async function ensureTenantExists(tenantId: number): Promise<void> {
  const [rows] = await pool.execute<TenantExistsRow[]>(
    "SELECT id FROM tenants WHERE id = ? AND status = 'active' LIMIT 1",
    [tenantId]
  );
  if (!rows[0]) {
    throw new AppError(400, "Tenant does not exist or is disabled", "TENANT_NOT_AVAILABLE");
  }
}

usersRouter.get(
  "/users",
  asyncHandler(async (request, response) => {
    const auth = request.auth!;
    const where = auth.user.role === "admin" ? "" : "WHERE u.tenant_id = ?";
    const params: DbParam[] = auth.user.role === "admin" ? [] : [auth.user.tenantId ?? -1];
    const [rows] = await pool.execute<UserRow[]>(
      `SELECT u.id, u.username, u.full_name, u.role, u.disabled, u.tenant_id, t.name AS tenant_name,
        u.last_login_at, u.created_at
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       ${where}
       ORDER BY u.disabled ASC, u.username ASC`,
      params
    );

    response.json({
      data: rows.map((row) => ({
        ...toSafeUser(row),
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
        createdAt: new Date(row.created_at).toISOString()
      }))
    });
  })
);

usersRouter.post(
  "/users",
  validateBody(createUserSchema),
  asyncHandler(async (request, response) => {
    const body = request.body as typeof createUserSchema._type;
    const auth = request.auth!;
    if (auth.user.role !== "admin" && body.role === "admin") {
      throw new AppError(403, "Business managers cannot create platform admins", "FORBIDDEN");
    }
    const passwordHash = await hashPassword(body.password);
    const tenantId = auth.user.role === "admin" ? body.tenantId ?? 1 : auth.user.tenantId;
    if (!tenantId) {
      throw new AppError(400, "Business user is not assigned to a business", "BUSINESS_REQUIRED");
    }
    await ensureTenantExists(tenantId);

    try {
      const [result] = await pool.execute<ResultSetHeader>(
        "INSERT INTO users (tenant_id, username, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)",
        [tenantId, body.username, passwordHash, body.fullName, body.role]
      );
      response.status(201).json({
        id: Number(result.insertId),
        username: body.username,
        fullName: body.fullName,
        role: body.role,
        disabled: false,
        tenantId,
        tenantName: null
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Duplicate")) {
        throw new AppError(409, "Username already exists", "USERNAME_EXISTS");
      }
      throw error;
    }
  })
);

usersRouter.patch(
  "/users/:id",
  validateBody(updateUserSchema),
  asyncHandler(async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = request.body as typeof updateUserSchema._type;
    const auth = request.auth!;
    const target = await getScopedUser(id, auth);
    if (!target) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }
    if (auth.user.role !== "admin" && body.role === "admin") {
      throw new AppError(403, "Business managers cannot assign platform admin permissions", "FORBIDDEN");
    }
    const updates: string[] = [];
    const params: DbParam[] = [];

    if (body.fullName !== undefined) {
      updates.push("full_name = ?");
      params.push(body.fullName);
    }
    if (body.role !== undefined) {
      updates.push("role = ?");
      params.push(body.role);
    }
    if (body.tenantId !== undefined) {
      if (auth.user.role !== "admin") {
        throw new AppError(403, "Business managers cannot move users between businesses", "FORBIDDEN");
      }
      if (body.tenantId !== null) {
        await ensureTenantExists(body.tenantId);
      }
      updates.push("tenant_id = ?");
      params.push(body.tenantId);
    }
    if (body.disabled !== undefined) {
      updates.push("disabled = ?");
      params.push(body.disabled);
      if (body.disabled) {
        updates.push("updated_at = UTC_TIMESTAMP()");
      }
    }
    if (body.password !== undefined) {
      updates.push("password_hash = ?");
      params.push(await hashPassword(body.password));
    }

    if (updates.length === 0) {
      throw new AppError(400, "No user changes supplied", "NO_CHANGES");
    }

    params.push(id);
    const [result] = await pool.execute<ResultSetHeader>(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
    if (result.affectedRows === 0) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    if (body.disabled) {
      await pool.execute("UPDATE device_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ?", [id]);
    }

    const [rows] = await pool.execute<UserRow[]>(
      `SELECT u.id, u.username, u.full_name, u.role, u.disabled, u.tenant_id, t.name AS tenant_name,
        u.last_login_at, u.created_at
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = ? LIMIT 1`,
      [id]
    );
    response.json(toSafeUser(rows[0]!));
  })
);

async function getScopedUser(id: number, auth: AuthContext): Promise<UserRow | null> {
  const where = auth.user.role === "admin" ? "u.id = ?" : "u.id = ? AND u.tenant_id = ?";
  const params: DbParam[] = auth.user.role === "admin" ? [id] : [id, auth.user.tenantId ?? -1];
  const [rows] = await pool.execute<UserRow[]>(
    `SELECT u.id, u.username, u.full_name, u.role, u.disabled, u.tenant_id, t.name AS tenant_name,
      u.last_login_at, u.created_at
     FROM users u
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE ${where}
     LIMIT 1`,
    params
  );
  return rows[0] ?? null;
}
