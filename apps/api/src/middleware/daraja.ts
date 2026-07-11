import type { NextFunction, Request, Response } from "express";
import { AppError } from "../http.js";
import { isAllowedCallbackIp } from "../utils/security.js";

export function requireDarajaCallback(request: Request, _response: Response, next: NextFunction): void {
  if (!isAllowedCallbackIp(request.ip ?? "")) {
    next(new AppError(403, "Callback source IP is not allowed", "CALLBACK_IP_FORBIDDEN"));
    return;
  }

  next();
}
