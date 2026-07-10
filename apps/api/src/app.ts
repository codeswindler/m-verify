import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { pingDatabase } from "./db.js";
import { errorHandler, notFoundHandler } from "./http.js";
import { generalRateLimit } from "./middleware/rate-limits.js";
import { authRouter } from "./routes/auth.routes.js";
import { logsRouter } from "./routes/logs.routes.js";
import { mpesaRouter } from "./routes/mpesa.routes.js";
import { platformRouter } from "./routes/platform.routes.js";
import { tenantsRouter } from "./routes/tenants.routes.js";
import { transactionsRouter } from "./routes/transactions.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { verifyRouter } from "./routes/verify.routes.js";

const tauriDesktopOrigins = new Set(["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]);

export function createApp() {
  const app = express();

  app.set("trust proxy", config.trustProxy);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (
          !origin ||
          config.corsOrigins.length === 0 ||
          config.corsOrigins.includes(origin) ||
          tauriDesktopOrigins.has(origin)
        ) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS origin not allowed: ${origin}`));
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(config.isProduction ? "combined" : "dev"));
  app.use(generalRateLimit);

  app.get("/health", async (_request, response, next) => {
    try {
      await pingDatabase();
      response.json({ status: "ok", service: "m-verify-api" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/", (_request, response) => {
    response.json({
      service: "m-verify-api",
      status: "ok",
      health: "/health",
      adminUrl: "http://localhost:8080"
    });
  });

  app.use("/auth", authRouter);
  app.use(verifyRouter);
  app.use(transactionsRouter);
  app.use(logsRouter);
  app.use(platformRouter);
  app.use(tenantsRouter);
  app.use(usersRouter);
  app.use("/mpesa", mpesaRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
