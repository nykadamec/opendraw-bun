// GalleryStore – galerie (soubory + JSON metadata) nad DATA_DIR (F2).
//
// Port starého `proxy/src/gallery-store.ts` 1:1 (tvary entry, řazení,
// multi-ext mazání, sync stats). Jediná změna: kořenový adresář se nepředává
// přes `~/Pictures/Opendraw`, ale přes konstruktor z `config.dataDir`
// (jeden zdroj konfigurace, žádné absolutní cesty v kódu).
// Rozložení: `<root>/images/`, `<root>/metadata/` – stejné jako ve starém.

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const IMAGE_EXT = ".png";
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

export interface GalleryEntry {
  id: string;
  filename: string;
  createdAt: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  seed: number;
  source: "generated" | "imported";
  sampler?: string;
  steps?: number;
  cfg?: number;
  loras?: { file: string; weight: number }[];
  shift?: number;
  clipSkip?: number;
  seedMode?: number;
  resolutionDependentShift?: boolean;
  upscaler?: string;
  upscalerScaleFactor?: number;
  strength?: number;
  stochasticSamplingGamma?: number;
  cfgZeroStar?: boolean;
  hiresFix?: boolean;
  hiresFixWidth?: number;
  hiresFixHeight?: number;
  hiresFixStrength?: number;
  generationConfig?: Record<string, unknown>;
}

export interface GalleryStats {
  imagesSize: number;
  metadataSize: number;
  totalSize: number;
  imageCount: number;
  metadataCount: number;
}

export class GalleryStore {
  private readonly imagesDir: string;
  private readonly metadataDir: string;

  constructor(rootDir: string) {
    this.imagesDir = path.join(rootDir, "images");
    this.metadataDir = path.join(rootDir, "metadata");
  }

  async ensureDirs(): Promise<void> {
    await fs.mkdir(this.imagesDir, { recursive: true });
    await fs.mkdir(this.metadataDir, { recursive: true });
  }

  private ensureDirsSync(): void {
    fsSync.mkdirSync(this.imagesDir, { recursive: true });
    fsSync.mkdirSync(this.metadataDir, { recursive: true });
  }

  async list(): Promise<GalleryEntry[]> {
    await this.ensureDirs();
    const entries: GalleryEntry[] = [];
    try {
      const files = await fs.readdir(this.metadataDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = await fs.readFile(path.join(this.metadataDir, file), "utf-8");
        entries.push(JSON.parse(content));
      }
    } catch {}
    return entries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async save(
    id: string,
    imageBuffer: Buffer,
    metadata: Omit<GalleryEntry, "id" | "filename" | "createdAt">,
  ): Promise<void> {
    await this.ensureDirs();
    const filename = `${id}${IMAGE_EXT}`;
    const entry: GalleryEntry = {
      id,
      filename,
      createdAt: new Date().toISOString(),
      ...metadata,
    };
    await fs.writeFile(path.join(this.imagesDir, filename), imageBuffer);
    await fs.writeFile(
      path.join(this.metadataDir, `${id}.json`),
      JSON.stringify(entry, null, 2),
    );
  }

  async getImage(id: string): Promise<Buffer | null> {
    try {
      const imagePath = path.join(this.imagesDir, `${id}${IMAGE_EXT}`);
      const img = await fs.readFile(imagePath);
      console.log(`[gallery] Loaded image ${id}: ${img.length} bytes from ${imagePath}`);
      return img;
    } catch {
      console.error(`[gallery] Failed to load image ${id}: not found`);
      return null;
    }
  }

  async getMetadata(id: string): Promise<GalleryEntry | null> {
    try {
      const content = await fs.readFile(path.join(this.metadataDir, `${id}.json`), "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async deleteEntry(id: string): Promise<boolean> {
    const metaPath = path.join(this.metadataDir, `${id}.json`);

    const tryUnlink = async (
      filePath: string,
      kind: "image" | "metadata",
    ): Promise<boolean> => {
      try {
        await fs.unlink(filePath);
        console.log(`[gallery] Deleted ${kind} ${filePath}`);
        return true;
      } catch (err: unknown) {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          console.log(`[gallery] ${kind} ${filePath} already absent`);
          return true;
        }
        console.error(`[gallery] Failed to delete ${kind} ${filePath}:`, err);
        return false;
      }
    };

    let imageOk = true;
    let anyImageFound = false;
    for (const ext of IMAGE_EXTS) {
      const imagePath = path.join(this.imagesDir, `${id}${ext}`);
      const ok = await tryUnlink(imagePath, "image");
      if (ok) anyImageFound = true;
      else imageOk = false;
    }
    if (!anyImageFound) {
      console.log(`[gallery] No image file found for ${id} (tried ${IMAGE_EXTS.join(", ")})`);
    }

    const metaOk = await tryUnlink(metaPath, "metadata");

    return imageOk && metaOk;
  }

  getStats(): GalleryStats {
    this.ensureDirsSync();
    const imagesSize = getDirSizeSync(this.imagesDir);
    const metadataSize = getDirSizeSync(this.metadataDir);
    let imageCount = 0;
    let metadataCount = 0;
    try {
      imageCount = fsSync.readdirSync(this.imagesDir).length;
    } catch {}
    try {
      metadataCount = fsSync.readdirSync(this.metadataDir).length;
    } catch {}
    return {
      imagesSize,
      metadataSize,
      totalSize: imagesSize + metadataSize,
      imageCount,
      metadataCount,
    };
  }

  async clean(type: "all" | "images" | "metadata"): Promise<{ deleted: number }> {
    let deleted = 0;
    if (type === "all" || type === "images") {
      const files = await fs.readdir(this.imagesDir).catch(() => []);
      for (const f of files) {
        await fs.unlink(path.join(this.imagesDir, f)).catch(() => {});
        deleted++;
      }
    }
    if (type === "all" || type === "metadata") {
      const files = await fs.readdir(this.metadataDir).catch(() => []);
      for (const f of files) {
        await fs.unlink(path.join(this.metadataDir, f)).catch(() => {});
        deleted++;
      }
    }
    return { deleted };
  }
}

function getDirSizeSync(dir: string): number {
  let total = 0;
  try {
    const entries = fsSync.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        total += fsSync.statSync(full).size;
      } else if (entry.isDirectory()) {
        total += getDirSizeSync(full);
      }
    }
  } catch {}
  return total;
}

export function createGalleryStore(rootDir: string): GalleryStore {
  return new GalleryStore(rootDir);
}
