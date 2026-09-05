// ProjectBrowser – DT projekty (sqlite) read-only přímo z Library (F3).
//
// Čte produkční DB přímo z `dtDocsDir` v readonly režimu – žádné snapshoty,
// žádný `VACUUM INTO`, žádný `project-snapshots` adresář. Každé čtení je
// efemérní: otevřít readonly → přečíst → zavřít. Produkční DB se nikdy
// nemění (pouze readonly open, žádný zápis).
//
// Konkurence s běžícím DrawThings:
//  - `DbProvider.open(path, readonly=true)` nastavuje `busy_timeout = 5000`
//    (viz storage/db-provider.ts), takže krátké zámky SQLite přečká uvnitř.
//  - Zbytkové SQLITE_BUSY / SQLITE_LOCKED chyby retryujeme (s logem s ID).
//
// Zachováno 1:1:
//  - sanitizeProjectId (path traversal guard)
//  - thumbnail JPEG carving (FFD8..FFD9) z thumbnailhistorynode
//    joinem tensorhistorynode.rowid → tensorhistorynode__f86.f86
//    → thumbnailhistorynode.__pk0 (legacy rowid=rowid jen fallback)
//  - config (flatbuffers TensorHistoryNode) z tensorhistorynode
//  - routy beze změny (`refresh` parametr se ignoruje – nechán pro kontrakt)

import fs from "node:fs";
import path from "node:path";
import * as flatbuffers from "flatbuffers";
import { TensorHistoryNode } from "@opendraw/protocol/proto/fbs/ts/tensor_history.js";
import { SamplerType } from "@opendraw/protocol/proto/fbs/ts/sampler-type.js";
import {
  getDefaultDbProvider,
  toBuffer,
  type DbProvider,
} from "../storage/db-provider.js";

// Lokální tvary 1:1 s `@opendraw/api-client` ProjectInfo/ProjectEntry/
// ProjectEntryConfig (server nedefinuje workspace závislost – stejně jako
// CanvasStore drží vlastní typy; JSON kontrakt se nemění).

// ── Types (1:1 s api-client, viz import výše) ─────────────────────────────

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  entryCount: number;
}

export interface ProjectEntry {
  id: string;
  projectId: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  seed: number;
  createdAt: string;
  thumbnail: string | null;
}

export interface ProjectEntryConfig {
  prompt: string;
  negativePrompt: string;
  model: string;
  sampler: string;
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
  shift: number;
  clipSkip: number;
  loras: { file: string; weight: number; mode: number }[];
  seedMode: number;
  upscaler: string;
  upscalerScaleFactor: number;
  strength: number;
  stochasticSamplingGamma: number;
  cfgZeroStar: boolean;
  cfgZeroInitSteps: number;
  generated: boolean;
  batchSize: number;
  reason: number;
  hiresFix: boolean;
  hiresFixStartWidth: number;
  hiresFixStartHeight: number;
  hiresFixStrength: number;
  refinerModel: string;
  refinerStart: number;
  numFrames: number;
  maskBlurOutset: number;
  sharpness: number;
  stage2Steps: number;
  stage2Cfg: number;
  stage2Shift: number;
  tiledDecoding: boolean;
  tiledDiffusion: boolean;
  teaCache: boolean;
  teaCacheStart: number;
  teaCacheEnd: number;
  teaCacheThreshold: number;
  generationTime: number;
  clipId: number;
  indexInAClip: number;
  audio: boolean;
  compressionArtifacts: number;
  imageGuidanceScale: number;
  faceRestoration: string;
  maskBlur: number;
  cropTop: number;
  cropLeft: number;
  aestheticScore: number;
  negativeAestheticScore: number;
  preserveOriginalAfterInpaint: boolean;
  t5TextEncoder: boolean;
  separateClipL: boolean;
  clipLText: string;
  separateOpenClipG: boolean;
  openClipGText: string;
  separateT5: boolean;
  t5Text: string;
  causalInferenceEnabled: boolean;
  causalInference: number;
  causalInferencePad: number;
}

