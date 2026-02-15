import type { EmailEntry, SendingProgress, ResumeInfo } from "@shared/schema";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const EMAILS_FILE = path.join(DATA_DIR, "emails.json");
const RESUME_FILE = path.join(DATA_DIR, "resume.json");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

ensureDirs();

export interface IStorage {
  getEmails(): EmailEntry[];
  addEmails(emails: EmailEntry[]): number;
  removeEmail(email: string): boolean;
  clearEmails(): void;
  updateEmailStatus(email: string, status: "pending" | "sent" | "failed", error?: string): void;
  resetPendingEmails(): void;

  getResume(): ResumeInfo | null;
  setResume(info: ResumeInfo): void;
  deleteResume(): void;

  getProgress(): SendingProgress;
  setProgress(progress: Partial<SendingProgress>): void;
  resetProgress(): void;
}

class FileStorage implements IStorage {
  private emails: EmailEntry[] = [];
  private resume: ResumeInfo | null = null;
  private progress: SendingProgress = {
    total: 0,
    sent: 0,
    failed: 0,
    remaining: 0,
    currentEmail: undefined,
    isRunning: false,
    errors: [],
  };

  constructor() {
    this.loadEmails();
    this.loadResume();
  }

  private loadEmails() {
    try {
      if (fs.existsSync(EMAILS_FILE)) {
        const raw = fs.readFileSync(EMAILS_FILE, "utf-8");
        this.emails = JSON.parse(raw);
      }
    } catch {
      this.emails = [];
    }
  }

  private loadResume() {
    try {
      if (fs.existsSync(RESUME_FILE)) {
        const raw = fs.readFileSync(RESUME_FILE, "utf-8");
        this.resume = JSON.parse(raw);
        if (this.resume && !fs.existsSync(path.join(UPLOADS_DIR, this.resume.filename))) {
          this.resume = null;
          fs.unlinkSync(RESUME_FILE);
        }
      }
    } catch {
      this.resume = null;
    }
  }

  private saveResume() {
    ensureDirs();
    if (this.resume) {
      fs.writeFileSync(RESUME_FILE, JSON.stringify(this.resume, null, 2));
    } else if (fs.existsSync(RESUME_FILE)) {
      fs.unlinkSync(RESUME_FILE);
    }
  }

  private saveEmails() {
    ensureDirs();
    fs.writeFileSync(EMAILS_FILE, JSON.stringify(this.emails, null, 2));
  }

  getEmails(): EmailEntry[] {
    return [...this.emails];
  }

  addEmails(newEmails: EmailEntry[]): number {
    const existingSet = new Set(this.emails.map(e => e.email.toLowerCase()));
    let added = 0;
    for (const entry of newEmails) {
      const lower = entry.email.toLowerCase();
      if (!existingSet.has(lower)) {
        existingSet.add(lower);
        this.emails.push({ ...entry, email: lower });
        added++;
      }
    }
    this.saveEmails();
    return added;
  }

  removeEmail(email: string): boolean {
    const before = this.emails.length;
    this.emails = this.emails.filter(e => e.email.toLowerCase() !== email.toLowerCase());
    this.saveEmails();
    return this.emails.length < before;
  }

  clearEmails(): void {
    this.emails = [];
    this.saveEmails();
  }

  updateEmailStatus(email: string, status: "pending" | "sent" | "failed", error?: string): void {
    const entry = this.emails.find(e => e.email.toLowerCase() === email.toLowerCase());
    if (entry) {
      entry.status = status;
      if (error) entry.error = error;
      this.saveEmails();
    }
  }

  resetPendingEmails(): void {
    for (const e of this.emails) {
      if (e.status === "failed") {
        e.status = "pending";
        e.error = undefined;
      }
    }
    this.saveEmails();
  }

  getResume(): ResumeInfo | null {
    return this.resume;
  }

  setResume(info: ResumeInfo): void {
    this.resume = info;
    this.saveResume();
  }

  deleteResume(): void {
    if (this.resume) {
      const filepath = path.join(UPLOADS_DIR, this.resume.filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      this.resume = null;
      this.saveResume();
    }
  }

  getProgress(): SendingProgress {
    return { ...this.progress };
  }

  setProgress(update: Partial<SendingProgress>): void {
    this.progress = { ...this.progress, ...update };
  }

  resetProgress(): void {
    this.progress = {
      total: 0,
      sent: 0,
      failed: 0,
      remaining: 0,
      currentEmail: undefined,
      isRunning: false,
      errors: [],
    };
  }
}

export const storage = new FileStorage();
