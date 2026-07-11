import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { pingDatabase } from "./db.js";
import { errorHandler, notFoundHandler } from "./http.js";
import { generalRateLimit } from "./middleware/rate-limits.js";
import { authRouter } from "./routes/auth.routes.js";
import { businessRouter } from "./routes/business.routes.js";
import { logsRouter } from "./routes/logs.routes.js";
import { mpesaRouter } from "./routes/mpesa.routes.js";
import { platformRouter } from "./routes/platform.routes.js";
import { tenantsRouter } from "./routes/tenants.routes.js";
import { transactionsRouter } from "./routes/transactions.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { verifyRouter } from "./routes/verify.routes.js";

const tauriDesktopOrigins = new Set(["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]);

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number(part.replace(/\D+.*/, "")) || 0);
  const rightParts = right.split(".").map((part) => Number(part.replace(/\D+.*/, "")) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

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

  app.get(["/desktop/latest", "/desktop/latest.json"], (_request, response) => {
    const baseUrl = config.publicApiBaseUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");
    response.json({
      latestVersion: config.desktop.latestVersion,
      downloadUrl: config.desktop.downloadUrl || `${baseUrl}/downloads/M-Verify-Setup.exe`,
      releaseNotes: config.desktop.releaseNotes,
      mandatory: config.desktop.mandatoryUpdate
    });
  });

  app.get("/desktop/update/:target/:arch/:currentVersion", (request, response) => {
    const { target, arch, currentVersion } = request.params;
    if (target !== "windows" || arch !== "x86_64") {
      response.status(204).end();
      return;
    }

    if (compareVersions(config.desktop.latestVersion, currentVersion) <= 0 || !config.desktop.updaterSignature) {
      response.status(204).end();
      return;
    }

    const baseUrl = config.publicApiBaseUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");
    const url = config.desktop.updaterUrl || `${baseUrl}/downloads/M-Verify_${config.desktop.latestVersion}_x64-setup.exe`;
    response.json({
      version: config.desktop.latestVersion,
      pub_date: config.desktop.updaterPubDate || new Date().toISOString(),
      url,
      signature: config.desktop.updaterSignature,
      notes: config.desktop.releaseNotes
    });
  });

  app.use("/auth", authRouter);
  app.use(verifyRouter);
  app.use(transactionsRouter);
  app.use(logsRouter);
  app.use(platformRouter);
  app.use(businessRouter);
  app.use(tenantsRouter);
  app.use(usersRouter);
  app.use("/mpesa", mpesaRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
