import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import { config } from "../config.js";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "../../../..");
const schemaPath = path.join(rootDir, "database", "schema.sql");

const sql = await fs.readFile(schemaPath, "utf8");
const connection = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  multipleStatements: true
});

try {
  await connection.query(sql);
  console.log("Database schema applied.");
} finally {
  await connection.end();
}
