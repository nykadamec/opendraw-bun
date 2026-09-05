// F8 – celkový build: ui → backend → web.
// Použití: bun scripts/build.ts [--help] [--dry-run] [--skip-ui] [--skip-backend] [--skip-web]
//
// Sekvenčně spouští dílčí skripty (fail-fast):
//   1. scripts/build-ui.ts      (api-client + config-theme + ui)
//   2. scripts/build-backend.ts (apps/server – tsc)
//   3. scripts/build-web.ts     (apps/desktop + apps/mobile – vite build)
// Kořen repa se odvodí z import.meta.dir – žádné absolutní cesty.

import path from "node:path";

function usage(): void {
  console.log("Použití: bun scripts/build.ts [--dry-run] [--skip-ui] [--skip-backend] [--skip-web] [--help]");
  console.log("");
  console.log("  --dry-run      jen vypsat kroky, nic nestavět");
  console.log("  --skip-ui      přeskočit build-ui");
  console.log("  --skip-backend přeskočit build-backend");
  console.log("  --skip-web     přeskočit build-web");
  console.log("  --help         tato nápověda");
  console.log("");
  console.log("Default: ui → backend → web (vše).");
}

let dryRun = false;
let skipUi = false;
let skipBackend = false;
let skipWeb = false;

const args = process.argv.slice(2);
for (const a of args) {
  if (a === "--dry-run") {
    dryRun = true;
  } else if (a === "--skip-ui") {
    skipUi = true;
  } else if (a === "--skip-backend") {
    skipBackend = true;
  } else if (a === "--skip-web") {
    skipWeb = true;
  } else if (a === "--help" || a === "-h") {
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

const steps: Array<{ name: string; cmd: string; skip: boolean }> = [
  { name: "ui", cmd: "bun scripts/build-ui.ts", skip: skipUi },
  { name: "backend", cmd: "bun scripts/build-backend.ts", skip: skipBackend },
  { name: "web", cmd: "bun scripts/build-web.ts", skip: skipWeb },
];

const planned = steps.filter((s) => !s.skip);
if (planned.length === 0) {
  console.error("Chyba: všechny kroky přeskočeny – není co stavět.");
  process.exit(1);
}

if (dryRun) {
  console.log("[build] Suchý průchod – nic se nestaví:");
  for (const s of steps) {
    console.log(`[build]   ${s.skip ? "SKIP" : "RUN "} ${s.name}: ${s.cmd}`);
  }
  process.exit(0);
}

function runStep(name: string, cmd: string): Promise<void> {
  console.log(`[build] ${name}: ${cmd}`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd: root, stdio: "inherit", shell: true });
    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`[build] ${name}: OK`);
        resolve();
      } else {
        reject(new Error(`[build] ${name} selhal (code=${code}) – zastavuji.`));
      }
    });
    child.on("error", (err) => reject(err));
  });
}

try {
  for (const s of planned) {
    await runStep(s.name, s.cmd);
  }
  console.log(`[build] Hotovo: ${planned.map((s) => s.name).join(" → ")} OK.`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
