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
  const duplicateUpdates = [
    "tenant_id = VALUES(tenant_id)",
    "full_name = VALUES(full_name)",
    "role = 'admin'",
    "disabled = FALSE"
  ];
  if (config.seed.resetAdminPassword) {
    duplicateUpdates.push("password_hash = VALUES(password_hash)");
  }

  await connection.execute(
    `INSERT INTO users (tenant_id, username, password_hash, full_name, role)
     VALUES (1, ?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE ${duplicateUpdates.join(", ")}`,
    [config.seed.adminUsername, passwordHash, config.seed.adminFullName]
  );

  if (config.seed.demoData) {
    const demoPaymentsSql = await fs.readFile(demoPaymentsPath, "utf8");
    await connection.query(demoPaymentsSql);
    console.log(`Seeded admin user "${config.seed.adminUsername}" and demo payments.`);
  } else {
    console.log(`Seeded admin user "${config.seed.adminUsername}". Demo payments skipped.`);
  }

  if (config.seed.resetAdminPassword) {
    console.log(`Password reset was enabled for admin user "${config.seed.adminUsername}".`);
  }
} finally {
  await connection.end();
}
