import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser } from "../server/auth-cookie";
import { getAppSettings, initializeAppData, saveAppSettings } from "../server/db";
import { encryptAppPassword } from "../server/security";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });

  try {
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

    if (req.method !== "PUT") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
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
    return res.status(500).json({ message: "Settings service is not configured correctly" });
  }
}