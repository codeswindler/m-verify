import { Router } from "express";
import { paymentVerificationSearchSchema, verifyPaymentSchema } from "@m-verify/shared";
import { asyncHandler } from "../http.js";
import { requireAuth, requirePermission, requireRoles } from "../middleware/auth.js";
import { verifyRateLimit } from "../middleware/rate-limits.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { lookupPayment, searchReceivedPayments, verifyPayment } from "../services/verification.js";

export const verifyRouter = Router();

verifyRouter.get(
  "/verify-payment/search",
  verifyRateLimit,
  requireAuth,
  requireRoles("manager", "waiter"),
  requirePermission("verify"),
  validateQuery(paymentVerificationSearchSchema),
  asyncHandler(async (request, response) => {
    const query = request.query as unknown as typeof paymentVerificationSearchSchema._type;
    const data = await searchReceivedPayments(query.q, query.limit, request.auth!);
    response.json({ data });
  })
);

verifyRouter.post(
  "/verify-payment/lookup",
  verifyRateLimit,
  requireAuth,
  requireRoles("admin", "manager", "waiter"),
  requirePermission("verify"),
  validateBody(verifyPaymentSchema),
  asyncHandler(async (request, response) => {
    const result = await lookupPayment(request.body as typeof verifyPaymentSchema._type, {
      auth: request.auth!,
      ipAddress: request.ip,
      userAgent: request.header("user-agent") ?? undefined
    });
    response.json(result);
  })
);

verifyRouter.post(
  "/verify-payment",
  verifyRateLimit,
  requireAuth,
  requireRoles("admin", "manager", "waiter"),
  requirePermission("verify"),
  validateBody(verifyPaymentSchema),
  asyncHandler(async (request, response) => {
    const result = await verifyPayment(request.body as typeof verifyPaymentSchema._type, {
      auth: request.auth!,
      ipAddress: request.ip,
      userAgent: request.header("user-agent") ?? undefined
    });
    response.json(result);
  })
);
