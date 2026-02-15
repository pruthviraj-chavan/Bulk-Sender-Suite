import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const {
    senderEmail,
    appPassword,
    senderName,
    subject,
    emailBody,
    recipientEmail,
    recipientName,
    resumeBase64,
    resumeFilename,
  } = req.body;

  if (!senderEmail || !appPassword || !subject || !emailBody || !recipientEmail) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: senderEmail,
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

    const fromField = senderName
      ? `"${senderName}" <${senderEmail}>`
      : senderEmail;

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
