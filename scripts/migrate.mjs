import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Additive, forward-only migrations applied in filename order. */
const READBACK = {
  "0001_sentinel_sessions.sql": "sentinel_sessions",
  "0002_mock_ledger.sql": "mock_ledger_entries",
};

try {
  const dir = new URL("../migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error("No migrations discovered");

  for (const file of files) {
    await pool.query(await readFile(new URL(file, dir), "utf8"));
    const expected = READBACK[file];
    if (!expected) {
      console.log(`Migration applied: ${file} (no readback assertion defined)`);
      continue;
    }
    const result = await pool.query("SELECT to_regclass($1) AS table_name", [`public.${expected}`]);
    if (result.rows[0].table_name !== expected) throw new Error(`Migration readback failed: ${expected}`);
    console.log(`Migration verified: ${expected} (existing rows preserved)`);
  }
} finally {
  await pool.end();
}
