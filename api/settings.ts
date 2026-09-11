import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAppSettings, initializeAppData, saveAppSettings } from "../server/db";
import { encryptAppPassword } from "../server/security";

function getRequestBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    const parsed: unknown = JSON.parse(req.body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET" && req.method !== "PUT") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    await initializeAppData();
    const settings = await getAppSettings();
    if (!settings) return res.status(404).json({ message: "Settings not found" });

    if (req.method === "GET") {
      return res.status(200).json({
        senderEmail: settings.sender_email,
        senderName: settings.sender_name,
        hasAppPassword: Boolean(settings.app_password_encrypted),
      });
    }

    const body = getRequestBody(req);
    const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail.trim().toLowerCase() : "";
    const senderName = typeof body.senderName === "string" ? body.senderName.trim() : "";
    const appPassword = typeof body.appPassword === "string" ? body.appPassword.replace(/\s+/g, "") : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail) || !senderName) {
      return res.status(400).json({ message: "A valid sender email and name are required" });
    }

    const appPasswordEncrypted = appPassword
      ? encryptAppPassword(appPassword)
      : settings.app_password_encrypted ?? undefined;

    if (!appPasswordEncrypted) {
      return res.status(400).json({ message: "App password is required the first time you save settings" });
    }

    await saveAppSettings({ senderEmail, senderName, appPasswordEncrypted });
    return res.status(200).json({ senderEmail, senderName, hasAppPassword: true });
  } catch (error) {
    console.error("Vercel settings error:", error);
    if (error instanceof SyntaxError) {
      return res.status(400).json({ message: "Request body must be valid JSON" });
    }
    return res.status(500).json({ message: "Settings service is not configured correctly" });
  }
}