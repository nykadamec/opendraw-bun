// Jediný zdroj konfigurace serveru (F1).
//
// Čte env proměnné, relativní cesty resolvuje vůči cwd, `~` expanduje na
// homedir. Žádné hardcoded absolutní cesty. Validace probíhá při startu
// v loadConfig() – neplatné hodnoty throw, chybějící volitelné cesty jen
// warn (server musí naběhnout i bez DT / bez models pro vývoj frontendu).
//
// Podporované env:
//   DT_HOST, DT_PORT, DT_API_KEY, MODELS_DIR, DT_DOCS_DIR,
//   SSL_CERT_PATH, DATA_DIR, PORT, HOST
// Zpětná kompatibilita: OPEN_DRAW_MODELS_DIR (staré proxy) jako fallback
// za MODELS_DIR.
//
// Výchozí DT cesty (darwin, když env chybí) – příklad:
//   ~/Library/Containers/com.liuliu.draw-things/Data/Documents
// Vždy přes `~` expanzi (expandHome → homedir), nikdy absolutní cesta
// s konkrétním uživatelem v kódu.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ServerConfig {
  dtHost: string;
  dtPort: number;
  dtApiKey: string;
  modelsDir: string;
  dtDocsDir: string;
  sslCertPath: string;
  dataDir: string;
  port: number;
  host: string;
}

/** Rozšíří vedoucí `~` na homedir. */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Normalizuje cestu z env: trim, `~` expanze, relativní cesty vůči `base`
 * (default cwd). Vrací "" pro prázdný vstup.
 */
export function resolveEnvPath(raw: string | undefined, base: string = process.cwd()): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  const expanded = expandHome(trimmed);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(base, expanded);
}

function parsePort(raw: string | undefined, name: string, fallback: number): number {
  const text = (raw ?? "").trim();
  if (!text) return fallback;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid ${name}=${JSON.stringify(raw)} – expected TCP port 1–65535`);
  }
  return n;
}

function parseHost(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "localhost";
  if (/\s/.test(text)) {
    throw new Error(`Invalid HOST=${JSON.stringify(raw)} – expected hostname or IP without whitespace`);
  }
  return text;
}

// Výchozí DT cesty na darwin – přes `~` expanzi (žádný absolutní literal
// s konkrétním uživatelem). Příklad:
//   ~/Library/Containers/com.liuliu.draw-things/Data/Documents
function darwinDtDir(...parts: string[]): string {
  return resolveEnvPath(
    ["~/Library/Containers/com.liuliu.draw-things/Data/Documents", ...parts].join("/"),
  );
}

// --- Lazy SSL cert loader (cache, ~ + relativní cesty) ---

let certCache: { path: string; pem: string } | null = null;

/** Pro testy / reload po změně configu. */
export function clearSslCertCache(): void {
  certCache = null;
}

/**
 * Lazily načte PEM certifikát. Cesta prochází stejnou normalizací jako
 * ostatní env cesty. Prázdná cesta → srozumitelná chyba (žádný pád při
 * startu, viz loadConfig).
 */
export function loadSslCert(certPath: string): string {
  const resolved = resolveEnvPath(certPath);
  if (!resolved) {
    throw new Error(
      "SSL cert not configured – set SSL_CERT_PATH to the DrawThings TLS certificate " +
        "(PEM). Example: SSL_CERT_PATH=~/ssl.cert",
    );
  }
  if (certCache && certCache.path === resolved) return certCache.pem;
  let pem: string;
  try {
    pem = fs.readFileSync(resolved, "utf-8");
  } catch (err) {
    throw new Error(`Cannot read SSL cert at ${resolved}: ${(err as Error).message}`);
  }
  if (!pem.includes("BEGIN CERTIFICATE")) {
    throw new Error(`File at ${resolved} is not a PEM certificate (missing BEGIN CERTIFICATE)`);
  }
  certCache = { path: resolved, pem };
  return pem;
}

/**
 * Načte + validuje config. Volat jednou při startu; throw = nenastartovat.
 * Chybějící volitelné cesty (cert, models, docs) jen warnují.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dtHost = (env.DT_HOST ?? "127.0.0.1").trim() || "127.0.0.1";
  const dtPort = parsePort(env.DT_PORT, "DT_PORT", 7859);
  const port = parsePort(env.PORT, "PORT", 3001);
  const host = parseHost(env.HOST);

  const dtApiKey = (env.DT_API_KEY ?? "").trim();

  const modelsDir =
    resolveEnvPath(env.MODELS_DIR) ||
    resolveEnvPath(env.OPEN_DRAW_MODELS_DIR) ||
    (os.platform() === "darwin" ? darwinDtDir("Models") : "");
  const dtDocsDir =
    resolveEnvPath(env.DT_DOCS_DIR) || (os.platform() === "darwin" ? darwinDtDir() : "");
  const sslCertPath = resolveEnvPath(env.SSL_CERT_PATH);
  const dataDir = resolveEnvPath(env.DATA_DIR) || path.resolve(process.cwd(), "data");

  // Startovní validace: cesty které jsou nastavené musí existovat.
  if (sslCertPath && !fs.existsSync(sslCertPath)) {
    throw new Error(`SSL_CERT_PATH does not exist: ${sslCertPath}`);
  }
  if (env.MODELS_DIR?.trim() && !fs.existsSync(modelsDir)) {
    throw new Error(`MODELS_DIR does not exist: ${modelsDir}`);
  }
  if (env.DT_DOCS_DIR?.trim() && !fs.existsSync(dtDocsDir)) {
    throw new Error(`DT_DOCS_DIR does not exist: ${dtDocsDir}`);
  }

  if (!dtApiKey) {
    console.warn("[config] DT_API_KEY is empty – DT+ cloud models will not be available");
  }
  if (!sslCertPath) {
    console.warn("[config] SSL_CERT_PATH is empty – /api/echo will fail until it is set");
  }
  if (!modelsDir || !fs.existsSync(modelsDir)) {
    console.warn(`[config] models dir not found (${modelsDir || "(unset)"}) – loraNames will be empty`);
  }

  return { dtHost, dtPort, dtApiKey, modelsDir, dtDocsDir, sslCertPath, dataDir, port, host };
}
