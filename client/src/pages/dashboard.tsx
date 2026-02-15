import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Upload,
  Send,
  Trash2,
  FileText,
  Settings,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  StopCircle,
  AlertCircle,
  Users,
  Paperclip,
  Eye,
  EyeOff,
} from "lucide-react";

interface EmailEntry {
  email: string;
  name: string;
  status: "pending" | "sent" | "failed";
  error?: string;
}

interface SmtpConfig {
  senderEmail: string;
  appPassword: string;
  senderName: string;
  subject: string;
  emailBody: string;
}

interface ResumeFile {
  name: string;
  size: number;
  base64: string;
}

interface SendingProgress {
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  currentEmail: string;
  isRunning: boolean;
  errors: { email: string; error: string }[];
}

function extractNameFromEmail(email: string): string {
  const local = email.split("@")[0];
  const cleaned = local.replace(/[._0-9\-]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\n\r]+/)
    .map(e => e.trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

const STORAGE_KEY = "email_automation_list";

function loadEmails(): EmailEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveEmails(emails: EmailEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emails));
}

export default function Dashboard() {
  const { toast } = useToast();

  const [emails, setEmails] = useState<EmailEntry[]>(() => loadEmails());
  const [bulkText, setBulkText] = useState("");
  const [resume, setResume] = useState<ResumeFile | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({
    senderEmail: "",
    appPassword: "",
    senderName: "",
    subject: "",
    emailBody: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [progress, setProgress] = useState<SendingProgress>({
    total: 0,
    sent: 0,
    failed: 0,
    remaining: 0,
    currentEmail: "",
    isRunning: false,
    errors: [],
  });
  const stopRef = useRef(false);
  const [addingEmails, setAddingEmails] = useState(false);

  useEffect(() => {
    saveEmails(emails);
  }, [emails]);

  const addEmails = useCallback(() => {
    if (!bulkText.trim()) return;
    setAddingEmails(true);
    const parsed = parseEmails(bulkText);
    if (parsed.length === 0) {
      toast({ title: "No valid emails", description: "Could not find any valid email addresses.", variant: "destructive" });
      setAddingEmails(false);
      return;
    }
    const existingSet = new Set(emails.map(e => e.email));
    let added = 0;
    const newList = [...emails];
    for (const email of parsed) {
      if (!existingSet.has(email)) {
        existingSet.add(email);
        newList.push({ email, name: extractNameFromEmail(email), status: "pending" });
        added++;
      }
    }
    setEmails(newList);
    setBulkText("");
    toast({ title: "Emails added", description: `${added} email(s) added successfully.` });
    setAddingEmails(false);
  }, [bulkText, emails, toast]);

  const removeEmail = useCallback((email: string) => {
    setEmails(prev => prev.filter(e => e.email !== email));
  }, []);

  const clearEmails = useCallback(() => {
    setEmails([]);
    setProgress(p => ({ ...p, total: 0, sent: 0, failed: 0, remaining: 0, errors: [], isRunning: false, currentEmail: "" }));
    toast({ title: "Emails cleared", description: "All emails have been removed." });
  }, [toast]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Only PDF files are accepted.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setResume({ name: file.name, size: file.size, base64 });
      toast({ title: "Resume uploaded", description: "Your PDF has been loaded." });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [toast]);

  const startSending = useCallback(async () => {
    const pendingEmails = emails.filter(e => e.status !== "sent");
    if (pendingEmails.length === 0) {
      toast({ title: "No emails to send", description: "All emails have already been sent.", variant: "destructive" });
      return;
    }

    setEmails(prev => prev.map(e => e.status === "failed" ? { ...e, status: "pending" as const, error: undefined } : e));

    stopRef.current = false;
    const total = pendingEmails.length;
    let sent = 0;
    let failed = 0;
    const errors: { email: string; error: string }[] = [];

    setProgress({ total, sent: 0, failed: 0, remaining: total, currentEmail: "", isRunning: true, errors: [] });

    for (let i = 0; i < pendingEmails.length; i++) {
      if (stopRef.current) {
        setProgress(p => ({ ...p, isRunning: false, currentEmail: "" }));
        toast({ title: "Sending stopped", description: "The sending process has been halted." });
        return;
      }

      const entry = pendingEmails[i];
      setProgress(p => ({ ...p, currentEmail: entry.email, remaining: total - i }));

      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderEmail: smtpConfig.senderEmail,
            appPassword: smtpConfig.appPassword,
            senderName: smtpConfig.senderName,
            subject: smtpConfig.subject,
            emailBody: smtpConfig.emailBody,
            recipientEmail: entry.email,
            recipientName: entry.name,
            resumeBase64: resume?.base64 || null,
            resumeFilename: resume?.name || null,
          }),
        });

        const data = await res.json();

        if (data.success) {
          sent++;
          setEmails(prev => prev.map(e => e.email === entry.email ? { ...e, status: "sent" as const } : e));
          setProgress(p => ({ ...p, sent, remaining: total - i - 1 }));
        } else {
          failed++;
          const errMsg = data.error || "Unknown error";
          errors.push({ email: entry.email, error: errMsg });
          setEmails(prev => prev.map(e => e.email === entry.email ? { ...e, status: "failed" as const, error: errMsg } : e));
          setProgress(p => ({ ...p, failed, errors: [...errors] }));
        }
      } catch (err: any) {
        failed++;
        const errMsg = err.message || "Network error";
        errors.push({ email: entry.email, error: errMsg });
        setEmails(prev => prev.map(e => e.email === entry.email ? { ...e, status: "failed" as const, error: errMsg } : e));
        setProgress(p => ({ ...p, failed, errors: [...errors] }));
      }

      if (i < pendingEmails.length - 1 && !stopRef.current) {
        const delay = 3000 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    setProgress(p => ({ ...p, isRunning: false, remaining: 0, currentEmail: "" }));
  }, [emails, smtpConfig, resume, toast]);

  const stopSending = useCallback(() => {
    stopRef.current = true;
  }, []);

  const pendingCount = emails.filter(e => e.status !== "sent").length;
  const sentCount = emails.filter(e => e.status === "sent").length;
  const failedCount = emails.filter(e => e.status === "failed").length;

  const canSend =
    pendingCount > 0 &&
    smtpConfig.senderEmail &&
    smtpConfig.appPassword &&
    smtpConfig.subject &&
    smtpConfig.emailBody &&
    !progress.isRunning;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const progressPercent = progress.total > 0
    ? Math.round(((progress.sent + progress.failed) / progress.total) * 100)
    : 0;

  const isComplete = !progress.isRunning && (progress.sent + progress.failed) === progress.total && progress.total > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center">
              <Mail className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Email Automation</h1>
              <p className="text-xs text-muted-foreground">Bulk email sender with resume attachment</p>
            </div>
          </div>
          <Button
            data-testid="button-send-all"
            onClick={startSending}
            disabled={!canSend}
            size="lg"
          >
            {progress.isRunning ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send />
            )}
            Send All Emails
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1 no-default-hover-elevate">{pendingCount}</Badge>
            )}
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {(progress.isRunning || progress.total > 0) && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Send className="text-muted-foreground" />
                  <CardTitle className="text-lg">Sending Progress</CardTitle>
                </div>
                {progress.isRunning && (
                  <Button variant="destructive" size="sm" onClick={stopSending} data-testid="button-stop-sending">
                    <StopCircle /> Stop
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progressPercent} className="h-3" data-testid="progress-bar" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-3 bg-muted/50 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-count">{progress.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-md">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-sent-count">{progress.sent}</p>
                  <p className="text-xs text-muted-foreground">Sent</p>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-md">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-failed-count">{progress.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-remaining-count">{progress.remaining}</p>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                </div>
              </div>
              {progress.isRunning && progress.currentEmail && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span className="truncate" data-testid="text-current-email">Sending to {progress.currentEmail}...</span>
                </div>
              )}
              {isComplete && (
                <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span data-testid="text-complete-message">All emails processed! {progress.sent} sent, {progress.failed} failed.</span>
                </div>
              )}
              {progress.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> Errors ({progress.errors.length})
                  </p>
                  <div className="max-h-[150px] overflow-y-auto border rounded-md">
                    {progress.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs border-b last:border-b-0" data-testid={`row-error-${i}`}>
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="font-mono">{err.email}</span>
                          <span className="text-muted-foreground ml-1">— {err.error}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Users className="text-muted-foreground" />
                    <CardTitle className="text-lg">Email Recipients</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" data-testid="badge-total-count">
                      <Mail className="mr-1 h-3 w-3" /> {emails.length} total
                    </Badge>
                    {sentCount > 0 && (
                      <Badge variant="secondary" data-testid="badge-sent-count">
                        <CheckCircle2 className="mr-1 h-3 w-3 text-green-600 dark:text-green-400" /> {sentCount} sent
                      </Badge>
                    )}
                    {failedCount > 0 && (
                      <Badge variant="destructive" data-testid="badge-failed-count">
                        <XCircle className="mr-1 h-3 w-3" /> {failedCount} failed
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription>Paste emails separated by commas, semicolons, or new lines</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Textarea
                    data-testid="input-bulk-emails"
                    placeholder={"john@example.com\njane.doe@company.com\nhr@startup.io"}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="min-h-[100px] font-mono text-sm"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button data-testid="button-add-emails" onClick={addEmails} disabled={!bulkText.trim() || addingEmails}>
                      {addingEmails ? <Loader2 className="animate-spin" /> : <Mail />}
                      Add Emails
                    </Button>
                    {emails.length > 0 && (
                      <Button data-testid="button-clear-emails" variant="outline" onClick={clearEmails}>
                        <Trash2 /> Clear All
                      </Button>
                    )}
                  </div>
                </div>

                {emails.length > 0 && (
                  <div className="border rounded-md overflow-hidden">
                    <div className="max-h-[280px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                            <th className="text-center px-3 py-2 font-medium text-muted-foreground">Status</th>
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {emails.map((entry, i) => (
                            <tr key={entry.email} className="border-t" data-testid={`row-email-${i}`}>
                              <td className="px-3 py-2 font-mono text-xs truncate max-w-[200px]">{entry.email}</td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">{entry.name || "—"}</td>
                              <td className="px-3 py-2 text-center">
                                {entry.status === "pending" && (
                                  <Badge variant="outline" className="text-xs"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>
                                )}
                                {entry.status === "sent" && (
                                  <Badge variant="secondary" className="text-xs"><CheckCircle2 className="mr-1 h-3 w-3 text-green-600 dark:text-green-400" /> Sent</Badge>
                                )}
                                {entry.status === "failed" && (
                                  <Badge variant="destructive" className="text-xs"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge>
                                )}
                              </td>
                              <td className="px-1 py-2">
                                <Button size="icon" variant="ghost" onClick={() => removeEmail(entry.email)} data-testid={`button-remove-email-${i}`}>
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {emails.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Mail className="h-10 w-10 mb-2 opacity-40" />
                    <p className="text-sm">No emails added yet</p>
                    <p className="text-xs">Paste a list above to get started</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Paperclip className="text-muted-foreground" />
                  <CardTitle className="text-lg">Resume Attachment</CardTitle>
                </div>
                <CardDescription>Upload a PDF to attach to every email</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!resume && (
                  <label
                    htmlFor="resume-upload"
                    className="flex flex-col items-center justify-center border-2 border-dashed rounded-md py-8 cursor-pointer transition-colors"
                    data-testid="label-upload-area"
                  >
                    <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Click to upload PDF</p>
                    <p className="text-xs text-muted-foreground mt-1">Max 10MB</p>
                    <input
                      id="resume-upload"
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={handleFileUpload}
                      data-testid="input-resume-file"
                    />
                  </label>
                )}

                {resume && (
                  <div className="flex items-center justify-between gap-2 p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-8 w-8 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" data-testid="text-resume-name">{resume.name}</p>
                        <p className="text-xs text-muted-foreground">{formatSize(resume.size)}</p>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setResume(null)} data-testid="button-remove-resume">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Settings className="text-muted-foreground" />
              <CardTitle className="text-lg">SMTP Settings</CardTitle>
            </div>
            <CardDescription>Configure your Gmail credentials and email content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sender-email">Gmail Address</Label>
                <Input
                  id="sender-email"
                  data-testid="input-sender-email"
                  type="email"
                  placeholder="you@gmail.com"
                  value={smtpConfig.senderEmail}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, senderEmail: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="app-password">App Password</Label>
                <div className="relative">
                  <Input
                    id="app-password"
                    data-testid="input-app-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={smtpConfig.appPassword}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, appPassword: e.target.value })}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute right-0 top-0"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sender-name">Your Name (optional)</Label>
                <Input
                  id="sender-name"
                  data-testid="input-sender-name"
                  placeholder="John Doe"
                  value={smtpConfig.senderName}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, senderName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject Line</Label>
                <Input
                  id="subject"
                  data-testid="input-subject"
                  placeholder="Application for Software Engineer"
                  value={smtpConfig.subject}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, subject: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-body">
                Email Body <span className="text-xs text-muted-foreground ml-1">( Use {"{{name}}"} for recipient name )</span>
              </Label>
              <Textarea
                id="email-body"
                data-testid="input-email-body"
                placeholder={"Dear {{name}},\n\nI am writing to express my interest in...\n\nBest regards,\nYour Name"}
                value={smtpConfig.emailBody}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, emailBody: e.target.value })}
                className="min-h-[140px] font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {!canSend && !progress.isRunning && emails.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="font-medium">Before sending, make sure you have:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs">
                    {pendingCount === 0 && <li>At least one pending email in the list</li>}
                    {!smtpConfig.senderEmail && <li>Your Gmail address configured</li>}
                    {!smtpConfig.appPassword && <li>Your Gmail App Password entered</li>}
                    {!smtpConfig.subject && <li>A subject line for your emails</li>}
                    {!smtpConfig.emailBody && <li>The email body content</li>}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
