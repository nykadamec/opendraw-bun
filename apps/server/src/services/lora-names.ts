// Vlastní jména LoRA (custom_lora.json v models dir).
// Port lora-names.ts – bez env čtení, modelsDir dostává z configu.

import fs from "node:fs";
import path from "node:path";

let cacheDir: string | null = null;
let cache: Record<string, string> | null = null;

export function getLoraNames(modelsDir: string): Record<string, string> {
  if (cache && cacheDir === modelsDir) return cache;
  cacheDir = modelsDir;
  cache = {};

  if (!modelsDir) return cache;
  const jsonPath = path.join(modelsDir, "custom_lora.json");
  if (!fs.existsSync(jsonPath)) return cache;

  try {
    const entries = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as { file: string; name?: string }[];
    for (const entry of entries) {
      if (entry.file && entry.name) {
        cache[entry.file] = entry.name;
      }
    }
  } catch {
    // poškozený soubor = prázdná mapa, stejně jako ve starém kódu
  }
  return cache;
}

export function clearLoraNamesCache(): void {
  cache = null;
  cacheDir = null;
}
