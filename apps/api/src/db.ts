import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { config } from "./config.js";

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  connectionLimit: config.db.connectionLimit,
  decimalNumbers: false,
  namedPlaceholders: false,
  timezone: "Z"
});

export type QueryExecutor = Pick<typeof pool, "execute"> | Pick<PoolConnection, "execute">;
export type DbParam = string | number | boolean | Date | null;
export type { PoolConnection, ResultSetHeader, RowDataPacket };

export async function pingDatabase(): Promise<void> {
  await pool.query("SELECT 1");
}

export async function withTransaction<T>(callback: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
