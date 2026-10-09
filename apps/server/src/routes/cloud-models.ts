import { Hono } from "hono";
import { getCloudModels } from "../services/cloud-models.js";
import type { GrpcPort } from "../services/grpc/grpc-port.js";

export function cloudModelsRoutes(grpc?: GrpcPort): Hono {
  const app = new Hono();

  app.get("/api/cloud-models", (c) => {
    try {
      return c.json({ models: getCloudModels() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // F2: POST /api/cloud-models/sync – push kuraovaných modelů do lokálního DT serveru
  // (UpdateModelList RPC). On-demand akce, ne on-start side-effect.
  app.post("/api/cloud-models/sync", async (c) => {
    if (!grpc) {
      return c.json({ error: "gRPC not available" }, 503);
    }
    try {
      const models = getCloudModels();
      const files = models.map((m) => m.file);
      console.log(`[cloud-models/sync] pushing ${files.length} models to DT server`);
      const message = await grpc.updateModelList(files, `synced from opendraw: ${files.length} models`);
      return c.json({ ok: true, message, count: files.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[cloud-models/sync] error: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  });

  return app;
}
