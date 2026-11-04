import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://redekorate:redekorate@localhost:5432/redekorate",
});

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
