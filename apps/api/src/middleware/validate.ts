import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (request: Request, _response: Response, next: NextFunction) => {
    request.body = schema.parse(request.body);
    next();
  };
}

export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (request: Request, _response: Response, next: NextFunction) => {
    request.query = schema.parse(request.query) as Request["query"];
    next();
  };
}
