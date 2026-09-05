// Server bootstrap (F1): config validace → služby → routy. Jen montáž,
// žádná logika (cílově <100 řádků). F2–F5 přidají další routy stejně.
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { loadConfig } from "./config.js";
import { createGrpcPort } from "./services/grpc/grpc-client.js";
import { createGalleryStore } from "./services/storage/gallery-store.js";
import { createCanvasStore } from "./services/storage/canvas-store.js";
import { createProjectBrowser } from "./services/dt/project-browser.js";
import { authRoutes } from "./routes/auth.js";
import { cloudModelsRoutes } from "./routes/cloud-models.js";
import { echoRoutes } from "./routes/echo.js";
import { galleryRoutes } from "./routes/gallery.js";
import { generateRoutes } from "./routes/generate.js";
import { canvasRoutes } from "./routes/canvas.js";
import { projectsRoutes } from "./routes/projects.js";
import { lorasRoutes } from "./routes/loras.js";

const config = loadConfig();

fs.mkdirSync(config.dataDir, { recursive: true });

const grpc = createGrpcPort(config);
const gallery = createGalleryStore(config.dataDir);
const canvas = createCanvasStore(path.join(config.dataDir, "Canvases"));
const projects = createProjectBrowser(config);

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/", echoRoutes(grpc, config));
app.route("/", cloudModelsRoutes());
app.route("/", authRoutes());
app.route("/", galleryRoutes(gallery));
app.route("/", generateRoutes(grpc, config, gallery));
app.route("/", canvasRoutes(canvas));
app.route("/", projectsRoutes(projects));
app.route("/", lorasRoutes(config));

console.log(`opendraw-bun server on http://${config.host}:${config.port} (DT ${config.dtHost}:${config.dtPort})`);

export default {
  port: config.port,
  hostname: config.host,
  // Generování (echo/LoRA/DT + SSE stream) trvá minuty a mezi SSE chunky
  // jsou dlouhé tiché fáze – výchozí Bun idleTimeout (~10 s) by spojení
  // samovolně abortoval. 0 = vypnuto, keep-alive drží SSE heartbeat
  // (`: ping` v generate.ts).
  idleTimeout: 0,
  fetch: app.fetch,
};
