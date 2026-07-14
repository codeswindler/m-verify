import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { config } from "../config.js";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "../../../..");
const schemaPath = path.join(rootDir, "database", "schema.sql");
const migrationsDir = path.join(rootDir, "database", "migrations");
const migrationLock = `mverify_schema_migrations_${config.db.database}`;

const connection = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  multipleStatements: true
});

async function tableExists(tableName: string): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS table_count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.table_count ?? 0) > 0;
}

async function ensureMigrationTable(): Promise<void> {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(160) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function migrationApplied(name: string): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT name FROM schema_migrations WHERE name = ? LIMIT 1",
    [name]
  );
  return rows.length > 0;
}

async function markMigrationApplied(name: string): Promise<void> {
  await connection.execute("INSERT IGNORE INTO schema_migrations (name) VALUES (?)", [name]);
}

let lockAcquired = false;
try {
  const [lockRows] = await connection.execute<RowDataPacket[]>("SELECT GET_LOCK(?, 30) AS acquired", [migrationLock]);
  lockAcquired = Number(lockRows[0]?.acquired ?? 0) === 1;
  if (!lockAcquired) throw new Error("Could not acquire the database migration lock");

  if (!(await tableExists("tenants"))) {
    await connection.query(await fs.readFile(schemaPath, "utf8"));
    console.log("Applied the baseline database schema.");
  }

  await ensureMigrationTable();
  await markMigrationApplied("001_schema");

  const migrationFiles = (await fs.readdir(migrationsDir))
    .filter((fileName) => /^\d+_.*\.sql$/.test(fileName) && fileName !== "001_schema.sql")
    .sort((left, right) => left.localeCompare(right));

  for (const fileName of migrationFiles) {
    const migrationName = path.basename(fileName, ".sql");
    if (await migrationApplied(migrationName)) continue;

    const migrationSql = await fs.readFile(path.join(migrationsDir, fileName), "utf8");
    await connection.query(migrationSql);
    await markMigrationApplied(migrationName);
    console.log(`Applied database migration ${migrationName}.`);
  }

  console.log("Database migrations are current.");
} finally {
  if (lockAcquired) {
    await connection.execute("SELECT RELEASE_LOCK(?)", [migrationLock]);
  }
  await connection.end();
}