// ── Sampler names (1:1 se starým samplers.ts) ────────────────────────────

const SAMPLER_NAMES: Record<number, string> = {
  [SamplerType.DPMPP2MKarras]: "dpmpp_2m_karras",
  [SamplerType.EulerA]: "euler_a",
  [SamplerType.DDIM]: "ddim",
  [SamplerType.PLMS]: "plms",
  [SamplerType.DPMPPSDEKarras]: "dpmpp_sde_karras",
  [SamplerType.UniPC]: "unipc",
  [SamplerType.LCM]: "lcm",
  [SamplerType.EulerASubstep]: "euler_a_substep",
  [SamplerType.DPMPPSDESubstep]: "dpmpp_sde_substep",
  [SamplerType.TCD]: "tcd",
  [SamplerType.EulerATrailing]: "euler_a_trailing",
  [SamplerType.DPMPPSDETrailing]: "dpmpp_sde_trailing",
  [SamplerType.DPMPP2MAYS]: "dpmpp_2m_ays",
  [SamplerType.EulerAAYS]: "euler_a_ays",
  [SamplerType.DPMPPSDEAYS]: "dpmpp_sde_ays",
  [SamplerType.DPMPP2MTrailing]: "dpmpp_2m_trailing",
  [SamplerType.DDIMTrailing]: "ddim_trailing",
  [SamplerType.UniPCTrailing]: "unipc_trailing",
  [SamplerType.UniPCAYS]: "unipc_ays",
  [SamplerType.TCDTrailing]: "tcd_trailing",
};

// ── Guards ───────────────────────────────────────────────────────────────

/** Odmítne path traversal / separátory – volá se před každým použitím id. */
export function sanitizeProjectId(projectId: string): string {
  if (
    !projectId ||
    projectId.includes("/") ||
    projectId.includes("\\") ||
    projectId.includes("\0") ||
    projectId === ".." ||
    projectId.includes("..")
  ) {
    throw new Error(`Invalid project id: "${projectId}"`);
  }
  return projectId;
}

/** Rozpozná zamykací chyby SQLite, u kterých má smysl retry. */
export function isBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked|database is busy|busy/i.test(
    msg,
  );
}

const BUSY_RETRY_ATTEMPTS = 5;
const BUSY_RETRY_BASE_DELAY_MS = 100;

/** Krátký synchronní spánek mezi retry (funguje i v sync handlerech). */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // busy-wait fallback – krátké intervaly (<500ms) jen při retry
    }
  }
}

// ── Flatbuffers parse (1:1 se starým) ────────────────────────────────────

