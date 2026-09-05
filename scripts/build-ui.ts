// F8 – build UI balíčků: api-client + config-theme + ui (typecheck přes tsc).
// Použití: bun scripts/build-ui.ts [--help]
//
// Pořadí odpovídá závislostem: api-client → config-theme → ui
// (ui závisí na obou). Všechny tři balíčky mají v tsconfig noEmit:true,
// takže "build" = typová kontrola tsc --noEmit -p <balíček>.
// Kořen repa se odvodí z import.meta.dir – žádné absolutní cesty.

import path from "node:path";

function usage(): void {
  console.log("Použití: bun scripts/build-ui.ts [--help]");
  console.log("");
  console.log("  --help       tato nápověda");
  console.log("");
  console.log("Zkontroluje balíčky api-client → config-theme → ui (tsc --noEmit).");
}

const args = process.argv.slice(2);
for (const a of args) {
  if (a === "--help" || a === "-h") {
    usage();
    process.exit(0);
  } else {
    console.error(`Chyba: neznámý argument: ${a}`);
    usage();
    process.exit(1);
  }
}

// Root repa = rodič adresáře scripts/ (žádné absolutní cesty).
const root = path.resolve(import.meta.dir, "..");
const { spawn } = await import("node:child_process");

function runStep(name: string, cmd: string): Promise<void> {
  console.log(`[build-ui] ${name}: ${cmd}`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd: root, stdio: "inherit", shell: true });
    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`[build-ui] ${name}: OK`);
        resolve();
      } else {
        reject(new Error(`[build-ui] ${name} selhal (code=${code})`));
      }
    });
    child.on("error", (err) => reject(err));
  });
}

// Závislosti: ui potřebuje api-client + config-theme → nejdřív listy.
const steps: Array<[string, string]> = [
  ["api-client", "bunx tsc --noEmit -p packages/api-client/tsconfig.json"],
  ["config-theme", "bunx tsc --noEmit -p packages/config-theme/tsconfig.json"],
  ["ui", "bunx tsc --noEmit -p packages/ui/tsconfig.json"],
];

try {
  for (const [name, cmd] of steps) {
    await runStep(name, cmd);
  }
  console.log("[build-ui] Hotovo: api-client + config-theme + ui OK.");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
