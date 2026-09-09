import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
});

const DEFAULT_USERNAME = "pruthvirajchavan2002@gmail.com";
const DEFAULT_DISPLAY_NAME = "Pruthviraj Chavan";
const DEFAULT_SENDER_EMAIL = "pruthviraj9404@gmail.com";

// This is a one-way hash of the initial login password. The password itself is
// never stored in the source code or returned by the API.
const DEFAULT_PASSWORD_HASH =
  "scrypt:BWULiKNq0yjwK-oV_kv8wQ:7bqI-V4CSQWB02TWZEJOL1fgc67ghwTlq9kdQUU4QXoUP-Q_82r3M8lADrt0MQm2QGFEmK-s4Zkm9tr8kMMoTQ";

export async function initializeAppData() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  await pool.query(
    `INSERT INTO app_users (username, password_hash, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (username) DO NOTHING`,
    [DEFAULT_USERNAME, DEFAULT_PASSWORD_HASH, DEFAULT_DISPLAY_NAME],
  );

  await pool.query(
    `INSERT INTO app_settings (id, sender_email, sender_name)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_SENDER_EMAIL, DEFAULT_DISPLAY_NAME],
  );
}

export async function findUser(username: string) {
  const result = await pool.query<{
    id: number;
    username: string;
    password_hash: string;
    display_name: string;
  }>(
    `SELECT id, username, password_hash, display_name
     FROM app_users
     WHERE username = $1
     LIMIT 1`,
    [username],
  );
  return result.rows[0] ?? null;
}

export async function getAppSettings() {
  const result = await pool.query<{
    sender_email: string;
    sender_name: string;
    app_password_encrypted: string | null;
  }>(
    `SELECT sender_email, sender_name, app_password_encrypted
     FROM app_settings
     WHERE id = 1
     LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

export async function saveAppSettings(input: {
  senderEmail: string;
  senderName: string;
  appPasswordEncrypted?: string;
}) {
  const result = await pool.query(
    `UPDATE app_settings
     SET sender_email = $1,
         sender_name = $2,
         app_password_encrypted = COALESCE($3, app_password_encrypted),
         updated_at = NOW()
     WHERE id = 1
     RETURNING sender_email, sender_name, app_password_encrypted`,
    [input.senderEmail, input.senderName, input.appPasswordEncrypted ?? null],
  );
  return result.rows[0] ?? null;
}

export function getDefaultLoginDetails() {
  return {
    username: DEFAULT_USERNAME,
    displayName: DEFAULT_DISPLAY_NAME,
  };
}