// LoRA metadata – port proxy/src/lora-metadata.ts (F5).
//
// Rozdíl proti starému kódu: žádný `getStandardModelsDir()` / env čtení.
// `modelsDir` dostává z configu (ServerConfig.modelsDir). Chybějící prázdný
// modelsDir → srozumitelná chyba, stejně jako stará hláška o OPEN_DRAW_MODELS_DIR.
// Trigger-word extrakce, safetensors parse i python fallback 1:1.

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { findLoraFile } from "./lora-files.js";

export { findLoraFile };

export interface LoraMetadata {
  triggerWords: string[];
  name?: string;
  /** Base model z lokální hlavičky (např. modelspec.architecture). */
  baseModel?: string;
}

const MAX_HEADER_BYTES = 64 * 1024;
const execFileP = promisify(execFile);

function readUInt64LE(buf: Buffer, offset: number): bigint {
  const lo = BigInt(buf.readUInt32LE(offset));
  const hi = BigInt(buf.readUInt32LE(offset + 4));
  return (hi << 32n) | lo;
}

function extractTriggerWords(metadata: Record<string, unknown>): string[] {
  const out: string[] = [];
  const pushWords = (raw: unknown) => {
    if (typeof raw !== "string") return;
    for (const part of raw.split(",")) {
      const word = part.trim();
      if (word) out.push(word);
    }
  };

  pushWords(metadata["trained_words"]);
  pushWords(metadata["modelspec.trigger_phrase"]);
  pushWords(metadata["modelspec.trigger_words"]);
  pushWords(metadata["tags"]);

  return Array.from(new Set(out));
}

/**
 * Base model z `__metadata__` safetensors / pickle hlavičky.
 * Nástroje (kohya, train-tools, CivitAI generátory) zapisují různé klíče,
 * proto zkoušíme známou sadu a bereme první neprázdný string.
 */
const BASE_MODEL_KEYS = [
  "modelspec.architecture",
  "modelspec.sai_base_model",
  "ss_base_model_version",
  "ss_sd_model_name",
  "ssmd_base_model_version",
  "base_model",
  "baseModel",
] as const;

