// DbProvider – tenká hranice nad `bun:sqlite` (F2).
//
// Důvod: BLOB sloupce vrací `Uint8Array` (ne `Buffer` jako better-sqlite3),
// WAL + busy_timeout se musí nastavit explicitně a per-canvas soubory se
// sdílí přes pool v canvas-storu. Vše za tímto interfacem, aby šel provider
// v testech mocknout a runtime vyměnit bez zásahu do storů.

import { Database } from "bun:sqlite";

export interface DbRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface DbHandle {
  exec(sql: string): void;
  get<T>(sql: string, ...params: unknown[]): T | null;
  all<T>(sql: string, ...params: unknown[]): T[];
  run(sql: string, ...params: unknown[]): DbRunResult;
  close(): void;
}

export interface DbProvider {
  /** Otevře DB soubor. `readonly=true` nevyrobí soubor – na chybějícím throw. */
  open(path: string, readonly?: boolean): DbHandle;
}

/** Normalizuje BLOB výstup bun:sqlite (Uint8Array) na Buffer. */
export function toBuffer(value: Uint8Array | Buffer | null | undefined): Buffer | null {
  if (value == null) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

const BUSY_TIMEOUT_MS = 5000;

interface BunStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): DbRunResult;
}

class BunSqliteHandle implements DbHandle {
  constructor(private readonly db: Database) {}

  exec(sql: string): void {
    this.db.exec(sql);
  }

  get<T>(sql: string, ...params: unknown[]): T | null {
    const stmt = this.db.query(sql) as unknown as BunStatement;
    return (stmt.get(...params) as T | null) ?? null;
  }

  all<T>(sql: string, ...params: unknown[]): T[] {
    const stmt = this.db.query(sql) as unknown as BunStatement;
    return stmt.all(...params) as T[];
  }

  run(sql: string, ...params: unknown[]): DbRunResult {
    const stmt = this.db.query(sql) as unknown as BunStatement;
    return stmt.run(...params);
  }

  close(): void {
    this.db.close();
  }
}

export class BunSqliteProvider implements DbProvider {
  open(path: string, readonly = false): DbHandle {
    const db = readonly
      ? new Database(path, { readonly: true })
      : new Database(path, { create: true });
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
    if (!readonly) {
      db.exec("PRAGMA journal_mode = WAL;");
    }
    return new BunSqliteHandle(db);
  }
}

let defaultProvider: DbProvider | null = null;

/** Lazy singleton pro produkční použití (testy si předají vlastní). */
export function getDefaultDbProvider(): DbProvider {
  if (!defaultProvider) defaultProvider = new BunSqliteProvider();
  return defaultProvider;
}

/** Pro testy / hot-reload. */
export function setDefaultDbProvider(provider: DbProvider | null): void {
  defaultProvider = provider;
}
