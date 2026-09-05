import { Hono } from "hono";
import { cloudAuth } from "../services/cloud-auth.js";

// Kontrakt 1:1 se starým proxy (stavové kódy + tvary odpovědí zachovány).
export function authRoutes(): Hono {
  const app = new Hono();

  app.post("/api/auth/configure", async (c) => {
    try {
      const body = (await c.req.json<unknown>().catch(() => ({}))) as { apiKey?: unknown };
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (!apiKey) {
        return c.json({ error: "apiKey is required" }, 400);
      }
      await cloudAuth.configure(apiKey);
      return c.json({ ok: true, ...cloudAuth.getStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("ERROR in /api/auth/configure:", message);
      return c.json({ error: message }, 502);
    }
  });

  app.get("/api/auth/status", (c) => c.json(cloudAuth.getStatus()));

  app.post("/api/auth/logout", (c) => {
    cloudAuth.logout();
    return c.json({ ok: true });
  });

  app.get("/api/auth/token", async (c) => {
    try {
      if (!cloudAuth.isConfigured()) {
        return c.json({ error: "Cloud auth not configured" }, 401);
      }
      const token = await cloudAuth.getToken();
      return c.json({ token });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("ERROR in /api/auth/token:", message);
      return c.json({ error: message }, 502);
    }
  });

  return app;
}
