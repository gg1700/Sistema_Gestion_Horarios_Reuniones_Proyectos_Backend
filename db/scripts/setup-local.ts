import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ quiet: true });

async function main() {
  const connectionString = process.env.LOCAL_DB_URL;
  if (!connectionString) throw new Error("Configura LOCAL_DB_URL.");
  const target = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.port !== "5433" || !["/Telematicos", "/orbitia_auth_test"].includes(target.pathname)) {
    throw new Error("Este comando solo migra PostgreSQL local en el puerto 5433. No admite producción.");
  }
  const pool = new Pool({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS migrations_history (
      id SERIAL PRIMARY KEY, file_name VARCHAR(300) UNIQUE NOT NULL,
      created_by VARCHAR(200) NOT NULL, timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of fs.readdirSync(directory).filter(file => file.endsWith(".sql")).sort()) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(430045)");
        const applied = await client.query("SELECT 1 FROM migrations_history WHERE file_name = $1", [file]);
        if (!applied.rowCount) {
          await client.query(fs.readFileSync(path.join(directory, file), "utf8"));
          await client.query("INSERT INTO migrations_history(file_name, created_by) VALUES ($1, $2)", [file, "local-setup"]);
        }
        await client.query("COMMIT");
        console.log(`${applied.rowCount ? "Ya aplicada" : "Aplicada"}: ${file}`);
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
  } finally { await pool.end(); }
}

main().catch(() => { console.error("No se pudo preparar la base local. Se detuvo la migración; revisa PostgreSQL y sus migraciones."); process.exitCode = 1; });