export function parseTensorNode(buf: Buffer): ProjectEntryConfig {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(buf));
  const node = TensorHistoryNode.getRootAsTensorHistoryNode(bb);

  const loras: { file: string; weight: number; mode: number }[] = [];
  const lorasLen = node.lorasLength();
  for (let i = 0; i < lorasLen; i++) {
    const l = node.loras(i);
    if (l) {
      const file = l.file();
      if (file) loras.push({ file, weight: l.weight(), mode: l.mode() });
    }
  }

  return {
    prompt: node.textPrompt() || "",
    negativePrompt: node.negativeTextPrompt() || "",
    model: node.model() || "",
    sampler: SAMPLER_NAMES[node.sampler()] || "unknown",
    steps: node.steps(),
    cfg: node.guidanceScale(),
    seed: node.seed(),
    width: node.targetImageWidth() || node.originalImageWidth() || node.startWidth(),
    height: node.targetImageHeight() || node.originalImageHeight() || node.startHeight(),
    shift: node.shift(),
    clipSkip: node.clipSkip(),
    loras,
    seedMode: node.seedMode() as number,
    upscaler: node.upscaler() || "",
    upscalerScaleFactor: node.upscalerScaleFactor(),
    strength: node.strength(),
    stochasticSamplingGamma: node.stochasticSamplingGamma(),
    cfgZeroStar: node.cfgZeroStar(),
    cfgZeroInitSteps: node.cfgZeroInitSteps(),
    generated: node.generated(),
    batchSize: node.batchSize(),
    reason: node.reason(),
    hiresFix: node.hiresFix(),
    hiresFixStartWidth: node.hiresFixStartWidth(),
    hiresFixStartHeight: node.hiresFixStartHeight(),
    hiresFixStrength: node.hiresFixStrength(),
    refinerModel: node.refinerModel() || "",
    refinerStart: node.refinerStart(),
    numFrames: node.numFrames(),
    maskBlurOutset: node.maskBlurOutset(),
    sharpness: node.sharpness(),
    stage2Steps: node.stage2Steps(),
    stage2Cfg: node.stage2Cfg(),
    stage2Shift: node.stage2Shift(),
    tiledDecoding: node.tiledDecoding(),
    tiledDiffusion: node.tiledDiffusion(),
    teaCache: node.teaCache(),
    teaCacheStart: node.teaCacheStart(),
    teaCacheEnd: node.teaCacheEnd(),
    teaCacheThreshold: node.teaCacheThreshold(),
    generationTime: node.generationTime(),
    clipId: Number(node.clipId()),
    indexInAClip: node.indexInAClip(),
    audio: node.audio(),
    compressionArtifacts: node.compressionArtifacts(),
    imageGuidanceScale: node.imageGuidanceScale(),
    faceRestoration: node.faceRestoration() || "",
    maskBlur: node.maskBlur(),
    cropTop: node.cropTop(),
    cropLeft: node.cropLeft(),
    aestheticScore: node.aestheticScore(),
    negativeAestheticScore: node.negativeAestheticScore(),
    preserveOriginalAfterInpaint: node.preserveOriginalAfterInpaint(),
    t5TextEncoder: node.t5TextEncoder(),
    separateClipL: node.separateClipL(),
    clipLText: node.clipLText() || "",
    separateOpenClipG: node.separateOpenClipG(),
    openClipGText: node.openClipGText() || "",
    separateT5: node.separateT5(),
    t5Text: node.t5Text() || "",
    causalInferenceEnabled: node.causalInferenceEnabled(),
    causalInference: node.causalInference(),
    causalInferencePad: node.causalInferencePad(),
  };
}

// ── Store ────────────────────────────────────────────────────────────────

interface CountRow {
  c: number;
}

interface TensorRow {
  rowid: number;
  p: Uint8Array | Buffer;
}

interface ThumbRow {
  p: Uint8Array | Buffer;
}

export class ProjectBrowser {
  private readonly dtDocsDir: string;
  private readonly db: DbProvider;

  constructor(dtDocsDir: string, db?: DbProvider);
  /** @deprecated snapshot dir se ignoruje – nechán pro zpětnou kompatibilitu */
  constructor(dtDocsDir: string, snapshotsDir: string, db?: DbProvider);
  constructor(
    dtDocsDir: string,
    dbOrSnapshotsDir?: DbProvider | string,
    db?: DbProvider,
  ) {
    this.dtDocsDir = dtDocsDir;
    if (typeof dbOrSnapshotsDir === "string") {
      this.db = db ?? getDefaultDbProvider();
    } else {
      this.db = dbOrSnapshotsDir ?? getDefaultDbProvider();
    }
  }