export function extractBaseModel(metadata: Record<string, unknown>): string | undefined {
  for (const key of BASE_MODEL_KEYS) {
    const raw = metadata[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return undefined;
}

export function parseSafetensorsMetadata(buffer: Buffer): LoraMetadata {
  if (buffer.length < 8) {
    throw new Error("Soubor je příliš malý na safetensors hlavičku.");
  }
  const headerLen = readUInt64LE(buffer, 0);
  if (headerLen <= 0n || headerLen > BigInt(MAX_HEADER_BYTES)) {
    throw new Error(`Safetensors hlavička je příliš velká nebo neplatná (${headerLen} bytů).`);
  }
  const len = Number(headerLen);
  const headerBuf = buffer.subarray(8, 8 + len);
  let header: unknown;
  try {
    header = JSON.parse(headerBuf.toString("utf8"));
  } catch (err) {
    throw new Error(`Nelze parsovat JSON hlavičku safetensors: ${(err as Error).message}`);
  }
  if (!header || typeof header !== "object") {
    throw new Error("Safetensors hlavička musí být JSON objekt.");
  }
  const meta = (header as Record<string, unknown>)["__metadata__"];
  if (!meta || typeof meta !== "object") {
    return { triggerWords: [] };
  }
  const metaObj = meta as Record<string, unknown>;
  const nameRaw = metaObj["modelspec.title"] ?? metaObj["modelspec.suffix"] ?? metaObj["name"];
  const name = typeof nameRaw === "string" ? nameRaw : undefined;
  return {
    triggerWords: extractTriggerWords(metaObj),
    name,
    baseModel: extractBaseModel(metaObj),
  };
}

function assertModelsDir(modelsDir: string): void {
  if (!modelsDir) {
    throw new Error("Models adresář nenalezen. Nastav MODELS_DIR.");
  }
}

function assertSafeFile(modelsDir: string, file: string): string {
  const fullPath = path.join(modelsDir, file);
  if (path.dirname(fullPath) !== modelsDir) {
    throw new Error("Neplatný název souboru (path traversal).");
  }
  return fullPath;
}

/**
 * Resolvuje LoRA soubor: nejdřív `findLoraFile` (umí i `loras/<file>`
 * podadresář), fallback na přímé `modelsDir/<file>` (stejná chyba 404 jako
 * starý kód pro chybějící soubor). Traversal (`/`, `\`, `..`) vždy odmítne.
 */
async function resolveLoraPath(modelsDir: string, file: string): Promise<string> {
  if (file.includes("/") || file.includes("\\") || file.includes("..")) {
    throw new Error("Neplatný název souboru (path traversal).");
  }
  const found = await findLoraFile(modelsDir, file);
  if (found) return found;
  return assertSafeFile(modelsDir, file);
}

export async function readLoraHeader(modelsDir: string, file: string): Promise<Buffer> {
  assertModelsDir(modelsDir);
  const fullPath = await resolveLoraPath(modelsDir, file);
  if (!fullPath.endsWith(".safetensors") && !fullPath.endsWith(".ckpt")) {
    throw new Error("Trigger words jsou dostupné jen pro .safetensors nebo .ckpt soubory.");
  }

  const fd = await fs.open(fullPath, "r");
  try {
    const buf = Buffer.alloc(MAX_HEADER_BYTES);
    const { bytesRead } = await fd.read(buf, 0, MAX_HEADER_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
}

export async function getLoraMetadata(modelsDir: string, file: string): Promise<LoraMetadata> {
  assertModelsDir(modelsDir);
  const fullPath = await resolveLoraPath(modelsDir, file);

  const isSafetensors = file.endsWith(".safetensors");
  const isCkpt = file.endsWith(".ckpt");

  if (!isSafetensors && !isCkpt) {
    throw new Error("Trigger words jsou dostupné jen pro .safetensors nebo .ckpt soubory.");
  }

  // Detect pickle magic (PyTorch ZIP starts with 0x50 0x4B 0x03 0x04 = "PK\x03\x04")
  const fd = await fs.open(fullPath, "r");
  let magic: Buffer;
  try {
    magic = Buffer.alloc(4);
    await fd.read(magic, 0, 4, 0);
  } finally {
    await fd.close();
  }
  const isZipPyTorch = magic[0] === 0x50 && magic[1] === 0x4b;

  if (isZipPyTorch) {
    return readLoraMetadataViaPython(fullPath);
  }

  // Native safetensors parser (works for both .safetensors and DT-style .ckpt that
  // are actually safetensors format).
  const header = await readLoraHeader(modelsDir, file);
  try {
    return parseSafetensorsMetadata(header);
  } catch {
    // Fallback: not safetensors despite .ckpt extension — try Python
    return readLoraMetadataViaPython(fullPath);
  }
}

async function readLoraMetadataViaPython(fullPath: string): Promise<LoraMetadata> {
  const scriptPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "scripts",
    "lora-metadata.py",
  );
  try {
    const { stdout } = await execFileP("python3", [scriptPath, fullPath], {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const result = JSON.parse(stdout);
    const baseModelRaw = result.baseModel;
    return {
      triggerWords: Array.isArray(result.triggerWords) ? result.triggerWords : [],
      name: typeof result.name === "string" ? result.name : undefined,
      baseModel: typeof baseModelRaw === "string" && baseModelRaw.trim() ? baseModelRaw.trim() : undefined,
    };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; stderr?: unknown; stdout?: unknown };
    if (e?.code === "ENOENT" || /ENOENT/.test(e?.message ?? "")) {
      throw new Error(`Soubor nenalezen: ${path.basename(fullPath)}`);
    }
    const stderr = typeof e?.stderr === "string" ? e.stderr.trim() : "";
    const stdout = typeof e?.stdout === "string" ? e.stdout.trim() : "";
    if (stderr || stdout) {
      throw new Error(`Python parser selhal: ${stderr || stdout}`);
    }
    throw new Error(`Python parser selhal: ${e?.message ?? "neznámá chyba"}`);
  }
}

export async function computeFileHash(fullPath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) return null;
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256");
    const BUFFER_SIZE = 256 * 1024;
    const fd = await fs.open(fullPath, "r");
    const buf = Buffer.alloc(BUFFER_SIZE);
    let totalRead = 0;
    const fileSize = stat.size;
    try {
      while (totalRead < fileSize) {
        const { bytesRead } = await fd.read(buf, 0, BUFFER_SIZE, totalRead);
        if (bytesRead === 0) break;
        hash.update(buf.subarray(0, bytesRead));
        totalRead += bytesRead;
      }
    } finally {
      await fd.close();
    }
    return hash.digest("hex").toUpperCase();
  } catch {
    return null;
  }
}

/**
 * Lokální metadata souboru pro enrich (trigger words + jméno + base model).
 * Oproti `getLoraMetadata` resolvuje cestu přes `findLoraFile` (funguje i pro
 * `loras/<file>` podadresář), jinak stejná logika: safetensors nativně,
 * ZIP/pickle přes python helper. Best-effort – při čemkoliv vrací null
 * (enrich pak spadne na CivitAI/CivArchive zdroje).
 */
export async function detectLocalMetadata(
  modelsDir: string,
  fileName: string,
): Promise<LoraMetadata | null> {
  try {
    if (!modelsDir || !fileName) return null;
    if (!fileName.endsWith(".safetensors") && !fileName.endsWith(".ckpt")) return null;
    const fullPath = await findLoraFile(modelsDir, fileName);
    if (!fullPath) return null;

    const fd = await fs.open(fullPath, "r");
    let head: Buffer;
    try {
      head = Buffer.alloc(4);
      await fd.read(head, 0, 4, 0);
    } finally {
      await fd.close();
    }
    const isZipPyTorch = head[0] === 0x50 && head[1] === 0x4b;
    if (isZipPyTorch) {
      try {
        return await readLoraMetadataViaPython(fullPath);
      } catch {
        return null;
      }
    }

    const fd2 = await fs.open(fullPath, "r");
    try {
      const buf = Buffer.alloc(MAX_HEADER_BYTES);
      const { bytesRead } = await fd2.read(buf, 0, MAX_HEADER_BYTES, 0);
      try {
        return parseSafetensorsMetadata(buf.subarray(0, bytesRead));
      } catch {
        // Není safetensors (např. DT nativní SQLite .ckpt) – zkus python
        // helper, stejně jako getLoraMetadata.
        try {
          return await readLoraMetadataViaPython(fullPath);
        } catch {
          return null;
        }
      }
    } finally {
      await fd2.close();
    }
  } catch {
    return null;
  }
}
