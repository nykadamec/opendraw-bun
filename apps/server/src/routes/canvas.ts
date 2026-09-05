// Canvas routy – kontrakt 1:1 se starým proxy `index.ts` (F2).
import { Hono } from "hono";
import type { CanvasStore } from "../services/storage/canvas-store.js";
import type { ThumbnailProvider } from "../services/storage/thumbnail.js";
import { getThumbnailProvider } from "../services/storage/thumbnail.js";

export function canvasRoutes(
  store: CanvasStore,
  thumbnails: ThumbnailProvider = getThumbnailProvider(),
): Hono {
  const app = new Hono();

  app.get("/api/canvas", async (c) => {
    try {
      const projects = await store.listProjects();
      return c.json(projects);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/api/canvas", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
      const name = body.name;
      if (!name || typeof name !== "string") {
        return c.json({ error: "name is required" }, 400);
      }
      const project = await store.createProject(name);
      return c.json(project);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.delete("/api/canvas/:id", async (c) => {
    try {
      const ok = await store.deleteProject(c.req.param("id"));
      if (!ok) return c.json({ error: "Project not found" }, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.patch("/api/canvas/:id", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
      const name = body.name;
      if (!name || typeof name !== "string") {
        return c.json({ error: "name is required" }, 400);
      }
      const ok = await store.renameProject(c.req.param("id"), name);
      if (!ok) return c.json({ error: "Project not found" }, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/canvas/:id/images", async (c) => {
    try {
      const images = await store.getImages(c.req.param("id"));
      return c.json(images);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/canvas/:id/images/:imageId", async (c) => {
    try {
      const buf = await store.getImageBlob(c.req.param("id"), c.req.param("imageId"));
      if (!buf) return c.json({ error: "Image not found" }, 404);
      return c.body(new Uint8Array(buf), 200, { "Content-Type": "image/png" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/canvas/:id/images/:imageId/thumbnail", async (c) => {
    try {
      const buf = await store.getImageThumbnail(c.req.param("id"), c.req.param("imageId"));
      if (!buf) return c.json({ error: "Thumbnail not found" }, 404);
      return c.body(new Uint8Array(buf), 200, { "Content-Type": "image/jpeg" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/api/canvas/:id/images", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        imageBase64?: unknown;
        [key: string]: unknown;
      };
      const { imageBase64, ...meta } = body;
      if (!imageBase64 || typeof imageBase64 !== "string") {
        return c.json({ error: "imageBase64 is required" }, 400);
      }
      const imageBuf = Buffer.from(imageBase64, "base64");
      const thumbBuf = await thumbnails.make(imageBuf);
      const result = await store.addImage(c.req.param("id"), {
        ...(meta as {
          id: string;
          x: number;
          y: number;
          width: number;
          height: number;
        }),
        image: imageBuf,
        thumbnail: thumbBuf,
      });
      return c.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.patch("/api/canvas/:id/images/:imageId", async (c) => {
    try {
      // Position update or complete pregen
      const body = (await c.req.json().catch(() => ({}))) as {
        x?: unknown;
        y?: unknown;
        imageBase64?: unknown;
        genConfig?: unknown;
        prompt?: unknown;
        negativePrompt?: unknown;
        model?: unknown;
        seed?: unknown;
        sampler?: unknown;
        steps?: unknown;
        cfg?: unknown;
        loras?: unknown;
      };
      const { x, y, imageBase64, genConfig, prompt, negativePrompt, model, seed, sampler, steps, cfg, loras } =
        body;
      if (imageBase64) {
        if (typeof imageBase64 !== "string") {
          return c.json({ error: "imageBase64 is required" }, 400);
        }
        // Complete pregen
        const imageBuf = Buffer.from(imageBase64, "base64");
        const thumbBuf = await thumbnails.make(imageBuf);
        const ok = await store.completePregenPreview(
          c.req.param("id"),
          c.req.param("imageId"),
          imageBuf,
          thumbBuf,
          { genConfig, prompt, negativePrompt, model, seed, sampler, steps, cfg, loras },
        );
        if (!ok) return c.json({ error: "Image not found" }, 404);
        return c.json({ ok: true });
      } else if (typeof x === "number" && typeof y === "number") {
        const ok = await store.updateImagePosition(
          c.req.param("id"),
          c.req.param("imageId"),
          x,
          y,
        );
        if (!ok) return c.json({ error: "Image not found" }, 404);
        return c.json({ ok: true });
      } else {
        return c.json(
          { error: "Provide { x, y } for position or imageBase64 for complete" },
          400,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.delete("/api/canvas/:id/images/:imageId", async (c) => {
    try {
      const ok = await store.deleteImage(c.req.param("id"), c.req.param("imageId"));
      if (!ok) return c.json({ error: "Image not found" }, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/api/canvas/:id/pregen", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        x?: unknown;
        y?: unknown;
        width?: unknown;
        height?: unknown;
      };
      const { x, y, width, height } = body;
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        typeof width !== "number" ||
        typeof height !== "number"
      ) {
        return c.json({ error: "x, y, width, height are required numbers" }, 400);
      }
      const image = await store.addPregenPreview(c.req.param("id"), x, y, width, height);
      return c.json(image);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/api/canvas/:id/pregen/:imageId/complete", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        imageBase64?: unknown;
        genConfig?: unknown;
        prompt?: unknown;
        negativePrompt?: unknown;
        model?: unknown;
        seed?: unknown;
        sampler?: unknown;
        steps?: unknown;
        cfg?: unknown;
        loras?: unknown;
      };
      const { imageBase64, genConfig, prompt, negativePrompt, model, seed, sampler, steps, cfg, loras } =
        body;
      if (!imageBase64 || typeof imageBase64 !== "string") {
        return c.json({ error: "imageBase64 is required" }, 400);
      }
      const imageBuf = Buffer.from(imageBase64, "base64");
      const thumbBuf = await thumbnails.make(imageBuf);
      const ok = await store.completePregenPreview(
        c.req.param("id"),
        c.req.param("imageId"),
        imageBuf,
        thumbBuf,
        { genConfig, prompt, negativePrompt, model, seed, sampler, steps, cfg, loras },
      );
      if (!ok) return c.json({ error: "Image not found" }, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/api/canvas/:id/pregen/:imageId/fail", async (c) => {
    try {
      const ok = await store.failPregenPreview(c.req.param("id"), c.req.param("imageId"));
      if (!ok) return c.json({ error: "Image not found" }, 404);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/canvas/:id/viewport", async (c) => {
    try {
      const viewport = await store.loadViewport(c.req.param("id"));
      return c.json(viewport);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.put("/api/canvas/:id/viewport", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        x?: unknown;
        y?: unknown;
        zoom?: unknown;
      };
      const { x, y, zoom } = body;
      if (typeof x !== "number" || typeof y !== "number" || typeof zoom !== "number") {
        return c.json({ error: "x, y, zoom are required numbers" }, 400);
      }
      await store.saveViewport(c.req.param("id"), x, y, zoom);
      return c.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  return app;
}
