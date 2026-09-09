import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import { getAuthUser } from "../server/auth-cookie";
import { getAppSettings, initializeAppData } from "../server/db";
import { decryptAppPassword } from "../server/security";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  if (!getAuthUser(req)) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const {
    subject,
    emailBody,
    recipientEmail,
    recipientName,
    resumeBase64,
    resumeFilename,
  } = req.body;

  if (!subject || !emailBody || !recipientEmail) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    await initializeAppData();
    const settings = await getAppSettings();
    if (!settings?.app_password_encrypted) {
      return res.status(400).json({ message: "Save your Gmail app password in settings first" });
    }
    const appPassword = decryptAppPassword(settings.app_password_encrypted);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: settings.sender_email,
        pass: appPassword,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const name = recipientName || "";
    const greeting = name ? `Hi ${name}` : "Hello";
    const bodyWithName = emailBody.replace(/\{\{name\}\}/g, name || "there");
    const fullBody = bodyWithName.startsWith(greeting)
      ? bodyWithName
      : `${greeting},\n\n${bodyWithName}`;

    const fromField = `"${settings.sender_name}" <${settings.sender_email}>`;

    const attachments: any[] = [];
    if (resumeBase64 && resumeFilename) {
      attachments.push({
        filename: resumeFilename,
        content: Buffer.from(resumeBase64, "base64"),
        contentType: "application/pdf",
      });
    }

    await transporter.sendMail({
      from: fromField,
      to: recipientEmail,
      subject,
      text: fullBody,
      attachments,
    });

    return res.status(200).json({ success: true, email: recipientEmail });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      email: recipientEmail,
      error: err.message || "Failed to send email",
    });
  }
}
