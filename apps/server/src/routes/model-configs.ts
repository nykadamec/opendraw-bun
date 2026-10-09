import { Hono } from "hono";
import { getModelConfig } from "../services/model-configs.js";
import { getCloudModels } from "../services/cloud-models.js";

export function modelConfigRoutes(): Hono {
  const app = new Hono();

  // GET /api/model-configs – seznam modelů, které mají doporučený config
  // (subset cloud modelů). UI ho použije pro "recommended" badge.
  app.get("/api/model-configs", (c) => {
    try {
      const models = getCloudModels();
      const withConfig = models.filter((m) => getModelConfig(m.file) !== null);
      return c.json({
        total: models.length,
        withRecommended: withConfig.length,
        models: withConfig,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/model-configs/:model – doporučený config pro konkrétní model
  app.get("/api/model-configs/:model", (c) => {
    const model = c.req.param("model");
    const cfg = getModelConfig(model);
    if (!cfg) return c.json({ error: "No recommended config for this model" }, 404);
    return c.json({
      name: cfg.name,
      version: cfg.version,
      negative: cfg.negative,
      configuration: cfg.configuration,
    });
  });

  return app;
}
