import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import pool from "../../src/config/database.config";

dotenv.config();

const migrationsFolder = path.join(__dirname, "../my_migrations");

async function createMigrationsHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "my_migrations_history" (
      "id" SERIAL PRIMARY KEY NOT NULL,
      "file_name" varchar(300) UNIQUE NOT NULL,
      "created_by" varchar(200) NOT NULL,
      "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

async function findExecutedFiles() {
  const { rows } = await pool.query(`SELECT file_name FROM "my_migrations_history"`);
  const executedFiles: string[] = rows.map((row) => row.file_name);
  return executedFiles;
}

async function executeMigrationFile(migrationFile: string) {
  const client = await pool.connect();
  try {
    const migrationSQL = fs.readFileSync(path.join(migrationsFolder, migrationFile), "utf-8");
    await client.query("BEGIN");
    await client.query(migrationSQL);
    await client.query(
      `INSERT INTO "my_migrations_history" ("file_name", "created_by") VALUES ($1, $2)`,
      [migrationFile, process.env.DB_USER ?? "local"]
    );
    await client.query("COMMIT");
    console.log(`Migracion local ejecutada: ${migrationFile}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`Error en la migracion ${migrationFile}: ${(error as Error).message}`);
  } finally {
    client.release();
  }
}

async function executeMigrations(executedFiles: string[]) {
  const migrationFiles = fs
    .readdirSync(migrationsFolder)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const pendingFiles = migrationFiles.filter((fileName) => !executedFiles.includes(fileName));
  if (pendingFiles.length === 0) {
    console.log("No hay migraciones locales pendientes.");
    return;
  }
  for (const migrationFile of pendingFiles) {
    await executeMigrationFile(migrationFile);
  }
}

export async function migrateLocalDatabase(): Promise<void> {
  try {
    if (process.env.NODE_ENV === "production") {
      console.log("Las migraciones locales no se pueden ejecutar en produccion.");
      return;
    }
    await createMigrationsHistoryTable();
    const executedFiles = await findExecutedFiles();
    await executeMigrations(executedFiles);
    console.log("Proceso de migracion local completado.");
    process.exitCode = 0;
  } catch (error) {
    console.error(`Error al migrar la Base de Datos local: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateLocalDatabase();
