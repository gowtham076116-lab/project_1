import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

// Also load .env.local if present so local overrides (APPS_SCRIPT_WEB_APP_URL, APPS_SCRIPT_SHARED_SECRET, GOOGLE_SHEET_ID) are always active
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerAdminAuthRoutes } from "../adminAuth";
import { registerEventsRoutes } from "../eventsRoutes";
import { registerContentRoutes } from "../contentRoutes";
import { registerSponsorsRoutes } from "../sponsorsRoutes";
import { registerCommunitySessionsRoutes } from "../communitySessionsRoutes";
import { registerFinanceRoutes } from "../financeRoutes";
import { registerCampaignsRoutes } from "../campaignsRoutes";
import { registerSupportRoutes } from "../supportRoutes";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });

  // Dedicated admin auth endpoints
  registerAdminAuthRoutes(app);

  // Shared Events & Bookings API (Admin + User Activity Events sync)
  registerEventsRoutes(app);

  // Shared Nutrients & Marketplace API (Admin Events Hosting Studio -> User Nutrients & Shop sync)
  registerContentRoutes(app);

  // Admin Sponsors API (synced with Google Sheets "sponsors details" tab)
  registerSponsorsRoutes(app);

  // Community Sessions, Registrations & Central Payments Ledger API
  registerCommunitySessionsRoutes(app);

  // Admin Revenue & Finance Aggregation + Google Sheets Mirror API
  registerFinanceRoutes(app);

  // Admin Campaign Studio -> User Notifications API
  registerCampaignsRoutes(app);

  // User Help -> Admin Support Centre API
  registerSupportRoutes(app);

  // User OAuth routes
  registerOAuthRoutes(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
