// Gallery routy – kontrakt 1:1 se starým proxy `index.ts` (F2).
import { Hono } from "hono";
import type { GalleryStore } from "../services/storage/gallery-store.js";

export function galleryRoutes(store: GalleryStore): Hono {
  const app = new Hono();

  app.get("/api/gallery/stats", (c) => {
    try {
      return c.json(store.getStats());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.delete("/api/gallery/clean", async (c) => {
    try {
      const type = c.req.query("type") || "all";
      if (!["all", "images", "metadata"].includes(type)) {
        return c.json({ error: "type must be all, images, or metadata" }, 400);
      }
      const result = await store.clean(type as "all" | "images" | "metadata");
      return c.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/gallery", async (c) => {
    try {
      const entries = await store.list();
      return c.json(entries);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/gallery/:id/image", async (c) => {
    try {
      const img = await store.getImage(c.req.param("id"));
      if (!img) return c.json({ error: "not found" }, 404);
      return c.body(new Uint8Array(img), 200, { "Content-Type": "image/png" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("ERROR in /api/gallery/:id/image:", msg);
      return c.json({ error: "Failed to load image" }, 500);
    }
  });

  app.get("/api/gallery/:id/metadata", async (c) => {
    const meta = await store.getMetadata(c.req.param("id"));
    if (!meta) return c.json({ error: "not found" }, 404);
    return c.json(meta);
  });

  app.delete("/api/gallery/:id", async (c) => {
    const ok = await store.deleteEntry(c.req.param("id"));
    if (!ok) {
      return c.json({ error: "Failed to delete gallery entry" }, 500);
    }
    return c.json({ deleted: true });
  });

  return app;
}
