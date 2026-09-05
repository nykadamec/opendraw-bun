// LoRA routy – kontrakt se starým proxy `index.ts` (F5) + doplnění F5:
//
//   GET  /api/loras/enrich?file=<name>&apiKey=&model=a,b
//     → { file, byHash, byName, baseModel, baseModelSource, local }
//        { file, byHash, byName } 1:1 se starým proxy (frontend kompatibilní).
//        Nově: `baseModel` (string|null) – pro jaký base model LoRA patří –
//        priorita: lokální hlavička → CivitAI by-hash → CivitAI by-name →
//        CivArchive. `local` = lokální metadata { triggerWords, name?, baseModel? }
//        nebo null když soubor lokálně není. Jen čtení/metadata, žádná generace.
//        File cache hit/miss v .loracache (cache jen když není filtr `model`).
//        Průběh: cache → lokální metadata + hash (CivitAI by-hash) →
//        CivArchive→modelId → CivitAI by-name → retry bez noise slov →
//        promote shody na 1. místo → resolve baseModel.
//   POST /api/loras/clear-cache → { deleted }
//   GET  /api/lora-metadata?file=<name> → { triggerWords, name?, baseModel? }
//     chyby 1:1: 400 bez file, 404 bez modelsDir, 415 jiná přípona.

import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import { findLoraFile } from "../services/lora/lora-files.js";
import {
  computeFileHash,
  detectLocalMetadata,
  getLoraMetadata,
} from "../services/lora/lora-metadata.js";
import {
  clearEnrichmentCache,
  getCachedEnrichment,
  setCachedEnrichment,
} from "../services/lora/lora-cache.js";
import type { EnrichBaseModelSource } from "../services/lora/lora-cache.js";
import {
  searchByHash,
  searchByModelId,
  searchByName,
} from "../services/lora/civitai-client.js";
import { searchByCivArchive } from "../services/lora/civarchive-client.js";
import type { CivArchiveHit } from "../services/lora/civarchive-client.js";

