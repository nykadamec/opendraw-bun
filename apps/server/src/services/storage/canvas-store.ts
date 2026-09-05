// CanvasStore – per-canvas sqlite přes DbProvider (F2).
//
// Port starého `proxy/src/canvas-store.ts` (better-sqlite3) na `bun:sqlite`
// za `DbProvider` interfacem. Schéma, typy i chování 1:1:
//  - jeden `.sqlite3` soubor na canvas v `<canvasesDir>/<id>.sqlite3`
//  - zápisové handlery v poolu (singleton na canvas id), čtení přes
//    efemérní readonly handler (stejně jako staré open/close na každou operaci)
//  - WAL + busy_timeout nastavuje provider při open
//  - BLOB sloupce (bun:sqlite `Uint8Array`) se normalizují na Buffer
//  - thumbnail pipeline přes ThumbnailProvider (stejné parametry)

import fs from "node:fs";
import path from "node:path";
import { v4 as uuid } from "uuid";
import {
  getDefaultDbProvider,
  toBuffer,
  type DbHandle,
  type DbProvider,
} from "./db-provider.js";
import {
  generateThumbnail,
  getThumbnailProvider,
  type ThumbnailProvider,
} from "./thumbnail.js";

// ── Types ────────────────────────────────────────────────────────────────

export interface CanvasProjectInfo {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
}

export interface CanvasImage {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string;
  negativePrompt: string;
  model: string;
  seed: number;
  sampler: string;
  steps: number;
  cfg: number;
  loras: string;
  generationConfig: string;
  status: "pending" | "generating" | "completed" | "failed";
  createdAt: string;
}

export interface AddCanvasImageInput {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: Buffer;
  thumbnail?: Buffer;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
  sampler?: string;
  steps?: number;
  cfg?: number;
  loras?: string;
  generationConfig?: string;
  status?: "pending" | "generating" | "completed" | "failed";
}

// ── Internal row types ───────────────────────────────────────────────────

interface MetaRow {
  key: string;
  value: string;
}

interface ValueRow {
  value: string;
}

interface ImageMetaRow {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string;
  negative_prompt: string;
  model: string;
  seed: number;
  sampler: string;
  steps: number;
  cfg: number;
  loras: string;
  generation_config: string;
  status: string;
  created_at: string;
}

interface ImageBlobRow {
  image: Uint8Array | Buffer;
}

interface ThumbnailBlobRow {
  thumbnail: Uint8Array | Buffer | null;
}

interface CountRow {
  c: number;
}

// ── Schema (1:1 se starým) ───────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  image BLOB NOT NULL,
  thumbnail BLOB,
  prompt TEXT DEFAULT '',
  negative_prompt TEXT DEFAULT '',
  model TEXT DEFAULT '',
  seed INTEGER DEFAULT 0,
  sampler TEXT DEFAULT '',
  steps INTEGER DEFAULT 0,
  cfg REAL DEFAULT 0,
  loras TEXT DEFAULT '[]',
  generation_config TEXT DEFAULT '{}',
  status TEXT DEFAULT 'completed',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_canvas ON images(id);
