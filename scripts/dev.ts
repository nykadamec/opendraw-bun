// F7 – dev orchestrace: server + desktop + mobile v jednom příkazu.
// Použití: bun scripts/dev.ts [--port XXXX] [--public] [--help]
//   --port XXXX  port API serveru (default 3001)
//   --public     server host 0.0.0.0 (default localhost)
//   --help       nápověda
//
// PORT/HOST se serveru předávají přes env, /api proxy frontendu přes
// API_TARGET (viz apps/*/vite.config.ts). Kořen repa se odvodí z
// import.meta.dir – žádné absolutní cesty. Ukončení (Ctrl+C) zabije
// všechny tři procesy.

import fs from "node:fs";
import path from "node:path";

function usage(): void {
  console.log("Použití: bun scripts/dev.ts [--port XXXX] [--public] [--help]");
  console.log("");
  console.log("  --port XXXX  port API serveru (default 3001)");
  console.log("  --public     server host 0.0.0.0 (default localhost)");
  console.log("  --help       tato nápověda");
  console.log("");
  console.log("Spustí server (3001) + desktop (5173) + mobile (5174).");
}

let port = "3001";
let host = "localhost";

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--port") {
    const v = args[++i];
    if (!v || !/^[0-9]+$/.test(v)) {
      console.error(`Chyba: --port vyžaduje číselnou hodnotu, dostal jsem: ${v ?? "(nic)"}`);
      process.exit(1);
    }
    port = v;
  } else if (a === "--public") {
    host = "0.0.0.0";
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
const displayHost = host === "0.0.0.0" ? "localhost" : host;
const apiTarget = `http://${displayHost}:${port}`;

const children: import("node:child_process").ChildProcess[] = [];
// PID soubory pro přesné zastavování (stop-all.sh). Jen /tmp je absolutní.
const pidFiles: Record<string, string> = {
  server: "/tmp/opendraw-bun-dev.server.pid",
  desktop: "/tmp/opendraw-bun-dev.desktop.pid",
  mobile: "/tmp/opendraw-bun-dev.mobile.pid",
};

function writePid(name: string, pid: number | undefined): void {
  if (pid === undefined) return;
  fs.writeFileSync(pidFiles[name], String(pid));
}

function cleanupPidFiles(): void {
  for (const f of Object.values(pidFiles)) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      // ignoruj – soubor už neexistuje
    }
  }
}
// Bun global je k dispozici pod bun runtime; fallback na node:child_process.
const { spawn } = await import("node:child_process");

function run(name: string, cmd: string, opts: { cwd: string; env: NodeJS.ProcessEnv }): void {
  const child = spawn(cmd, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: "inherit",
    shell: true,
  });
  children.push(child);
  writePid(name, child.pid);
  child.on("exit", (code, signal) => {
    console.log(`[dev] ${name} skončil (code=${code}, signal=${signal}) – zastavuji zbytek.`);
    shutdown();
    process.exit(code ?? 1);
  });
}

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      if (!c.killed && c.exitCode === null) c.kill("SIGTERM");
    } catch {
      // ignoruj – proces už neběží
    }
  }
  cleanupPidFiles();
}

process.on("SIGINT", () => {
  console.log("\n[dev] SIGINT – zastavuji vše.");
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

console.log(`[dev] server  http://${displayHost}:${port} (host ${host})`);
console.log(`[dev] desktop http://${displayHost}:5173  → API ${apiTarget}`);
console.log(`[dev] mobile  http://${displayHost}:5174  → API ${apiTarget}`);
console.log("[dev] Ukončení: Ctrl+C");
console.log("");

run("server", "bun apps/server/src/index.ts", {
  cwd: root,
  env: { ...process.env, PORT: port, HOST: host },
});
run("desktop", "bun run dev", {
  cwd: path.join(root, "apps", "desktop"),
  env: { ...process.env, API_TARGET: apiTarget },
});
run("mobile", "bun run dev", {
  cwd: path.join(root, "apps", "mobile"),
  env: { ...process.env, API_TARGET: apiTarget },
});
