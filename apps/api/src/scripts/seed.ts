import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import { config } from "../config.js";
import { hashPassword } from "../utils/security.js";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "../../../..");
const demoPaymentsPath = path.join(rootDir, "database", "seeds", "001_demo_payments.sql");

const connection = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  multipleStatements: true
});

try {
  const passwordHash = await hashPassword(config.seed.adminPassword);
  await connection.execute(
    `INSERT INTO users (tenant_id, username, password_hash, full_name, role)
     VALUES (1, ?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), full_name = VALUES(full_name), role = 'admin', disabled = FALSE`,
    [config.seed.adminUsername, passwordHash, config.seed.adminFullName]
  );

  const demoPaymentsSql = await fs.readFile(demoPaymentsPath, "utf8");
  await connection.query(demoPaymentsSql);
  console.log(`Seeded admin user "${config.seed.adminUsername}" and demo payments.`);
} finally {
  await connection.end();
}
