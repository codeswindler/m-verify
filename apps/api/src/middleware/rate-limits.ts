import rateLimit from "express-rate-limit";
import { config } from "../config.js";

export const generalRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false
});

export const loginRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false
});

export const verifyRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.verifyMax,
  standardHeaders: true,
  legacyHeaders: false
});
