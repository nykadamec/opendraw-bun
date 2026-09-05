// F8 – build backendu: packages/protocol (tsc emit JS+d.ts do dist)
// a poté apps/server přes tsc (emit do dist dle tsconfig).
// Použití: bun scripts/build-backend.ts [--help]
//
// Server importuje protokol přes workspace balíček `@opendraw/protocol`
// (viz packages/protocol/exports → dist), proto se protokol staví první.
// Kořen repa se odvodí z import.meta.dir – žádné absolutní cesty.

import path from "node:path";

function usage(): void {
  console.log("Použití: bun scripts/build-backend.ts [--help]");
  console.log("");
  console.log("  --help       tato nápověda");
  console.log("");
  console.log("Zkompiluje packages/protocol a apps/server (tsc -p …/tsconfig.json).");
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
  console.log(`[build-backend] ${name}: ${cmd}`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd: root, stdio: "inherit", shell: true });
    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`[build-backend] ${name}: OK`);
        resolve();
      } else {
        reject(new Error(`[build-backend] ${name} selhal (code=${code})`));
      }
    });
    child.on("error", (err) => reject(err));
  });
}

try {
  await runStep("protocol", "bunx tsc -p packages/protocol/tsconfig.json");
  await runStep("server", "bunx tsc -p apps/server/tsconfig.json");
  console.log("[build-backend] Hotovo: protocol + apps/server OK.");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
