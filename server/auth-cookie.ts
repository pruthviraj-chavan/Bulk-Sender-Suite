import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const COOKIE_NAME = "email_automation_session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

export interface AuthCookieUser {
  userId: number;
  username: string;
  displayName: string;
}

function getSessionSecret() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return process.env.SESSION_SECRET;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function setAuthCookie(res: VercelResponse, user: AuthCookieUser) {
  const payload = encode(JSON.stringify({
    ...user,
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  }));
  const token = `${payload}.${sign(payload)}`;

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}`,
  );
}

export function clearAuthCookie(res: VercelResponse) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
}

function getCookieValue(req: VercelRequest) {
  const cookies = req.headers.cookie?.split(";") ?? [];
  const cookie = cookies.find((entry) => entry.trim().startsWith(`${COOKIE_NAME}=`));
  return cookie?.trim().slice(COOKIE_NAME.length + 1) ?? null;
}

export function getAuthUser(req: VercelRequest) {
  const token = getCookieValue(req);
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  let expectedSignature: string;
  try {
    expectedSignature = sign(payload);
  } catch {
    return null;
  }
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthCookieUser & {
      expiresAt: number;
    };
    if (!user.userId || !user.username || !user.expiresAt || user.expiresAt < Date.now()) {
      return null;
    }
    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
    };
  } catch {
    return null;
  }
}