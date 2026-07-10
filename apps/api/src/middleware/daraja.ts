import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { AppError } from "../http.js";
import { isAllowedCallbackIp } from "../utils/security.js";

export function requireDarajaCallback(request: Request, _response: Response, next: NextFunction): void {
  if (config.daraja.callbackSecret) {
    const secret = request.header("x-m-verify-callback-secret");
    if (secret !== config.daraja.callbackSecret) {
      next(new AppError(401, "Invalid Daraja callback secret", "INVALID_CALLBACK_SECRET"));
      return;
    }
  }

  if (!isAllowedCallbackIp(request.ip ?? "")) {
    next(new AppError(403, "Callback source IP is not allowed", "CALLBACK_IP_FORBIDDEN"));
    return;
  }

  next();
}
