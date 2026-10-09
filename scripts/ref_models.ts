#!/usr/bin/env bun
// ref_models.ts – refresh seznamu cloud modelů v apps/server/src/cloud-models.json
//
// Spuštění:
//   bun scripts/ref_models.ts [--dry-run] [--verbose] [--source PATH]
//
//   --dry-run   Vypiše, co by se aktualizovalo, ale soubor neukládá.
//   --verbose   Podrobnosti o načtených, aktualizovaných a zapsaných modelech.
//   --source    Cesta ke zdrojovému JSON (pole modelů, nebo { "models": [...] }).
//
// Zdroje (priorita):
//   1. --source PATH            lokální soubor / cache
//   2. CLOUD_MODELS_SOURCE      stejný formát jako --source
//   3. DEFAULT_MODELS_URL = https://models.drawthings.ai/models.json
//      Oficiální public Draw Things katalog (bez tokenu) – stejný zdroj,
//      který čte DrawOtherThings CLI. Přenastavit přes DT_MODELS_URL;
//      u jiného (privátního) endpointu skript automaticky použije token
//      z DT_API_KEY (POST https://api.drawthings.ai/sdk/token).
//      Katalog vrací bohatší položky (autoencoder, text_encoder, …);
//      normalizace vybere jen {name, version, file} a deduplikuje
//      podle (name, file).
//
// Formát cloud-models.json: top-level JSON pole
//   [{ "name": string, "version": string, "file": string }, ...]
// (server ho čte jako pole – viz services/cloud-models.ts). Pokud soubor
// ještě obsahuje objekt s dalšími poli, ty se zachovají a nepřepisují.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLOUD_MODELS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "server",
  "src",
  "cloud-models.json",
);

const DRAWTHINGS_API_BASE = "https://api.drawthings.ai";
// Oficiální Draw Things katalog (public, žádný token) – zdroj seznamu cloud modelů.
// Viz DrawOtherThings CLI: fetchCommunitySpecifications() → models.drawthings.ai/models.json.
const DEFAULT_MODELS_URL = "https://models.drawthings.ai/models.json";

interface CloudModel {
  name: string;
  version: string;
  file: string;
}

interface CloudModelsDoc {
  models: CloudModel[];
  [key: string]: unknown;
}

// ---------- CLI ----------

function parseArgs(argv: string[]): {
  dryRun: boolean;
  verbose: boolean;
  source: string | null;
} {
  const opts: { dryRun: boolean; verbose: boolean; source: string | null } = {
    dryRun: false,
    verbose: false,
    source: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--verbose" || arg === "-v") opts.verbose = true;
    else if (arg === "--source" || arg === "-s") {
      const next = argv[++i];
      if (!next) throw new Error("--source vyžaduje cestu ke zdrojovému souboru");
      opts.source = next;
    } else if (arg.startsWith("--source=")) opts.source = arg.slice("--source=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log("Použití: bun scripts/ref_models.ts [--dry-run] [--verbose] [--source PATH]");
      process.exit(0);
    } else {
      throw new Error(`Neznámý argument: ${arg} (použij --help)`);
    }
  }
  return opts;
}

// ---------- .env (jen DT_API_KEY / DT_MODELS_URL, bez externích závislostí) ----------

function loadDotEnv(): void {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*(DT_API_KEY|DT_MODELS_URL)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// ---------- Validace / normalizace ----------

function isCloudModel(m: unknown): m is CloudModel {
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  const r = m as Record<string, unknown>;
  return (
    typeof r.name === "string" && r.name.length > 0 &&
    typeof r.version === "string" && r.version.length > 0 &&
    typeof r.file === "string" && r.file.length > 0
  );
}

// Normalizace libovolného vstupu do konzistentního tvaru CloudModel[],
// deduplikované podle (name, file). Vrátí i počet vynechaných položek.
function normalizeModels(raw: unknown, source: string): { models: CloudModel[]; dropped: number } {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { models?: unknown }).models)
      ? (raw as { models: unknown[] }).models
      : [];
  if (list.length === 0) {
    throw new Error(
      `Zdroj ${source}: nenalezeno pole modelů (očekáváno JSON pole, nebo objekt s polem "models")`,
    );
  }
  const valid = list.filter(isCloudModel);
  const seen = new Map<string, CloudModel>();
  for (const m of valid) {
    const key = `${m.name}\u0000${m.file}`;
    if (!seen.has(key)) seen.set(key, { name: m.name, version: m.version, file: m.file });
  }
  return { models: [...seen.values()], dropped: list.length - valid.length };
}

