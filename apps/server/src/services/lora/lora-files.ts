// Vyhledání LoRA souboru v models dir (F4).
//
// Port `findLoraFile` ze starého `lora-metadata.ts`: kandidáti `loras/<file>`
// a `<file>` přímo. Vrátí absolutní cestu, nebo null když soubor neexistuje.
// modelsDir dostává z configu (žádné env čtení, žádné absolutní cesty v kódu).

import { promises as fs } from "node:fs";
import path from "node:path";

export async function findLoraFile(modelsDir: string, fileName: string): Promise<string | null> {
  if (!modelsDir || !fileName) return null;
  // Stejná ochrana jako ve starém kódu: jen basename, žádný traversal.
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    return null;
  }
  const candidates = [path.join(modelsDir, "loras", fileName), path.join(modelsDir, fileName)];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // zkus dalšího kandidáta
    }
  }
  return null;
}
