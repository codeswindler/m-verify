import type { UserPermissions, UserRole } from "@m-verify/shared";

export type AuthContext = {
  user: {
    id: number;
    username: string;
    fullName: string;
    role: UserRole;
    permissions: UserPermissions;
    disabled: boolean;
    tenantId: number | null;
    tenantName: string | null;
  };
  sessionId: number;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
