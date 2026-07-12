import { Router } from "express";
import { loginSchema, logoutSchema, refreshSchema } from "@m-verify/shared";
import type { UserRole } from "@m-verify/shared";
import type { ResultSetHeader, RowDataPacket } from "../db.js";
import { pool } from "../db.js";
import { AppError, asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { loginRateLimit } from "../middleware/rate-limits.js";
import { validateBody } from "../middleware/validate.js";
import { toMysqlDate, toSafeUser } from "../utils/format.js";
import {
  createRefreshToken,
  hashRefreshToken,
  refreshExpiryDate,
  signAccessToken,
  verifyPassword
} from "../utils/security.js";

type UserRow = RowDataPacket & {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  module_permissions: string | null;
  disabled: number;
  tenant_id: number | null;
  tenant_name: string | null;
};

type SessionRow = RowDataPacket & {
  id: number;
  user_id: number;
  username: string;
  full_name: string;
  role: UserRole;
  module_permissions: string | null;
  disabled: number;
  tenant_id: number | null;
  tenant_name: string | null;
};

export const authRouter = Router();

authRouter.post(
  "/login",
  loginRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (request, response) => {
    const { username, password, deviceId, deviceName } = request.body as typeof loginSchema._type;

    const [rows] = await pool.execute<UserRow[]>(
      `SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.module_permissions, u.disabled,
        u.tenant_id, t.name AS tenant_name
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.username = ? LIMIT 1`,
      [username]
    );
    const user = rows[0];

    if (!user || Boolean(user.disabled) || !(await verifyPassword(password, user.password_hash))) {
      throw new AppError(401, "Invalid username or password", "INVALID_CREDENTIALS");
    }

    const refreshToken = createRefreshToken();
    const expiresAt = refreshExpiryDate();
    const [insertResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO device_sessions (user_id, device_id, device_name, refresh_token_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, deviceId, deviceName ?? null, hashRefreshToken(refreshToken), toMysqlDate(expiresAt)]
    );

    await pool.execute("UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?", [user.id]);

    const safeUser = toSafeUser(user);
    const { accessToken, expiresIn } = signAccessToken({
      user: safeUser,
      sessionId: Number(insertResult.insertId)
    });

    response.json({
      user: safeUser,
      accessToken,
      refreshToken,
      expiresIn
    });
  })
);

authRouter.post(
  "/refresh",
  validateBody(refreshSchema),
  asyncHandler(async (request, response) => {
    const { refreshToken, deviceId } = request.body as typeof refreshSchema._type;
    const currentHash = hashRefreshToken(refreshToken);

    const [rows] = await pool.execute<SessionRow[]>(
      `SELECT ds.id, ds.user_id, u.username, u.full_name, u.role, u.module_permissions, u.disabled,
        u.tenant_id, t.name AS tenant_name
       FROM device_sessions ds
       INNER JOIN users u ON u.id = ds.user_id
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE ds.refresh_token_hash = ? AND ds.device_id = ? AND ds.revoked_at IS NULL AND ds.expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [currentHash, deviceId]
    );

    const session = rows[0];
    if (!session || Boolean(session.disabled)) {
      throw new AppError(401, "Refresh token is invalid or expired", "INVALID_REFRESH_TOKEN");
    }

    const expiresAt = refreshExpiryDate();
    await pool.execute(
      `UPDATE device_sessions
       SET expires_at = ?, last_seen_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [toMysqlDate(expiresAt), session.id]
    );

    const safeUser = toSafeUser({
      id: session.user_id,
      username: session.username,
      full_name: session.full_name,
      role: session.role,
      module_permissions: session.module_permissions,
      disabled: session.disabled,
      tenant_id: session.tenant_id,
      tenant_name: session.tenant_name
    } as RowDataPacket & Record<string, unknown>);
    const { accessToken, expiresIn } = signAccessToken({
      user: safeUser,
      sessionId: Number(session.id)
    });

    response.json({
      user: safeUser,
      accessToken,
      refreshToken,
      expiresIn
    });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  validateBody(logoutSchema),
  asyncHandler(async (request, response) => {
    const refreshToken = (request.body as typeof logoutSchema._type).refreshToken;

    if (refreshToken) {
      await pool.execute("UPDATE device_sessions SET revoked_at = UTC_TIMESTAMP() WHERE refresh_token_hash = ?", [
        hashRefreshToken(refreshToken)
      ]);
    } else {
      await pool.execute("UPDATE device_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ?", [
        request.auth!.sessionId
      ]);
    }

    response.status(204).send();
  })
);