export function lorasRoutes(config: ServerConfig): Hono {
  const app = new Hono();

  app.get("/api/loras/enrich", async (c) => {
    try {
      const fileName = String(c.req.query("file") || "").trim();
      const apiKeyRaw = String(c.req.query("apiKey") || "").trim();
      const apiKey = apiKeyRaw || undefined;
      const modelParam = String(c.req.query("model") || "").trim();
      const models = modelParam
        ? modelParam
            .split(",")
            .filter(Boolean)
            .map((m) => m.trim())
        : undefined;
      if (!fileName) return c.json({ error: "Chybí parametr file" }, 400);

      const modelsDir = config.modelsDir;

      // Try cache first (only when not filtering by model)
      if (modelsDir && (!models || models.length === 0)) {
        const cached = await getCachedEnrichment(modelsDir, fileName);
        if (cached) {
          return c.json(cached);
        }
      }

      let hashResult = null;
      const fullPath = modelsDir ? await findLoraFile(modelsDir, fileName) : null;

      // Lokální metadata (trigger words + base model z hlavičky) – best-effort,
      // nikdy nehází. Slouží jako primární zdroj baseModel.
      const local = modelsDir ? await detectLocalMetadata(modelsDir, fileName) : null;

      if (fullPath) {
        const hash = await computeFileHash(fullPath);
        if (hash) {
          hashResult = await searchByHash(hash, apiKey);
        }
      }

      const searchName = fileName
        .replace(/\.safetensors$/, "")
        .replace(/\.ckpt$/, "")
        .replace(/[_-]/g, " ")
        .trim();
      let searchResults: any[] = [];
      let civHit: CivArchiveHit | null = null;

      // Primary: try CivArchive → model by ID
      if (searchName) {
        civHit = await searchByCivArchive(searchName, models);
        if (civHit) {
          const modelById = await searchByModelId(civHit.model_id, apiKey);
          if (modelById) {
            searchResults = [modelById];
          }
        }
      }

      // Fallback: search CivitAI by name
      if (searchResults.length === 0 && searchName) {
        searchResults = await searchByName(searchName, apiKey, models);
      }

      // Second chance: trim noise words and retry if still no good match
      if (searchResults.length > 0 && !hashResult) {
        const queryWords = searchName.toLowerCase().split(/\s+/).filter(Boolean);
        const topScore = Math.max(
          ...searchResults.map((m: any) => {
            const n = (m.name ?? "").toLowerCase();
            return queryWords.filter((w) => n.includes(w)).length;
          }),
        );
        if (topScore === 0) {
          const cleaned = queryWords
            .filter((w) => !["lora", "f16", "f32", "v1", "v2", "v3", "safetensors", "ckpt"].includes(w))
            .join(" ");
          if (cleaned && cleaned !== searchName) {
            const retryResults = await searchByName(cleaned, apiKey, models);
            if (retryResults.length > 0) searchResults = retryResults;
          }
        }
      }

      // Promote matching models in byName to first position
      if (searchResults.length > 0) {
        if (hashResult) {
          // Exact by hash — prefer model with matching id
          const hashMatchIdx = searchResults.findIndex((m: any) => m.id === hashResult.modelId);
          if (hashMatchIdx > 0) {
            const [match] = searchResults.splice(hashMatchIdx, 1);
            searchResults.unshift(match);
          }
        } else {
          // No hash match — prefer model whose name has most word overlap with the filename
          const queryWords = searchName.toLowerCase().split(/\s+/).filter(Boolean);
          if (queryWords.length > 0) {
            const scored = searchResults.map((m: any) => {
              const modelName = (m.name ?? "").toLowerCase();
              const score = queryWords.filter((w) => modelName.includes(w)).length;
              return { m, score };
            });
            scored.sort((a: any, b: any) => b.score - a.score);
            searchResults = scored.map((s: any) => s.m);
          }
        }
      }

      // Base model – priorita: lokální hlavička → CivitAI by-hash →
      // CivitAI by-name (první verze prvního modelu) → CivArchive hit.
      let baseModel: string | null = null;
      let baseModelSource: EnrichBaseModelSource = null;
      if (local?.baseModel) {
        baseModel = local.baseModel;
        baseModelSource = "local";
      } else if (
        hashResult &&
        typeof (hashResult as { baseModel?: unknown }).baseModel === "string" &&
        (hashResult as { baseModel: string }).baseModel.trim()
      ) {
        baseModel = (hashResult as { baseModel: string }).baseModel.trim();
        baseModelSource = "civitai-hash";
      } else {
        const firstVersion = searchResults[0]?.modelVersions?.[0];
        if (
          firstVersion &&
          typeof firstVersion.baseModel === "string" &&
          firstVersion.baseModel.trim()
        ) {
          baseModel = firstVersion.baseModel.trim();
          baseModelSource = "civitai-name";
        } else if (civHit?.base_model) {
          baseModel = civHit.base_model;
          baseModelSource = "civarchive";
        }
      }

      const result = {
        file: fileName,
        byHash: hashResult,
        byName: searchResults,
        baseModel,
        baseModelSource,
        local,
      };

      // Save to cache (only when not filtering by model)
      if (modelsDir && (!models || models.length === 0)) {
        await setCachedEnrichment(modelsDir, fileName, result);
      }

      return c.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/api/loras/clear-cache", async (c) => {
    try {
      const modelsDir = config.modelsDir;
      if (!modelsDir) {
        return c.json({ deleted: 0 });
      }
      const deleted = await clearEnrichmentCache(modelsDir);
      return c.json({ deleted });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/lora-metadata", async (c) => {
    const file = String(c.req.query("file") ?? "").trim();
    if (!file) {
      return c.json({ error: "Chybí parametr file." }, 400);
    }
    if (!config.modelsDir) {
      return c.json(
        { error: "Models adresář nenalezen. Nastav MODELS_DIR." },
        404,
      );
    }
    if (!file.endsWith(".safetensors") && !file.endsWith(".ckpt")) {
      return c.json(
        { error: "Trigger words jsou dostupné jen pro .safetensors nebo .ckpt soubory." },
        415,
      );
    }
    try {
      const meta = await getLoraMetadata(config.modelsDir, file);
      return c.json(meta);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if ((err as { code?: string })?.code === "ENOENT" || msg.startsWith("Soubor nenalezen")) {
        return c.json({ error: `Soubor nenalezen: ${file}` }, 404);
      }
      console.error(`lora-metadata selhalo: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  });

  return app;
}
