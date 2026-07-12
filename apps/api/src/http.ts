import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { config } from "./config.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "APP_ERROR",
    public details?: unknown
  ) {
    super(message);
  }
}

export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function notFoundHandler(request: Request, _response: Response, next: NextFunction): void {
  next(new AppError(404, `Route not found: ${request.method} ${request.path}`, "NOT_FOUND"));
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: error.flatten()
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      details: error.details
    });
    return;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code);
    if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") {
      response.status(500).json({
        error: "DATABASE_MIGRATION_REQUIRED",
        message: "Database migration is required before this feature can be used."
      });
      return;
    }
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  response.status(500).json({
    error: "INTERNAL_ERROR",
    message: config.isProduction ? "Unexpected server error" : message
  });
}