`;

function imageMetaRowToCanvasImage(row: ImageMetaRow): CanvasImage {
  return {
    id: row.id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    model: row.model,
    seed: row.seed,
    sampler: row.sampler,
    steps: row.steps,
    cfg: row.cfg,
    loras: row.loras,
    generationConfig: row.generation_config,
    status: row.status as CanvasImage["status"],
    createdAt: row.created_at,
  };
}

// ── Store ────────────────────────────────────────────────────────────────

export class CanvasStore {
  private readonly writeHandles = new Map<string, DbHandle>();

  constructor(
    private readonly canvasesDir: string,
    private readonly db: DbProvider = getDefaultDbProvider(),
    private readonly thumbnails: ThumbnailProvider = getThumbnailProvider(),
  ) {}

  async ensureCanvasesDir(): Promise<void> {
    fs.mkdirSync(this.canvasesDir, { recursive: true });
  }

  /** Zavře všechny poolované zápisové handlery (testy / shutdown). */
  closeAll(): void {
    for (const handle of this.writeHandles.values()) {
      try {
        handle.close();
      } catch {}
    }
    this.writeHandles.clear();
  }

  private dbPath(id: string): string {
    if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
      throw new Error(`Invalid canvas id: ${JSON.stringify(id)}`);
    }
    return path.join(this.canvasesDir, `${id}.sqlite3`);
  }

  private write(id: string): DbHandle {
    let handle = this.writeHandles.get(id);
    if (!handle) {
      fs.mkdirSync(this.canvasesDir, { recursive: true });
      handle = this.db.open(this.dbPath(id), false);
      handle.exec(SCHEMA_SQL);
      this.writeHandles.set(id, handle);
    }
    return handle;
  }

  private read(id: string): DbHandle {
    return this.db.open(this.dbPath(id), true);
  }

  private static setMeta(db: DbHandle, key: string, value: string): void {
    db.run(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  async listProjects(): Promise<CanvasProjectInfo[]> {
    fs.mkdirSync(this.canvasesDir, { recursive: true });
    const projects: CanvasProjectInfo[] = [];

    let files: string[];
    try {
      files = fs.readdirSync(this.canvasesDir);
    } catch {
      return [];
    }

    for (const file of files) {
      if (!file.endsWith(".sqlite3")) continue;
      const id = file.replace(".sqlite3", "");
      const db = this.read(id);
      try {
        const nameRow = db.get<ValueRow>("SELECT value FROM meta WHERE key = 'name'");
        const createdAtRow = db.get<ValueRow>("SELECT value FROM meta WHERE key = 'created_at'");
        const updatedAtRow = db.get<ValueRow>("SELECT value FROM meta WHERE key = 'updated_at'");
        const countRow = db.get<CountRow>("SELECT COUNT(*) as c FROM images");

        projects.push({
          id,
          name: nameRow?.value ?? id,
          createdAt: createdAtRow?.value ?? new Date().toISOString(),
          updatedAt: updatedAtRow?.value ?? new Date().toISOString(),
          imageCount: countRow?.c ?? 0,
        });
      } catch {
        // Skip unreadable databases
      } finally {
        try {
          db.close();
        } catch {}
      }
    }

    return projects.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async createProject(name: string): Promise<CanvasProjectInfo> {
    fs.mkdirSync(this.canvasesDir, { recursive: true });
    const id = uuid();
    const now = new Date().toISOString();

    const db = this.write(id);
    CanvasStore.setMeta(db, "name", name);
    CanvasStore.setMeta(db, "created_at", now);
    CanvasStore.setMeta(db, "updated_at", now);
    CanvasStore.setMeta(db, "viewport_x", "0");
    CanvasStore.setMeta(db, "viewport_y", "0");
    CanvasStore.setMeta(db, "viewport_zoom", "1");

    return { id, name, createdAt: now, updatedAt: now, imageCount: 0 };
  }

  async deleteProject(id: string): Promise<boolean> {
    const handle = this.writeHandles.get(id);
    if (handle) {
      try {
        handle.close();
      } catch {}
      this.writeHandles.delete(id);
    }
    const dbPath = this.dbPath(id);
    try {
      fs.unlinkSync(dbPath);
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        try {
          fs.unlinkSync(`${dbPath}${suffix}`);
        } catch {}
      }
      return true;
    } catch {
      return false;
    }
  }

  async renameProject(id: string, name: string): Promise<boolean> {
    try {
      const db = this.write(id);
      // Staré chování: rename na neexistujícím canvasu soubor vyrobil.
      // Zachováno 1:1 (pool + open s create).
      db.exec(SCHEMA_SQL);
      const now = new Date().toISOString();
      CanvasStore.setMeta(db, "name", name);
      CanvasStore.setMeta(db, "updated_at", now);
      return true;
    } catch {
      return false;
    }
  }

  async getImages(id: string): Promise<CanvasImage[]> {
    const db = this.read(id);
    try {
      const rows = db.all<ImageMetaRow>(
        "SELECT id, x, y, width, height, prompt, negative_prompt, model, seed, sampler, steps, cfg, loras, generation_config, status, created_at FROM images",
      );
      return rows.map(imageMetaRowToCanvasImage);
    } finally {
      try {
        db.close();
      } catch {}
    }
  }

  async getImageBlob(canvasId: string, imageId: string): Promise<Buffer | null> {
    try {
      const db = this.read(canvasId);
      try {
        const row = db.get<ImageBlobRow>("SELECT image FROM images WHERE id = ?", imageId);
        if (!row) return null;
        return toBuffer(row.image);
      } finally {
        try {
          db.close();
        } catch {}
      }
    } catch {
      return null;
    }
  }

  async getImageThumbnail(canvasId: string, imageId: string): Promise<Buffer | null> {
    try {
      const db = this.read(canvasId);
      try {
        const row = db.get<ThumbnailBlobRow>(
          "SELECT thumbnail FROM images WHERE id = ?",
          imageId,
        );
        if (!row || !row.thumbnail) return null;
        return toBuffer(row.thumbnail);
      } finally {
        try {
          db.close();
        } catch {}
      }
    } catch {
      return null;
    }
  }

  async addImage(canvasId: string, data: AddCanvasImageInput): Promise<CanvasImage> {
    const db = this.write(canvasId);
    db.exec(SCHEMA_SQL);
    const now = new Date().toISOString();
    const status = data.status ?? "completed";

    // Generate thumbnail if not provided and image has content
    let thumbnail: Buffer | null = data.thumbnail ?? null;
    if (!thumbnail && data.image.length > 0) {
      thumbnail = await this.thumbnails.generate(data.image);
    }

    db.run(
      `INSERT INTO images (id, x, y, width, height, image, thumbnail, prompt, negative_prompt, model, seed, sampler, steps, cfg, loras, generation_config, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.id,
      data.x,
      data.y,
      data.width,
      data.height,
      data.image,
      thumbnail,
      data.prompt ?? "",
      data.negativePrompt ?? "",
      data.model ?? "",
      data.seed ?? 0,
      data.sampler ?? "",
      data.steps ?? 0,
      data.cfg ?? 0,
      data.loras ?? "[]",
      data.generationConfig ?? "{}",
      status,
      now,
    );

    CanvasStore.setMeta(db, "updated_at", now);

    return {
      id: data.id,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      prompt: data.prompt ?? "",
      negativePrompt: data.negativePrompt ?? "",
      model: data.model ?? "",
      seed: data.seed ?? 0,
      sampler: data.sampler ?? "",
      steps: data.steps ?? 0,
      cfg: data.cfg ?? 0,
      loras: data.loras ?? "[]",
      generationConfig: data.generationConfig ?? "{}",
      status,
      createdAt: now,
    };
  }

  async updateImagePosition(
    canvasId: string,
    imageId: string,
    x: number,
    y: number,
  ): Promise<boolean> {
    try {
      const db = this.write(canvasId);
      const result = db.run("UPDATE images SET x = ?, y = ? WHERE id = ?", x, y, imageId);
      if (result.changes > 0) {
        CanvasStore.setMeta(db, "updated_at", new Date().toISOString());
      }
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  async deleteImage(canvasId: string, imageId: string): Promise<boolean> {
    try {
      const db = this.write(canvasId);
      const result = db.run("DELETE FROM images WHERE id = ?", imageId);
      if (result.changes > 0) {
        CanvasStore.setMeta(db, "updated_at", new Date().toISOString());
      }
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  async addPregenPreview(
    canvasId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<CanvasImage> {
    const id = uuid();
    const now = new Date().toISOString();

    const db = this.write(canvasId);
    db.exec(SCHEMA_SQL);
    db.run(
      `INSERT INTO images (id, x, y, width, height, image, thumbnail, prompt, negative_prompt, model, seed, sampler, steps, cfg, loras, generation_config, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', 0, '', 0, 0, '[]', '{}', 'pending', ?)`,
      id,
      x,
      y,
      width,
      height,
      Buffer.alloc(0),
      null,
      now,
    );

    CanvasStore.setMeta(db, "updated_at", now);

    return {
      id,
      x,
      y,
      width,
      height,
      prompt: "",
      negativePrompt: "",
      model: "",
      seed: 0,
      sampler: "",
      steps: 0,
      cfg: 0,
      loras: "[]",
      generationConfig: "{}",
      status: "pending",
      createdAt: now,
    };
  }

  async completePregenPreview(
    canvasId: string,
    imageId: string,
    imageBlob: Buffer,
    thumbnailBlob: Buffer,
    genConfig: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const db = this.write(canvasId);
      const now = new Date().toISOString();
      const configJson = JSON.stringify(genConfig);

      // Generate a fresh thumbnail from the actual image
      const thumbnail = await this.thumbnails.generate(imageBlob);
      const finalThumbnail = thumbnail ?? thumbnailBlob;

      const result = db.run(
        `UPDATE images SET
          image = ?,
          thumbnail = ?,
          status = 'completed',
          generation_config = ?,
          width = ?,
          height = ?
        WHERE id = ?`,
        imageBlob,
        finalThumbnail,
        configJson,
        // Store width/height from the actual image if available in config
        typeof genConfig.width === "number" ? genConfig.width : 0,
        typeof genConfig.height === "number" ? genConfig.height : 0,
        imageId,
      );

      if (result.changes > 0) {
        // Also update generation-related fields from config if present
        const updates: string[] = [];
        const values: (string | number)[] = [];

        if (typeof genConfig.prompt === "string") {
          updates.push("prompt = ?");
          values.push(genConfig.prompt);
        }
        if (typeof genConfig.negative_prompt === "string") {
          updates.push("negative_prompt = ?");
          values.push(genConfig.negative_prompt);
        }
        if (typeof genConfig.model === "string") {
          updates.push("model = ?");
          values.push(genConfig.model);
        }
        if (typeof genConfig.seed === "number") {
          updates.push("seed = ?");
          values.push(genConfig.seed);
        }
        if (typeof genConfig.sampler === "string") {
          updates.push("sampler = ?");
          values.push(genConfig.sampler);
        }
        if (typeof genConfig.steps === "number") {
          updates.push("steps = ?");
          values.push(genConfig.steps);
        }
        if (typeof genConfig.cfg === "number") {
          updates.push("cfg = ?");
          values.push(genConfig.cfg);
        }
        if (typeof genConfig.loras === "string") {
          updates.push("loras = ?");
          values.push(genConfig.loras);
        }

        if (updates.length > 0) {
          values.push(imageId);
          db.run(`UPDATE images SET ${updates.join(", ")} WHERE id = ?`, ...values);
        }

        CanvasStore.setMeta(db, "updated_at", now);
      }

      return result.changes > 0;
    } catch {
      return false;
    }
  }

  async failPregenPreview(canvasId: string, imageId: string): Promise<boolean> {
    try {
      const db = this.write(canvasId);
      const result = db.run("UPDATE images SET status = 'failed' WHERE id = ?", imageId);
      if (result.changes > 0) {
        CanvasStore.setMeta(db, "updated_at", new Date().toISOString());
      }
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  async saveViewport(canvasId: string, x: number, y: number, zoom: number): Promise<void> {
    const db = this.write(canvasId);
    db.exec(SCHEMA_SQL);
    CanvasStore.setMeta(db, "viewport_x", String(x));
    CanvasStore.setMeta(db, "viewport_y", String(y));
    CanvasStore.setMeta(db, "viewport_zoom", String(zoom));
  }

  async loadViewport(canvasId: string): Promise<{ x: number; y: number; zoom: number }> {
    try {
      const db = this.read(canvasId);
      try {
        const xRow = db.get<ValueRow>("SELECT value FROM meta WHERE key = 'viewport_x'");
        const yRow = db.get<ValueRow>("SELECT value FROM meta WHERE key = 'viewport_y'");
        const zoomRow = db.get<ValueRow>(
          "SELECT value FROM meta WHERE key = 'viewport_zoom'",
        );

        return {
          x: xRow ? parseFloat(xRow.value) : 0,
          y: yRow ? parseFloat(yRow.value) : 0,
          zoom: zoomRow ? parseFloat(zoomRow.value) : 1,
        };
      } finally {
        try {
          db.close();
        } catch {}
      }
    } catch {
      return { x: 0, y: 0, zoom: 1 };
    }
  }
}

export function createCanvasStore(
  canvasesDir: string,
  db?: DbProvider,
  thumbnails?: ThumbnailProvider,
): CanvasStore {
  return new CanvasStore(
    canvasesDir,
    db ?? getDefaultDbProvider(),
    thumbnails ?? getThumbnailProvider(),
  );
}

// Umožní `import { generateThumbnail } from "./canvas-store.js"` paritu při
// testech pixel-souladu bez tahání celého storu.
export { generateThumbnail };
