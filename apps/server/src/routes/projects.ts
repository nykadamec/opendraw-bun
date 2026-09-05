// Projects routy – kontrakt 1:1 se starým proxy `index.ts` (F3).
import { Hono } from "hono";
import type { ProjectBrowser } from "../services/dt/project-browser.js";

export function projectsRoutes(browser: ProjectBrowser): Hono {
  const app = new Hono();

  app.get("/api/projects", async (c) => {
    try {
      const refresh = c.req.query("refresh") === "true";
      const projects = await browser.listProjects(refresh);
      return c.json(projects);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("ERROR in /api/projects:", msg);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/projects/:id/entries", async (c) => {
    const rawId = c.req.param("id");
    try {
      const page = parseInt(c.req.query("page") || "") || 1;
      const limit = parseInt(c.req.query("limit") || "") || 50;
      const result = await browser.getProjectEntries(rawId, page, limit);
      return c.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`ERROR in /api/projects/${encodeURIComponent(rawId)}/entries:`, msg);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/projects/:id/entries/:eid/image", async (c) => {
    const id = c.req.param("id");
    const eid = c.req.param("eid");
    try {
      const img = browser.getProjectEntryThumbnail(id, eid);
      if (!img) return c.json({ error: "not found" }, 404);
      return c.body(new Uint8Array(img), 200, { "Content-Type": "image/jpeg" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `ERROR in /api/projects/${encodeURIComponent(id)}/entries/${encodeURIComponent(eid)}/image:`,
        msg,
      );
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/projects/:id/entries/:eid/config", async (c) => {
    const id = c.req.param("id");
    const eid = c.req.param("eid");
    try {
      const config = browser.getProjectEntryConfig(id, eid);
      if (!config) return c.json({ error: "not found" }, 404);
      return c.json(config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `ERROR in /api/projects/${encodeURIComponent(id)}/entries/${encodeURIComponent(eid)}/config:`,
        msg,
      );
      return c.json({ error: msg }, 500);
    }
  });

  return app;
}
