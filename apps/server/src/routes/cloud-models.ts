import { Hono } from "hono";
import { getCloudModels } from "../services/cloud-models.js";

export function cloudModelsRoutes(): Hono {
  const app = new Hono();

  app.get("/api/cloud-models", (c) => {
    try {
      return c.json({ models: getCloudModels() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return app;
}