// Mapování odpovědi DrawThings API do tvaru pro normalizeModels().
// Identita pro {name, version, file} / {models: [...]}; pokud API vrací
// jiný formát (ukázka se vypíše v --verbose), doplnit zde mapping.
function normalizeDrawThings(data: unknown): unknown {
  return data;
}

// ---------- Zdroje ----------

async function fetchFromLocalFile(path: string): Promise<{ raw: unknown; label: string }> {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`Zdrojový soubor neexistuje: ${abs}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    throw new Error(`Zdrojový soubor ${abs} není platný JSON: ${(err as Error).message}`);
  }
  return { raw, label: abs };
}

async function fetchFromDrawThings(verbose: boolean): Promise<{ raw: unknown; label: string }> {
  const modelsUrl = (process.env.DT_MODELS_URL ?? DEFAULT_MODELS_URL).trim();

  // Oficiální katalog models.drawthings.ai je public (bez tokenu).
  // Pokud je nastaven DT_MODELS_URL na jiný (privátní) endpoint, připojíme token.
  let authHeader: Record<string, string> = {};
  const isPublicCatalog = modelsUrl.startsWith("https://models.drawthings.ai/");
  const apiKey = (process.env.DT_API_KEY ?? "").trim();
  if (!isPublicCatalog) {
    if (!apiKey) {
      throw new Error(
        `Endpoint ${modelsUrl} vyžaduje autentizaci – nastav DT_API_KEY, ` +
          `nebo použij public katalog (výchozí) / --source PATH.`,
      );
    }
    const tokenRes = await fetch(`${DRAWTHINGS_API_BASE}/sdk/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, appCheckType: "none", appCheckToken: null }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      throw new Error(`Token request failed (HTTP ${tokenRes.status}): ${text}`);
    }
    const tokenData = (await tokenRes.json()) as { shortTermToken?: string };
    if (!tokenData.shortTermToken) throw new Error("Token response missing shortTermToken");
    authHeader = { Authorization: `Bearer ${tokenData.shortTermToken}` };
  }

  const res = await fetch(modelsUrl, { headers: authHeader });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 404
        ? `Models endpoint ${modelsUrl} vrací 404 – zkontroluj URL (DT_MODELS_URL) nebo použij --source PATH.`
        : `Models request failed (HTTP ${res.status}): ${text}`,
    );
  }
  const data = (await res.json()) as unknown;
  if (verbose) {
    const sample = JSON.stringify(data);
    console.log(`[verbose] UKAZKA odpovedi ${modelsUrl}: ${sample.slice(0, 500)}${sample.length > 500 ? "…" : ""}`);
  }
  return { raw: normalizeDrawThings(data), label: modelsUrl };
}

// ---------- Čtení / zápis cílového souboru ----------

