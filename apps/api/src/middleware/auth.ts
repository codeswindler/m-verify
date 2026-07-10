import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@m-verify/shared";
import type { RowDataPacket } from "../db.js";
import { pool } from "../db.js";
import { AppError, asyncHandler } from "../http.js";
import { toSafeUser } from "../utils/format.js";
import { verifyAccessToken } from "../utils/security.js";

type SessionUserRow = RowDataPacket & {
  session_id: number;
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  disabled: number;
  tenant_id: number | null;
  tenant_name: string | null;
};

export const requireAuth = asyncHandler(async (request: Request, _response: Response, next: NextFunction) => {
  const authorization = request.header("authorization") ?? "";
  const [, token] = authorization.match(/^Bearer\s+(.+)$/i) ?? [];

  if (!token) {
    throw new AppError(401, "Missing access token", "UNAUTHENTICATED");
  }

  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError(401, "Invalid or expired access token", "UNAUTHENTICATED");
  }
  const userId = Number(payload.sub);
  const sessionId = Number(payload.sessionId);

  if (!Number.isFinite(userId) || !Number.isFinite(sessionId)) {
    throw new AppError(401, "Invalid access token", "UNAUTHENTICATED");
  }

  const [rows] = await pool.execute<SessionUserRow[]>(
    `SELECT ds.id AS session_id, u.id, u.username, u.full_name, u.role, u.disabled,
       u.tenant_id, t.name AS tenant_name
     FROM device_sessions ds
     INNER JOIN users u ON u.id = ds.user_id
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE ds.id = ? AND ds.user_id = ? AND ds.revoked_at IS NULL AND ds.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [sessionId, userId]
  );

  const row = rows[0];
  if (!row || Boolean(row.disabled)) {
    throw new AppError(401, "Session is no longer active", "UNAUTHENTICATED");
  }

  await pool.execute("UPDATE device_sessions SET last_seen_at = UTC_TIMESTAMP() WHERE id = ?", [sessionId]);
  request.auth = {
    user: toSafeUser(row),
    sessionId: Number(row.session_id)
  };
  next();
});

export function requireRoles(...roles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth) {
      next(new AppError(401, "Authentication required", "UNAUTHENTICATED"));
      return;
    }

    if (!roles.includes(request.auth.user.role)) {
      next(new AppError(403, "You do not have permission to perform this action", "FORBIDDEN"));
      return;
    }

    next();
  };
}