  /**
   * Retry wrapper pro zamykací chyby (DrawThings právě zapisuje).
   * Každý pokus otevírá vlastní efemérní readonly handle – nikdy se nedrží
   * otevřené spojení. Log vždy s ID projektu. Jiné chyby hází hned.
   */
  private withBusyRetry<T>(projectId: string, op: string, fn: () => T): T {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= BUSY_RETRY_ATTEMPTS; attempt++) {
      try {
        return fn();
      } catch (err) {
        lastErr = err;
        if (!isBusyError(err) || attempt === BUSY_RETRY_ATTEMPTS) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[project-browser] ${op} busy for "${projectId}" (attempt ${attempt}/${BUSY_RETRY_ATTEMPTS}), retrying: ${msg}`,
        );
        sleepSync(BUSY_RETRY_BASE_DELAY_MS * attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** Přímá cesta k produkční DB (readonly open – nikdy zápis). */
  private sourcePath(projectId: string): string {
    const safeId = sanitizeProjectId(projectId);
    return path.join(this.dtDocsDir, `${safeId}.sqlite3`);
  }

  /** Jedno efemérní readonly čtení: otevřít → přečíst → zavřít. */
  private readEntryCount(sourcePath: string): number {
    const db = this.db.open(sourcePath, true);
    try {
      return db.get<CountRow>("SELECT COUNT(*) as c FROM tensorhistorynode")?.c ?? 0;
    } finally {
      try {
        db.close();
      } catch {}
    }
  }

  async listProjects(_refresh = false): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];
    try {
      let names: string[];
      try {
        names = fs.readdirSync(this.dtDocsDir).filter((f) => f.endsWith(".sqlite3"));
      } catch (err) {
        console.error(
          "[project-browser] listProjects: cannot read documents dir:",
          err instanceof Error ? err.message : String(err),
        );
        return [];
      }
      for (const name of names) {
        const fullPath = path.join(this.dtDocsDir, name);
        const id = name.replace(/\.sqlite3$/, "");
        let count = 0;
        try {
          count = this.withBusyRetry(id, "listProjects", () =>
            this.readEntryCount(fullPath),
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[project-browser] listProjects: count failed for "${id}": ${msg}`);
        }
        try {
          const st = fs.statSync(fullPath);
          projects.push({
            id,
            name,
            path: fullPath,
            size: st.size,
            modifiedAt: st.mtime.toISOString(),
            entryCount: count,
          });
        } catch (err) {
          console.error(
            `[project-browser] listProjects: stat failed for "${id}":`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    } catch (err) {
      console.error(
        "[project-browser] listProjects failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
    return projects.sort(
      (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
    );
  }

  async getProjectEntries(
    projectId: string,
    page = 1,
    limit = 50,
  ): Promise<{ entries: ProjectEntry[]; total: number }> {
    const safeId = sanitizeProjectId(projectId);
    const sourcePath = this.sourcePath(safeId);
    try {
      return this.withBusyRetry(safeId, "getProjectEntries", () => {
        const db = this.db.open(sourcePath, true);
        try {
          const total =
            db.get<CountRow>("SELECT COUNT(*) as c FROM tensorhistorynode")?.c ?? 0;
          const offset = (page - 1) * limit;
          const rows = db.all<TensorRow>(
            "SELECT rowid, p FROM tensorhistorynode ORDER BY rowid DESC LIMIT ? OFFSET ?",
            limit,
            offset,
          );

          const entries: ProjectEntry[] = rows.map((row) => {
            const buf = toBuffer(row.p) ?? Buffer.alloc(0);
            const config = parseTensorNode(buf);
            return {
              id: String(row.rowid),
              projectId: safeId,
              prompt: config.prompt,
              negativePrompt: config.negativePrompt,
              model: config.model,
              width: config.width,
              height: config.height,
              seed: config.seed,
              createdAt: "",
              thumbnail: null,
            };
          });
          return { entries, total };
        } finally {
          try {
            db.close();
          } catch {}
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[project-browser] getProjectEntries failed for "${safeId}": ${msg}`);
      throw err instanceof Error ? err : new Error(msg);
    }
  }

  getProjectEntryThumbnail(projectId: string, entryId: string): Buffer | null {
    try {
      const safeId = sanitizeProjectId(projectId);
      const sourcePath = this.sourcePath(safeId);
      return this.withBusyRetry(safeId, "getProjectEntryThumbnail", () => {
        const db = this.db.open(sourcePath, true);
        try {
          const entryRowid = parseInt(entryId);
          const carveJpeg = (p: Uint8Array | Buffer | null | undefined): Buffer | null => {
            const buf = toBuffer(p);
            if (!buf) return null;
            const jpegStart = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
            const jpegEnd = buf.indexOf(Buffer.from([0xff, 0xd9]));
            if (jpegStart >= 0 && jpegEnd > jpegStart) {
              return buf.subarray(jpegStart, jpegEnd + 2);
            }
            return null;
          };
          // Primární join: tensorhistorynode.rowid → tensorhistorynode__f86.f86
          // → thumbnailhistorynode.__pk0 (rowid ≠ rowid – posun o ~6 + 404 na ocasu).
          try {
            const fk = db.get<{ f86: number | null }>(
              "SELECT f86 FROM tensorhistorynode__f86 WHERE rowid = ?",
              entryRowid,
            );
            if (fk && fk.f86 != null) {
              try {
                const thumb = db.get<ThumbRow>(
                  "SELECT p FROM thumbnailhistorynode WHERE __pk0 = ?",
                  fk.f86,
                );
                const carved = carveJpeg(thumb?.p);
                if (carved) return carved;
              } catch (err) {
                if (isBusyError(err)) throw err;
                // jinak pokračuj na další fallback
              }
              // Druhý fallback: menší half-thumb stejným joinem.
              try {
                const half = db.get<ThumbRow>(
                  "SELECT p FROM thumbnailhistoryhalfnode WHERE __pk0 = ?",
                  fk.f86,
                );
                const carvedHalf = carveJpeg(half?.p);
                if (carvedHalf) return carvedHalf;
              } catch (err) {
                if (isBusyError(err)) throw err;
                // jinak pokračuj na legacy fallback
              }
            }
          } catch (err) {
            if (isBusyError(err)) throw err;
            // chybějící __f86 tabulka / jiný non-busy problém → legacy fallback níže
          }
          // Legacy fallback: starý rowid=rowid join (jen pro staré DB bez __f86).
          try {
            const row = db.get<ThumbRow>(
              "SELECT p FROM thumbnailhistorynode WHERE rowid = ?",
              entryRowid,
            );
            if (!row) return null;
            return carveJpeg(row.p);
          } catch (err) {
            if (isBusyError(err)) throw err;
            return null;
          }
        } finally {
          try {
            db.close();
          } catch {}
        }
      });
    } catch (err) {
      console.error(
        `[project-browser] getProjectEntryThumbnail failed for "${projectId}/${entryId}":`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  getProjectEntryConfig(projectId: string, entryId: string): ProjectEntryConfig | null {
    try {
      const safeId = sanitizeProjectId(projectId);
      const sourcePath = this.sourcePath(safeId);
      return this.withBusyRetry(safeId, "getProjectEntryConfig", () => {
        const db = this.db.open(sourcePath, true);
        let row: ThumbRow | null;
        try {
          row = db.get<ThumbRow>(
            "SELECT p FROM tensorhistorynode WHERE rowid = ?",
            parseInt(entryId),
          );
        } finally {
          try {
            db.close();
          } catch {}
        }
        if (!row) return null;
        const buf = toBuffer(row.p);
        if (!buf) return null;
        return parseTensorNode(buf);
      });
    } catch (err) {
      console.error(
        `[project-browser] getProjectEntryConfig failed for "${projectId}/${entryId}":`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────

export interface ProjectBrowserConfig {
  dtDocsDir: string;
  /** @deprecated ignorováno – snapshoty se nepoužívají (přímé readonly čtení) */
  dataDir: string;
}

/** Přímé readonly čtení z `dtDocsDir` – `dataDir` se ignoruje (kontrakt). */
export function createProjectBrowser(
  config: ProjectBrowserConfig,
  db?: DbProvider,
): ProjectBrowser {
  return new ProjectBrowser(config.dtDocsDir, db ?? getDefaultDbProvider());
}
