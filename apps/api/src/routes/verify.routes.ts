import { Router } from "express";
import { verifyPaymentSchema } from "@m-verify/shared";
import { asyncHandler } from "../http.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { verifyRateLimit } from "../middleware/rate-limits.js";
import { validateBody } from "../middleware/validate.js";
import { lookupPayment, verifyPayment } from "../services/verification.js";

export const verifyRouter = Router();

verifyRouter.post(
  "/verify-payment/lookup",
  verifyRateLimit,
  requireAuth,
  requireRoles("admin", "manager", "waiter"),
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
