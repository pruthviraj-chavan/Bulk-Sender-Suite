import type { VercelRequest, VercelResponse } from "@vercel/node";

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
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const body = getRequestBody(req);
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const emailBody = typeof body.emailBody === "string" ? body.emailBody.trim() : "";
    const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail.trim() : "";
    const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim() : "";
    const resumeBase64 = typeof body.resumeBase64 === "string" ? body.resumeBase64 : "";
    const resumeFilename = typeof body.resumeFilename === "string" ? body.resumeFilename : "";

    if (!subject || !emailBody || !recipientEmail) {
      return res.status(400).json({ message: "Subject, email body, and recipient email are required" });
    }

    const [{ default: nodemailer }, { getAppSettings, initializeAppData }, { decryptAppPassword }] =
      await Promise.all([
        import("nodemailer"),
        import("../server/db"),
        import("../server/security"),
      ]);

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
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
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
    if (err instanceof SyntaxError) {
      return res.status(400).json({ message: "Request body must be valid JSON" });
    }

    const code = typeof err?.code === "string" ? err.code : "";
    const message =
      code === "EAUTH" || code === "AUTHENTICATION"
        ? "Gmail rejected the saved app password. Generate a new Gmail App Password and save it again."
        : code === "ETIMEDOUT" || code === "ESOCKET"
          ? "Gmail SMTP timed out. Please try again in a moment."
          : err?.message || "Failed to send email";

    return res.status(500).json({
      success: false,
      error: message,
    });
  }
}
