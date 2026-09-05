// LoRA enrich cache – port proxy/src/lora-cache.ts (F5).
//
// File-based cache v `<modelsDir>/.loracache/<md5(fileName)>.json`.
// Invalidace přes mtime+size, best-effort (silent fail).
// Rozšíření proti starému kódu (doplnění F5): result nese i `baseModel`,
// `baseModelSource` a `local` metadata. Záznamy bez klíče `baseModel`
// (stará verze) se berou jako stale → miss a přepočet.

import { promises as fs } from "node:fs";
import type { Stats } from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";

const CACHE_DIR = ".loracache";

export type EnrichBaseModelSource =
  | "local"
  | "civitai-hash"
  | "civitai-name"
  | "civarchive"
  | null;

interface CacheEntry {
  result: {
    file: string;
    byHash: unknown;
    byName: unknown[];
    baseModel: string | null;
    baseModelSource: EnrichBaseModelSource;
    local: unknown;
  };
  cachedAt: number;
  fileMtimeMs: number;
  fileSize: number;
}

function cacheKey(fileName: string): string {
  return crypto.createHash("md5").update(fileName).digest("hex");
}

export async function getCachedEnrichment(
  modelsDir: string,
  fileName: string,
): Promise<CacheEntry["result"] | null> {
  try {
    const cacheDir = path.join(modelsDir, CACHE_DIR);
    const cacheFile = path.join(cacheDir, `${cacheKey(fileName)}.json`);

    const [cacheRaw, fileStat] = await Promise.all([
      fs.readFile(cacheFile, "utf-8").catch(() => null),
      fs.stat(path.join(modelsDir, "loras", fileName)).catch(() =>
        fs.stat(path.join(modelsDir, fileName)).catch(() => null),
      ),
    ]);

    if (!cacheRaw) return null;

    const entry: CacheEntry = JSON.parse(cacheRaw);

    // Záznam ze staré verze bez baseModel → stale, přepočítat.
    if (!entry.result || !("baseModel" in entry.result)) return null;

    // If file is gone, cache is stale
    if (!fileStat) return null;

    // If file changed (mtime or size differs), cache is stale
    if (entry.fileMtimeMs !== fileStat.mtimeMs || entry.fileSize !== fileStat.size) {
      return null;
    }

    return entry.result;
  } catch {
    return null;
  }
}

export async function setCachedEnrichment(
  modelsDir: string,
  fileName: string,
  result: CacheEntry["result"],
): Promise<void> {
  try {
    const cacheDir = path.join(modelsDir, CACHE_DIR);

    let fileStat: Stats | null = null;
    try {
      fileStat = await fs.stat(path.join(modelsDir, "loras", fileName));
    } catch {
      try {
        fileStat = await fs.stat(path.join(modelsDir, fileName));
      } catch {}
    }

    await fs.mkdir(cacheDir, { recursive: true });

    const entry: CacheEntry = {
      result,
      cachedAt: Date.now(),
      fileMtimeMs: fileStat?.mtimeMs ?? 0,
      fileSize: fileStat?.size ?? 0,
    };

    const cacheFile = path.join(cacheDir, `${cacheKey(fileName)}.json`);
    await fs.writeFile(cacheFile, JSON.stringify(entry), "utf-8");
  } catch {
    // Silent fail — cache is best-effort
  }
}

export async function clearEnrichmentCache(modelsDir: string): Promise<number> {
  try {
    const cacheDir = path.join(modelsDir, CACHE_DIR);
    let deleted = 0;
    try {
      const files = await fs.readdir(cacheDir);
      for (const f of files) {
        if (f.endsWith(".json")) {
          await fs.unlink(path.join(cacheDir, f));
          deleted++;
        }
      }
    } catch {}
    return deleted;
  } catch {
    return 0;
  }
}
