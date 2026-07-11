import { Router } from "express";
import { initiateStkPromptSchema } from "@m-verify/shared";
import { asyncHandler } from "../http.js";
import { requireAuth, requirePermission, requireRoles } from "../middleware/auth.js";
import { verifyRateLimit } from "../middleware/rate-limits.js";
import { validateBody } from "../middleware/validate.js";
import { getStkPrompt, initiateStkPrompt } from "../services/stk.js";

export const stkRouter = Router();

stkRouter.post(
  "/stk-prompt",
  verifyRateLimit,
  requireAuth,
  requireRoles("manager", "waiter"),
  requirePermission("verify"),
  validateBody(initiateStkPromptSchema),
  asyncHandler(async (request, response) => {
    const result = await initiateStkPrompt(request.body as typeof initiateStkPromptSchema._type, request.auth!);
    response.status(result.status === "FAILED" ? 502 : 201).json(result);
  })
);

stkRouter.get(
  "/stk-prompt/:id",
  verifyRateLimit,
  requireAuth,
  requireRoles("manager", "waiter"),
  requirePermission("verify"),
  asyncHandler(async (request, response) => {
    const result = await getStkPrompt(Number(request.params.id), request.auth!);
    response.json(result);
  })
);
