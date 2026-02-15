import { z } from "zod";

export const emailEntrySchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  status: z.enum(["pending", "sent", "failed"]).default("pending"),
  error: z.string().optional(),
});

export type EmailEntry = z.infer<typeof emailEntrySchema>;

export const smtpConfigSchema = z.object({
  senderEmail: z.string().email("Valid Gmail address required"),
  appPassword: z.string().min(1, "App password is required"),
  senderName: z.string().optional(),
  subject: z.string().min(1, "Subject line is required"),
  emailBody: z.string().min(1, "Email body is required"),
});

export type SmtpConfig = z.infer<typeof smtpConfigSchema>;

export const addEmailsSchema = z.object({
  emails: z.string().min(1, "At least one email is required"),
});

export type AddEmailsInput = z.infer<typeof addEmailsSchema>;

export const sendingProgressSchema = z.object({
  total: z.number(),
  sent: z.number(),
  failed: z.number(),
  remaining: z.number(),
  currentEmail: z.string().optional(),
  isRunning: z.boolean(),
  errors: z.array(z.object({
    email: z.string(),
    error: z.string(),
  })),
});

export type SendingProgress = z.infer<typeof sendingProgressSchema>;

export interface ResumeInfo {
  filename: string;
  originalName: string;
  size: number;
  uploadedAt: string;
}

export interface DashboardState {
  emails: EmailEntry[];
  resume: ResumeInfo | null;
  progress: SendingProgress;
}
