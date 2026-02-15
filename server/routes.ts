import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import { log } from "./index";
import type { EmailEntry, SmtpConfig } from "@shared/schema";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const LOGS_DIR = path.join(process.cwd(), "data");

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

let stopFlag = false;

function extractNameFromEmail(email: string): string {
  const local = email.split("@")[0];
  const cleaned = local.replace(/[._0-9\-]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\n\r]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function logFailedEmail(email: string, error: string) {
  const logFile = path.join(LOGS_DIR, "failed_emails.log");
  const line = `[${new Date().toISOString()}] ${email} — ${error}\n`;
  fs.appendFileSync(logFile, line);
}

async function sendEmailsInBackground(config: SmtpConfig) {
  const emails = storage.getEmails().filter((e) => e.status === "pending");
  if (emails.length === 0) {
    storage.setProgress({ isRunning: false });
    return;
  }

  storage.setProgress({
    total: emails.length,
    sent: 0,
    failed: 0,
    remaining: emails.length,
    isRunning: true,
    errors: [],
    currentEmail: undefined,
  });

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: config.senderEmail,
      pass: config.appPassword,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const resume = storage.getResume();
  const attachments: nodemailer.SendMailOptions["attachments"] = [];
  if (resume) {
    const filePath = path.join(UPLOADS_DIR, resume.filename);
    if (fs.existsSync(filePath)) {
      attachments.push({
        filename: resume.originalName,
        path: filePath,
      });
    }
  }

  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  for (let i = 0; i < emails.length; i++) {
    if (stopFlag) {
      stopFlag = false;
      storage.setProgress({
        isRunning: false,
        remaining: emails.length - i,
        currentEmail: undefined,
      });
      log("Sending stopped by user", "email");
      return;
    }

    const entry = emails[i];
    storage.setProgress({
      currentEmail: entry.email,
      remaining: emails.length - i,
    });

    const name = extractNameFromEmail(entry.email);
    const greeting = name ? `Hi ${name}` : "Hello";
    const bodyWithName = config.emailBody.replace(/\{\{name\}\}/g, name || "there");
    const fullBody = bodyWithName.startsWith(greeting) ? bodyWithName : `${greeting},\n\n${bodyWithName}`;

    const fromField = config.senderName
      ? `"${config.senderName}" <${config.senderEmail}>`
      : config.senderEmail;

    try {
      await transporter.sendMail({
        from: fromField,
        to: entry.email,
        subject: config.subject,
        text: fullBody,
        attachments,
      });

      sent++;
      storage.updateEmailStatus(entry.email, "sent");
      storage.setProgress({ sent, remaining: emails.length - i - 1 });
      log(`Sent to ${entry.email}`, "email");
    } catch (err: any) {
      failed++;
      const errMsg = err.message || "Unknown error";
      errors.push({ email: entry.email, error: errMsg });
      storage.updateEmailStatus(entry.email, "failed", errMsg);
      storage.setProgress({ failed, errors: [...errors] });
      logFailedEmail(entry.email, errMsg);
      log(`Failed: ${entry.email} — ${errMsg}`, "email");
    }

    if (i < emails.length - 1) {
      const delay = 3000 + Math.random() * 2000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  storage.setProgress({
    isRunning: false,
    remaining: 0,
    currentEmail: undefined,
  });

  log(`Sending complete: ${sent} sent, ${failed} failed`, "email");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/emails", (_req, res) => {
    res.json(storage.getEmails());
  });

  app.post("/api/emails", (req, res) => {
    const { emails: raw } = req.body;
    if (!raw || typeof raw !== "string") {
      return res.status(400).json({ message: "emails field is required" });
    }

    const parsed = parseEmails(raw);
    if (parsed.length === 0) {
      return res.status(400).json({ message: "No valid emails found" });
    }

    const entries: EmailEntry[] = parsed.map((email) => ({
      email,
      name: extractNameFromEmail(email),
      status: "pending" as const,
    }));

    const added = storage.addEmails(entries);
    res.json({ added, total: storage.getEmails().length });
  });

  app.delete("/api/emails", (_req, res) => {
    storage.clearEmails();
    storage.resetProgress();
    res.json({ ok: true });
  });

  app.delete("/api/emails/:email", (req, res) => {
    const removed = storage.removeEmail(decodeURIComponent(req.params.email));
    if (!removed) {
      return res.status(404).json({ message: "Email not found" });
    }
    res.json({ ok: true });
  });

  app.get("/api/resume", (_req, res) => {
    const resume = storage.getResume();
    res.json(resume);
  });

  app.post("/api/resume", upload.single("resume"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    storage.deleteResume();

    storage.setResume({
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
    });

    res.json(storage.getResume());
  });

  app.delete("/api/resume", (_req, res) => {
    storage.deleteResume();
    res.json({ ok: true });
  });

  app.get("/api/progress", (_req, res) => {
    res.json(storage.getProgress());
  });

  app.post("/api/send", (req, res) => {
    const progress = storage.getProgress();
    if (progress.isRunning) {
      return res.status(409).json({ message: "Sending is already in progress" });
    }

    const { senderEmail, appPassword, subject, emailBody, senderName } = req.body;

    if (!senderEmail || !appPassword || !subject || !emailBody) {
      return res.status(400).json({ message: "All SMTP fields are required" });
    }

    storage.resetPendingEmails();

    const pendingEmails = storage.getEmails().filter((e) => e.status === "pending");
    if (pendingEmails.length === 0) {
      return res.status(400).json({ message: "No pending emails to send" });
    }

    stopFlag = false;
    const config: SmtpConfig = {
      senderEmail,
      appPassword,
      senderName: senderName || "",
      subject,
      emailBody,
    };

    sendEmailsInBackground(config).catch((err) => {
      log(`Background sending error: ${err.message}`, "email");
      storage.setProgress({ isRunning: false });
    });

    res.json({ message: "Sending started", count: pendingEmails.length });
  });

  app.post("/api/stop", (_req, res) => {
    stopFlag = true;
    res.json({ ok: true });
  });

  return httpServer;
}
