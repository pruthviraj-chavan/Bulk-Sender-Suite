import type { Express } from "express";
import { type Server } from "http";
import nodemailer from "nodemailer";
import { log } from "./index";
import { findUser, getAppSettings, saveAppSettings } from "./db";
import { decryptAppPassword, encryptAppPassword, verifyPassword } from "./security";
import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
    displayName: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/auth/me", (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ authenticated: false });
    }
    return res.json({
      authenticated: true,
      username: req.session.username,
      displayName: req.session.displayName,
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const user = username ? await findUser(username) : null;

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) return reject(error);
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.displayName = user.display_name;
        req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
      });
    });

    return res.json({
      authenticated: true,
      username: user.username,
      displayName: user.display_name,
    });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    req.session.destroy((error) => {
      if (error) return res.status(500).json({ message: "Could not log out" });
      res.clearCookie("connect.sid");
      return res.json({ success: true });
    });
  });

  app.get("/api/settings", async (_req, res) => {
    const settings = await getAppSettings();
    if (!settings) return res.status(404).json({ message: "Settings not found" });
    return res.json({
      senderEmail: settings.sender_email,
      senderName: settings.sender_name,
      hasAppPassword: Boolean(settings.app_password_encrypted),
    });
  });

  app.put("/api/settings", async (req, res) => {
    const senderEmail = typeof req.body?.senderEmail === "string" ? req.body.senderEmail.trim().toLowerCase() : "";
    const senderName = typeof req.body?.senderName === "string" ? req.body.senderName.trim() : "";
    const appPassword = typeof req.body?.appPassword === "string" ? req.body.appPassword.replace(/\s+/g, "") : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail) || !senderName) {
      return res.status(400).json({ message: "A valid sender email and name are required" });
    }

    const current = await getAppSettings();
    const appPasswordEncrypted = appPassword
      ? encryptAppPassword(appPassword)
      : current?.app_password_encrypted ?? undefined;

    if (!appPasswordEncrypted) {
      return res.status(400).json({ message: "App password is required the first time you save settings" });
    }

    await saveAppSettings({ senderEmail, senderName, appPasswordEncrypted });
    return res.json({ senderEmail, senderName, hasAppPassword: true });
  });

  app.post("/api/send-email", async (req, res) => {
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

      log(`Sent to ${recipientEmail}`, "email");
      return res.status(200).json({ success: true, email: recipientEmail });
    } catch (err: any) {
      log(`Failed: ${recipientEmail} — ${err.message}`, "email");
      return res.status(500).json({
        success: false,
        email: recipientEmail,
        error: err.message || "Failed to send email",
      });
    }
  });

  return httpServer;
}
