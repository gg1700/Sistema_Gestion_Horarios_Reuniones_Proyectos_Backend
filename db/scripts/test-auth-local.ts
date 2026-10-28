import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ quiet: true });

async function main() {
  const target = new URL(process.env.LOCAL_DB_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433") {
    throw new Error("Solo se admiten pruebas contra PostgreSQL Docker local en el puerto 5433.");
  }
  const testUrl = new URL(target); testUrl.pathname = "/orbitia_auth_test";
  const administrationUrl = new URL(target); administrationUrl.pathname = "/postgres";
  const pool = new Pool({ connectionString: administrationUrl.toString(), ssl: false, connectionTimeoutMillis: 5000 });
  try {
    const existing = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", ["orbitia_auth_test"]);
    if (!existing.rowCount) await pool.query("CREATE DATABASE orbitia_auth_test");
  } finally { await pool.end(); }
  const testEnv = { ...process.env, NODE_ENV: "test", LOCAL_DB_URL: testUrl.toString() };
  for (const args of [
    ["--import", "tsx", "db/scripts/setup-local.ts"],
    ["node_modules/vitest/vitest.mjs", "run", "tests/auth.oauth.local.test.ts"],
  ]) {
    const result = spawnSync(process.execPath, args, { env: testEnv, stdio: "inherit" });
    if (result.status !== 0) { process.exitCode = result.status ?? 1; return; }
  }
}

main().catch(() => {
  console.error("No se pudieron iniciar las pruebas locales. Comprueba Docker y LOCAL_DB_URL.");
  process.exitCode = 1;
});

