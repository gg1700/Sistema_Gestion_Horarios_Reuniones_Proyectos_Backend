import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ quiet: true });

async function migrate(pool: Pool, files: string[]) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(434445)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_history (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(300) UNIQUE NOT NULL,
        created_by VARCHAR(200) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const done = await client.query(
        "SELECT 1 FROM migrations_history WHERE file_name = $1",
        [file],
      );

      if (done.rowCount) continue;

      await client.query(
        fs.readFileSync(
          path.join(process.cwd(), "db/migrations", file),
          "utf8",
        ),
      );

      await client.query(
        `INSERT INTO migrations_history (file_name, created_by)
         VALUES ($1, 'repository-local')`,
        [file],
      );

      console.log("Migración aplicada:", file);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const target = new URL(process.env.LOCAL_DB_URL ?? "");

  const isLocalHost = [
    "localhost",
    "127.0.0.1",
    "[::1]",
  ].includes(target.hostname);

  const port = target.port || "5432";

  const isAllowedDatabase =
    (port === "5433" && target.pathname === "/Telematicos") ||
    (port === "5432" && target.pathname === "/orbita_db");

  if (!isLocalHost || !isAllowedDatabase) {
    throw new Error(
      "Usar una base local: 5433/Telematicos o 5432/orbita_db.",
    );
  }

  const test = process.argv.includes("--test");

  if (test) {
    const administration = new Pool({
      connectionString: target.toString(),
      connectionTimeoutMillis: 5000,
    });

    try {
      const exists = await administration.query(
        `SELECT 1
         FROM pg_database
         WHERE datname = 'orbitia_repository_test'`,
      );

      if (!exists.rowCount) {
        await administration.query(
          "CREATE DATABASE orbitia_repository_test",
        );
      }
    } finally {
      await administration.end();
    }

    target.pathname = "/orbitia_repository_test";
  }

  const pool = new Pool({
    connectionString: target.toString(),
    connectionTimeoutMillis: 5000,
  });

  try {
    const files = test
      ? fs
          .readdirSync("db/migrations")
          .filter((file) => file.endsWith(".sql"))
          .sort()
      : [
          "008-create-github-activity-tables.sql",
          "009-create-featured-repository-table.sql",
        ];

    await migrate(pool, files);
  } finally {
    await pool.end();
  }

  if (test) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "node_modules/vitest/vitest.mjs"),
        "run",
        "tests/github-repositories.test.ts",
        "tests/github-repositories.local.test.ts",
        "tests/public-profile-filter.test.ts",
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          NODE_ENV: "test",
          LOCAL_DB_URL: target.toString(),
        },
      },
    );

    process.exitCode = result.status ?? 1;
  }
}

main().catch((error) => {
  console.error("Falló la preparación local:", {
    code: error.code,
    message: error.message,
  });

  process.exitCode = 1;
});