import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import type { GrpcPort } from "../services/grpc/grpc-port.js";
import { getLoraNames } from "../services/lora-names.js";

export function echoRoutes(grpc: GrpcPort, config: ServerConfig): Hono {
  const app = new Hono();

  app.get("/api/echo", async (c) => {
    try {
      const result = await grpc.echo();
      const loraNames = getLoraNames(config.modelsDir);
      return c.json({ ...result, loraNames });
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Draw Things unavailable", details }, 503);
    }
  });

  return app;
}