// Vrací doc + flag, zda původní soubor byl top-level pole (server to vyžaduje).
function loadDoc(path: string): CloudModelsDoc & { _isArray: boolean } {
  if (!existsSync(path)) return { models: [], _isArray: true };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Soubor ${path} není platný JSON: ${(err as Error).message}`);
  }
  // Aktuální (a historický) formát: top-level pole modelů.
  if (Array.isArray(raw)) return { models: raw.filter(isCloudModel), _isArray: true };
  if (raw && typeof raw === "object") {
    const doc = raw as CloudModelsDoc;
    return {
      ...(Array.isArray(doc.models) ? doc : { ...doc, models: [] }),
      _isArray: false,
    };
  }
  return { models: [], _isArray: true };
}

function writeDoc(path: string, doc: CloudModelsDoc & { _isArray: boolean }): void {
  const { _isArray, ...rest } = doc;
  const out = _isArray ? rest.models : rest;
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n", "utf8");
}

// ---------- Main ----------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const log = (...args: unknown[]): void => {
    if (opts.verbose) console.log(...args);
  };

  loadDotEnv();
  log("[verbose] Cíl:", CLOUD_MODELS_PATH);
  log("[verbose] Cíl existuje:", existsSync(CLOUD_MODELS_PATH));

  type Doc = CloudModelsDoc & { _isArray: boolean };
  let doc: Doc;
  try {
    doc = loadDoc(CLOUD_MODELS_PATH);
  } catch (err) {
    console.warn(`Varování: ${CLOUD_MODELS_PATH} je neplatný JSON – pokračuji s výchozí strukturou (pole modelů).`);
    doc = { models: [], _isArray: true };
  }

  const before = doc.models;
  const { raw, label } = opts.source
    ? await fetchFromLocalFile(opts.source)
    : process.env.CLOUD_MODELS_SOURCE
      ? await fetchFromLocalFile(process.env.CLOUD_MODELS_SOURCE)
      : await fetchFromDrawThings(opts.verbose);

  const { models, dropped } = normalizeModels(raw, label);
  if (opts.verbose) {
    console.log(`[verbose] Načteno ${models.length} modelů z ${label}${dropped > 0 ? ` (${dropped} vynechán(a))` : ""}:`);
    for (const m of models) console.log(`[verbose]   - ${m.name} (${m.version}) → ${m.file}`);
  }

  const nextDoc: Doc = { ...doc, models };
  const nextKeys = new Set(models.map((m) => `${m.name}\u0000${m.file}`));
  const beforeKeys = new Set(before.map((m) => `${m.name}\u0000${m.file}`));
  const added = models.filter((m) => !beforeKeys.has(`${m.name}\u0000${m.file}`));
  const removed = before.filter((m) => !nextKeys.has(`${m.name}\u0000${m.file}`));

  if (opts.dryRun) {
    console.log(`[dry-run] ${CLOUD_MODELS_PATH} by se aktualizoval(a) ze zdroje: ${label}`);
    console.log(`[dry-run]   aktuálně: ${before.length} modelů → po aktualizaci: ${models.length}`);
    console.log(`[dry-run]   přidáno: ${added.length}, odebráno: ${removed.length}`);
    if (opts.verbose) {
      for (const m of added) console.log(`[dry-run]   + ${m.name} (${m.version}) → ${m.file}`);
      for (const m of removed) console.log(`[dry-run]   - ${m.name} (${m.version}) → ${m.file}`);
    }
    console.log("[dry-run] Soubor se neukládá.");
  } else {
    writeDoc(CLOUD_MODELS_PATH, nextDoc);
    const preserved = Object.keys(nextDoc).filter((k) => k !== "models" && k !== "_isArray");
    log(
      "[verbose] Zapsáno",
      models.length,
      "modelů (formát:",
      nextDoc._isArray ? "top-level pole" : "objekt {models}",
      "); zachovaná další pole:",
      preserved.length ? preserved.join(", ") : "(žádné)",
    );
  }

  console.log("Souhrn:");
  console.log(`  Načteno modelů:      ${models.length} (zdroj: ${label})`);
  console.log(`  Aktualizováno modelů: ${models.length} (+${added.length} / -${removed.length})`);
  console.log(`  Soubor:              ${CLOUD_MODELS_PATH}${opts.dryRun ? " (dry-run, neuloženo)" : ""}`);
}

try {
  await main();
} catch (err) {
  console.error(`Chyba: ${(err as Error).message}`);
  process.exit(1);
}
