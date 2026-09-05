// F8 – build web klientů: apps/desktop + apps/mobile (tsc + vite build).
// Použití: bun scripts/build-web.ts [--help] [--desktop-only] [--mobile-only]
//
// Každý klient se staví přes svůj workspace script "build" (tsc && vite build),
// takže se typují i sdílené balíčky (ui, config-theme, api-client).
// Kořen repa se odvodí z import.meta.dir – žádné absolutní cesty.

import path from "node:path";

function usage(): void {
  console.log("Použití: bun scripts/build-web.ts [--desktop-only] [--mobile-only] [--help]");
  console.log("");
  console.log("  --desktop-only  stavět jen apps/desktop");
  console.log("  --mobile-only   stavět jen apps/mobile");
  console.log("  --help          tato nápověda");
  console.log("");
  console.log("Default: desktop + mobile (oba klienti, vite build).");
}

let desktopOnly = false;
let mobileOnly = false;

const args = process.argv.slice(2);
for (const a of args) {
  if (a === "--desktop-only") {
    desktopOnly = true;
  } else if (a === "--mobile-only") {
    mobileOnly = true;
  } else if (a === "--help" || a === "-h") {
    usage();
    process.exit(0);
  } else {
    console.error(`Chyba: neznámý argument: ${a}`);
    usage();
    process.exit(1);
  }
}

if (desktopOnly && mobileOnly) {
  console.error("Chyba: --desktop-only a --mobile-only se vylučují.");
  usage();
  process.exit(1);
}

// Root repa = rodič adresáře scripts/ (žádné absolutní cesty).
const root = path.resolve(import.meta.dir, "..");
const { spawn } = await import("node:child_process");

function runStep(name: string, cmd: string, cwd: string): Promise<void> {
  console.log(`[build-web] ${name}: ${cmd} (cwd=${cwd})`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd, stdio: "inherit", shell: true });
    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`[build-web] ${name}: OK`);
        resolve();
      } else {
        reject(new Error(`[build-web] ${name} selhal (code=${code})`));
      }
    });
    child.on("error", (err) => reject(err));
  });
}

const targets: Array<{ name: string; dir: string }> = [];
if (!mobileOnly) targets.push({ name: "desktop", dir: path.join(root, "apps", "desktop") });
if (!desktopOnly) targets.push({ name: "mobile", dir: path.join(root, "apps", "mobile") });

try {
  for (const t of targets) {
    await runStep(t.name, "bun run build", t.dir);
  }
  console.log(`[build-web] Hotovo: ${targets.map((t) => t.name).join(" + ")} OK.`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
