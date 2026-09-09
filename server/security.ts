import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_VERSION = "v1";

function getEncryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured before starting the server");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptAppPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptAppPassword(payload: string) {
  const [version, ivEncoded, authTagEncoded, encryptedEncoded] = payload.split(":");
  if (version !== ENCRYPTION_VERSION || !ivEncoded || !authTagEncoded || !encryptedEncoded) {
    throw new Error("Stored app password has an invalid format");
  }

  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltEncoded, hashEncoded] = storedHash.split(":");
  if (algorithm !== "scrypt" || !saltEncoded || !hashEncoded) return false;

  const expected = Buffer.from(hashEncoded, "base64url");
  const actual = scryptSync(password, Buffer.from(saltEncoded, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}