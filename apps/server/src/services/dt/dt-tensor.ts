// Decode Draw Things tenzoru do PNG (F4).
//
// Port starého `proxy/src/dt-tensor.ts` 1:1 v chování:
//   - prvních 68 B = 17× uint32 LE hlavička (magic 1012247 ⇒ fpzip payload),
//   - fpzip větev: `python3 decode_tensor.py` (fpzip v2 dialekt z DT),
//   - nekomprimovaná větev: čisté JS float16 LE + sharp → PNG,
//   - mapování pixelů clip((tensor + 1) * 127, 0, 255).
//
// Rozdíly proti starému:
//   - `node:child_process spawnSync` → `Bun.spawnSync` (stdin místo input),
//   - decode skript se hledá v `packages/protocol/fpzip_decode/` (sdílený),
//   - tato vrstva žije v serveru (sharp je serverová závislost), ne v protocol.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

function resolveDecodeScript(): string {
  const candidates: string[] = [];
  if (process.env.FPZIP_DECODE_SCRIPT?.trim()) {
    candidates.push(path.resolve(process.env.FPZIP_DECODE_SCRIPT.trim()));
  }
  // apps/server/src/services/dt → repo root → packages/protocol
  candidates.push(
    path.resolve(import.meta.dir, "../../../../../packages/protocol/fpzip_decode/decode_tensor.py"),
  );
  candidates.push(
    path.resolve(process.cwd(), "packages/protocol/fpzip_decode/decode_tensor.py"),
  );
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`decode_tensor.py not found (tried: ${candidates.join(", ")})`);
}

const FPZIP_MAGIC = 1012247;
const HEADER_INTS = 17;
const HEADER_BYTES = HEADER_INTS * 4;
const VALID_CHANNELS = new Set([1, 3, 4]);

const PYTHON_DECODE_TIMEOUT_MS = 60_000;

let decodeScript: string | null = null;

function getDecodeScript(): string {
  if (!decodeScript) decodeScript = resolveDecodeScript();
  return decodeScript;
}

/** Pro testy (přepsání cesty ke skriptu). */
export function setDecodeScript(p: string | null): void {
  decodeScript = p;
}

/**
 * Dekóduje DT tenzor (68B hlavička + payload) do PNG bytů.
 * Hází na poškozeném vstupu; nikdy nevrátí poškozený obrázek.
 */
export async function decodeDtTensorToPng(buf: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(buf) || buf.length < HEADER_BYTES) {
    throw new Error(`Tensor too small: got ${buf?.length ?? 0} bytes, need ≥ ${HEADER_BYTES}`);
  }

  const header = new Uint32Array(buf.buffer, buf.byteOffset, HEADER_INTS);
  const magic = header[0];
  const height = header[6];
  const width = header[7];
  const channels = header[8];

  if (height === 0 || width === 0) {
    throw new Error(`Tensor has zero dimension: ${width}x${height}`);
  }
  if (!VALID_CHANNELS.has(channels)) {
    throw new Error(`Unsupported tensor channel count: ${channels} (expected 1, 3 or 4)`);
  }

  if (magic === FPZIP_MAGIC) {
    return decodeViaPython(buf);
  }

  const count = height * width * channels;
  const pixels = decodeFloat16Tensor(buf.subarray(HEADER_BYTES), count);

  const out = Buffer.alloc(count);
  for (let i = 0; i < count; i++) {
    const v = pixels[i];
    const mapped = (v + 1) * 127;
    out[i] = mapped <= 0 ? 0 : mapped >= 255 ? 255 : Math.round(mapped);
  }

  const rawChannels = channels as 1 | 2 | 3 | 4;
  return sharp(out, { raw: { width, height, channels: rawChannels } })
    .png()
    .toBuffer();
}

/**
 * Spustí `python3 decode_tensor.py` s celým tenzorem (včetně 68B hlavičky)
 * na stdin a vrátí PNG byty ze stdout. Chyby → throw (exit status / stderr).
 */
function decodeViaPython(tensor: Buffer): Buffer {
  let result: {
    exitCode: number;
    stdout: Uint8Array | Buffer;
    stderr: Uint8Array | Buffer;
  };
  try {
    result = Bun.spawnSync(["python3", getDecodeScript()], {
      stdin: tensor,
      stdout: "pipe",
      stderr: "pipe",
      timeout: PYTHON_DECODE_TIMEOUT_MS,
    }) as unknown as {
      exitCode: number;
      stdout: Uint8Array | Buffer;
      stderr: Uint8Array | Buffer;
    };
  } catch (err) {
    throw new Error(`fpzip decoder spawn failed: ${(err as Error).message}`);
  }

  if (result.exitCode !== 0) {
    const stderr = Buffer.from(result.stderr ?? []).toString("utf-8").trim() || "(no stderr)";
    throw new Error(`fpzip decoder exited with status ${result.exitCode}: ${stderr}`);
  }
  const stdout = Buffer.from(result.stdout ?? []);
  if (stdout.length === 0) {
    throw new Error("fpzip decoder produced no output");
  }
  if (
    stdout.length < 8 ||
    stdout[0] !== 0x89 ||
    stdout[1] !== 0x50 ||
    stdout[2] !== 0x4e ||
    stdout[3] !== 0x47
  ) {
    throw new Error(
      `fpzip decoder returned non-PNG output (${stdout.length} bytes, first 4 = ${stdout.subarray(0, 4).toString("hex")})`,
    );
  }
  return stdout;
}

function decodeFloat16Tensor(payload: Buffer, count: number): Float32Array {
  const expectedBytes = count * 2;
  if (payload.length < expectedBytes) {
    throw new Error(
      `Float16 tensor payload too small: got ${payload.length} bytes, need ${expectedBytes}`,
    );
  }
  const f16 = new Uint16Array(payload.buffer, payload.byteOffset, count);
  const f32 = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    f32[i] = float16ToFloat32(f16[i]);
  }
  return f32;
}

/** IEEE 754 binary16 → binary32. */
function float16ToFloat32(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) {
    return (s ? -1 : 1) * 5.9604644775390625e-8 * f;
  }
  if (e === 0x1f) {
    return f ? Number.NaN : s ? -Infinity : Infinity;
  }
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}
