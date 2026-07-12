import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { config } from "../config.js";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "../../../..");
const schemaPath = path.join(rootDir, "database", "schema.sql");
const darajaTimeMigrationPath = path.join(rootDir, "database", "migrations", "006_correct_daraja_payment_times.sql");

const sql = await fs.readFile(schemaPath, "utf8");
const connection = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  multipleStatements: true
});

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const [columns] = await connection.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [config.db.database, tableName, columnName]
  );
  return columns.length > 0;
}

try {
  await connection.query(sql);
  await connection.changeUser({ database: config.db.database });
  if (!(await columnExists("tenant_mpesa_credentials", "payment_method"))) {
    await connection.query(
      "ALTER TABLE tenant_mpesa_credentials ADD COLUMN payment_method ENUM('paybill', 'till') NOT NULL DEFAULT 'paybill' AFTER environment"
    );
    console.log("Added tenant_mpesa_credentials.payment_method.");
  }
  if (await columnExists("tenant_mpesa_credentials", "callback_secret_hash")) {
    await connection.query("ALTER TABLE tenant_mpesa_credentials DROP COLUMN callback_secret_hash");
    console.log("Dropped tenant_mpesa_credentials.callback_secret_hash.");
  }
  if (await columnExists("tenant_mpesa_credentials", "callback_secret_hint")) {
    await connection.query("ALTER TABLE tenant_mpesa_credentials DROP COLUMN callback_secret_hint");
    console.log("Dropped tenant_mpesa_credentials.callback_secret_hint.");
  }
  await connection.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(160) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  const darajaTimeMigration = "006_correct_daraja_payment_times";
  const [applied] = await connection.execute<RowDataPacket[]>(
    "SELECT name FROM schema_migrations WHERE name = ? LIMIT 1",
    [darajaTimeMigration]
  );
  if (applied.length === 0) {
    const migrationSql = await fs.readFile(darajaTimeMigrationPath, "utf8");
    const [result] = await connection.query<ResultSetHeader[]>(migrationSql);
    const correctedRows = result.reduce((total, item) => total + (item.affectedRows ?? 0), 0);
    await connection.execute("INSERT INTO schema_migrations (name) VALUES (?)", [darajaTimeMigration]);
    console.log(`Corrected ${correctedRows} historical Daraja payment timestamp(s).`);
  }
  console.log("Database schema applied.");
} finally {
  await connection.end();
}
