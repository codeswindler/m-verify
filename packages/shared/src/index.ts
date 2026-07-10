import { z } from "zod";

export const userRoles = ["admin", "manager", "waiter"] as const;
export type UserRole = (typeof userRoles)[number];

export const tenantStatuses = ["active", "disabled"] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export const mpesaEnvironments = ["sandbox", "production"] as const;
export type MpesaEnvironment = (typeof mpesaEnvironments)[number];

export const paymentStatuses = ["PAID"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const verificationStatuses = [
  "VERIFIED",
  "NOT_FOUND",
  "AMOUNT_MISMATCH",
  "ALREADY_VERIFIED",
  "ERROR"
] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

export type SafeUser = {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  disabled: boolean;
  tenantId: number | null;
  tenantName: string | null;
};

export type AuthResponse = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type PaymentSummary = {
  id: number;
  tenantId: number | null;
  tenantName: string | null;
  customerName: string | null;
  reference: string | null;
  phoneNumber: string;
  transactionCode: string;
  amount: string;
  paymentChannel: string;
  status: PaymentStatus;
  paymentTime: string | null;
  verifiedStatus: boolean;
  verifiedBy: SafeUser | null;
  verifiedAt: string | null;
};

export type TenantSummary = {
  id: number;
  name: string;
  slug: string;
  status: TenantStatus;
  commissionRatePct: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MpesaCredentialSummary = {
  tenantId: number;
  environment: MpesaEnvironment;
  businessShortCode: string;
  tillNumber: string | null;
  consumerKeyMasked: string | null;
  hasConsumerSecret: boolean;
  hasPasskey: boolean;
  callbackSecretHint: string | null;
  validationUrl: string;
  confirmationUrl: string;
  active: boolean;
  updatedAt: string | null;
};

export type VerificationResponse = {
  result: VerificationStatus;
  message: string;
  payment?: PaymentSummary;
};

export type PaymentLookupResponse = {
  found: boolean;
  message: string;
  amountMatches?: boolean;
  alreadyVerified?: boolean;
  payment?: PaymentSummary;
};

export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
};

export const loginSchema = z.object({
  username: z.string().min(2).max(80),
  password: z.string().min(6).max(200),
  deviceId: z.string().min(8).max(120),
  deviceName: z.string().max(120).optional()
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(30),
  deviceId: z.string().min(8).max(120)
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(30).optional()
});

const optionalAmountSchema = z.preprocess(
  (value) => value === "" || value === null || value === undefined ? undefined : value,
  z.coerce.number().positive().max(10_000_000).optional()
);

export const verifyPaymentSchema = z.object({
  paymentId: z.coerce.number().int().positive().optional(),
  phoneNumber: z.string().trim().min(7).max(120).optional().or(z.literal("")),
  transactionCode: z.string().trim().min(4).max(40).optional().or(z.literal("")),
  amount: optionalAmountSchema,
  reference: z.string().trim().max(120).optional().or(z.literal(""))
}).refine((value) => Boolean(value.paymentId || value.phoneNumber || value.transactionCode || value.reference), {
  message: "Select a payment or provide a phone number, M-Pesa code, or reference code"
});

export const paymentVerificationSearchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().positive().max(25).default(10)
});

export const createUserSchema = z.object({
  username: z.string().min(2).max(80),
  fullName: z.string().min(2).max(120),
  role: z.enum(userRoles),
  password: z.string().min(8).max(200),
  tenantId: z.coerce.number().int().positive().optional()
});

export const updateUserSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  role: z.enum(userRoles).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  tenantId: z.coerce.number().int().positive().nullable().optional()
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  tenantId: z.coerce.number().int().positive().optional()
});

export const tenantSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only");

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: tenantSlugSchema.optional(),
  commissionRatePct: z.coerce.number().min(0).max(100).default(0),
  contactEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional().or(z.literal(""))
});

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  slug: tenantSlugSchema.optional(),
  status: z.enum(tenantStatuses).optional(),
  commissionRatePct: z.coerce.number().min(0).max(100).optional(),
  contactEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional().or(z.literal(""))
});

export const upsertMpesaCredentialSchema = z.object({
  environment: z.enum(mpesaEnvironments).default("production"),
  businessShortCode: z.string().trim().min(3).max(30),
  tillNumber: z.string().trim().max(30).optional().or(z.literal("")),
  consumerKey: z.string().trim().max(300).optional().or(z.literal("")),
  consumerSecret: z.string().trim().max(300).optional().or(z.literal("")),
  passkey: z.string().trim().max(500).optional().or(z.literal("")),
  callbackSecret: z.string().trim().min(12).max(200).optional().or(z.literal("")),
  active: z.boolean().default(true)
});

export const darajaConfirmationSchema = z.object({
  TransID: z.string().min(4).max(40),
  TransAmount: z.coerce.number().nonnegative(),
  MSISDN: z.union([z.string(), z.number()]),
  TransTime: z.union([z.string(), z.number()]).optional(),
  BillRefNumber: z.string().max(120).optional(),
  BusinessShortCode: z.union([z.string(), z.number()]).optional(),
  FirstName: z.string().trim().max(80).optional(),
  MiddleName: z.string().trim().max(80).optional(),
  LastName: z.string().trim().max(80).optional()
});
