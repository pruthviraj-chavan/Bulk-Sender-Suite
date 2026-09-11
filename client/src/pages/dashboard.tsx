import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Mail,
  Upload,
  Send,
  Trash2,
  FileText,
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
  Zap,
  ShieldCheck,
  Globe,
  ArrowRight,
  UserCircle,
  AtSign,
  Lock,
  MessageSquare,
  BarChart3,
  Target,
  X,
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

type ApiResponse = Record<string, unknown>;

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ApiResponse;
    }
    return { message: String(parsed) };
  } catch {
    // Vercel can return a plain-text platform error when a function fails
    // before it reaches our handler. Keep that message usable in the UI.
    const message = text.replace(/\s+/g, " ").trim();
    return {
      message: message || `Request failed with status ${response.status}`,
    };
  }
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

function StatCard({ icon: Icon, label, value, color, delay }: {
  icon: typeof Mail;
  label: string;
  value: number;
  color: string;
  delay: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: "from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-700",
    emerald: "from-emerald-500 to-emerald-600 dark:from-emerald-600 dark:to-emerald-700",
    rose: "from-rose-500 to-rose-600 dark:from-rose-600 dark:to-rose-700",
    amber: "from-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-700",
  };
  return (
    <div className={`animate-fade-in-up ${delay}`}>
      <div className={`rounded-md p-4 text-white bg-gradient-to-br ${colorMap[color]}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs font-medium opacity-80 mt-0.5">{label}</p>
          </div>
          <div className="rounded-md p-2 bg-white/15">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();

  const [emails, setEmails] = useState<EmailEntry[]>(() => loadEmails());
  const [bulkText, setBulkText] = useState("");
  const [resume, setResume] = useState<ResumeFile | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({
    senderEmail: "pruthviraj9404@gmail.com",
    appPassword: "",
    senderName: "Pruthviraj Chavan",
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
  const [dragOver, setDragOver] = useState(false);
  const [hasSavedAppPassword, setHasSavedAppPassword] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    saveEmails(emails);
  }, [emails]);

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then(async (response) => response.ok ? readApiResponse(response) : null)
      .then((settings) => {
        if (!settings) return;
        setHasSavedAppPassword(settings.hasAppPassword === true);
        setSmtpConfig((current) => ({
          ...current,
          senderEmail: typeof settings.senderEmail === "string" ? settings.senderEmail : current.senderEmail,
          senderName: typeof settings.senderName === "string" ? settings.senderName : current.senderName,
        }));
      })
      .catch(() => undefined);
  }, []);

  const saveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          senderEmail: smtpConfig.senderEmail,
          senderName: smtpConfig.senderName,
          appPassword: smtpConfig.appPassword,
        }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : `Could not save settings (HTTP ${response.status})`,
        );
      }
      setHasSavedAppPassword(true);
      setSmtpConfig((current) => ({ ...current, appPassword: "" }));
      toast({ title: "Settings saved", description: "Your Gmail app password is encrypted and stored securely." });
    } catch (error) {
      toast({
        title: "Could not save settings",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingSettings(false);
    }
  }, [smtpConfig.appPassword, smtpConfig.senderEmail, smtpConfig.senderName, toast]);

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

  const processFile = useCallback((file: File) => {
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
  }, [toast]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    e.target.value = "";
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

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
            senderName: smtpConfig.senderName,
            subject: smtpConfig.subject,
            emailBody: smtpConfig.emailBody,
            recipientEmail: entry.email,
            recipientName: entry.name,
            resumeBase64: resume?.base64 || null,
            resumeFilename: resume?.name || null,
          }),
        });

        const data = await readApiResponse(res);

        if (res.ok && data.success === true) {
          sent++;
          setEmails(prev => prev.map(e => e.email === entry.email ? { ...e, status: "sent" as const } : e));
          setProgress(p => ({ ...p, sent, remaining: total - i - 1 }));
        } else {
          failed++;
          const errMsg =
            (typeof data.error === "string" && data.error) ||
            (typeof data.message === "string" && data.message) ||
            `Email send failed (HTTP ${res.status})`;
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
    hasSavedAppPassword &&
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
      <header className="relative border-b sticky top-0 z-50 bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 dark:from-indigo-700 dark:via-purple-700 dark:to-fuchsia-700">
        <div className="absolute inset-0 animate-gradient opacity-20 bg-gradient-to-r from-white/10 via-transparent to-white/10" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 animate-slide-in-right">
              <div className="h-10 w-10 rounded-md flex items-center justify-center bg-white/20 dark:bg-white/15 backdrop-blur-sm">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight" data-testid="text-header-title">Email Automation</h1>
                <p className="text-xs text-white/70 hidden sm:block">Bulk email sender with smart delivery</p>
              </div>
            </div>
            <div className="flex items-center gap-3 animate-fade-in">
              {progress.isRunning && (
                <Button variant="outline" onClick={stopSending} data-testid="button-stop-sending" className="border-white/30 text-white bg-white/10">
                  <StopCircle /> Stop
                </Button>
              )}
              <Button
                data-testid="button-send-all"
                onClick={startSending}
                disabled={!canSend}
                size="lg"
                className="bg-white text-indigo-700 dark:bg-white dark:text-indigo-700 font-semibold"
              >
                {progress.isRunning ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send />
                )}
                <span className="hidden sm:inline">Send All Emails</span>
                <span className="sm:hidden">Send</span>
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-1 no-default-hover-elevate bg-indigo-100 text-indigo-700 dark:bg-indigo-100 dark:text-indigo-700">{pendingCount}</Badge>
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-white/70 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Gmail SMTP</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/70 text-xs">
              <Globe className="h-3.5 w-3.5" />
              <span>TLS Encrypted</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/70 text-xs">
              <Zap className="h-3.5 w-3.5" />
              <span>Rate Limited</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {(progress.isRunning || progress.total > 0) && (
          <div className="animate-fade-in-up">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md p-1.5 bg-indigo-100 dark:bg-indigo-900/40">
                      <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <CardTitle className="text-base">Sending Progress</CardTitle>
                    {progress.isRunning && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                        </span>
                        <span className="text-xs text-muted-foreground">Live</span>
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">{progressPercent}%</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Progress value={progressPercent} className="h-2.5" data-testid="progress-bar" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard icon={Target} label="Total" value={progress.total} color="indigo" delay="stagger-1" />
                  <StatCard icon={CheckCircle2} label="Sent" value={progress.sent} color="emerald" delay="stagger-2" />
                  <StatCard icon={XCircle} label="Failed" value={progress.failed} color="rose" delay="stagger-3" />
                  <StatCard icon={Clock} label="Remaining" value={progress.remaining} color="amber" delay="stagger-4" />
                </div>

                {progress.isRunning && progress.currentEmail && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2.5 animate-fade-in">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0 text-indigo-500" />
                    <span className="truncate" data-testid="text-current-email">Sending to <span className="font-mono font-medium text-foreground">{progress.currentEmail}</span></span>
                  </div>
                )}
                {isComplete && (
                  <div className="flex items-center gap-2 text-sm font-medium rounded-md px-3 py-2.5 animate-fade-in bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span data-testid="text-complete-message">All emails processed! {progress.sent} sent, {progress.failed} failed.</span>
                  </div>
                )}
                {progress.errors.length > 0 && (
                  <div className="space-y-2 animate-fade-in">
                    <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" /> Errors ({progress.errors.length})
                    </p>
                    <div className="max-h-[150px] overflow-y-auto border rounded-md">
                      {progress.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs border-b last:border-b-0" data-testid={`row-error-${i}`}>
                          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-mono font-medium">{err.email}</span>
                            <span className="text-muted-foreground ml-1">-- {err.error}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="animate-fade-in-up stagger-1">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md p-1.5 bg-indigo-100 dark:bg-indigo-900/40">
                        <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <CardTitle className="text-base">Email Recipients</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" data-testid="badge-total-count">
                        <Mail className="mr-1 h-3 w-3" /> {emails.length} total
                      </Badge>
                      {sentCount > 0 && (
                        <Badge variant="secondary" data-testid="badge-sent-count" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> {sentCount} sent
                        </Badge>
                      )}
                      {failedCount > 0 && (
                        <Badge variant="destructive" data-testid="badge-failed-count">
                          <XCircle className="mr-1 h-3 w-3" /> {failedCount} failed
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
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
                    <div className="border rounded-md">
                      <div className="max-h-[320px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                            <tr>
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Email</th>
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Name</th>
                              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                              <th className="w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {emails.map((entry, i) => (
                              <tr key={entry.email} className="border-t transition-colors" data-testid={`row-email-${i}`}>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{(entry.name || entry.email)[0].toUpperCase()}</span>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-mono text-xs truncate">{entry.email}</p>
                                      <p className="text-xs text-muted-foreground sm:hidden">{entry.name || "--"}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">{entry.name || "--"}</td>
                                <td className="px-3 py-2.5 text-center">
                                  {entry.status === "pending" && (
                                    <Badge variant="outline" className="text-xs"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>
                                  )}
                                  {entry.status === "sent" && (
                                    <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"><CheckCircle2 className="mr-1 h-3 w-3" /> Sent</Badge>
                                  )}
                                  {entry.status === "failed" && (
                                    <Badge variant="destructive" className="text-xs"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge>
                                  )}
                                </td>
                                <td className="px-1 py-2.5">
                                  <Button size="icon" variant="ghost" onClick={() => removeEmail(entry.email)} data-testid={`button-remove-email-${i}`}>
                                    <X className="h-3.5 w-3.5 text-muted-foreground" />
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
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                      <div className="h-14 w-14 rounded-full bg-muted/80 flex items-center justify-center mb-3">
                        <Mail className="h-7 w-7 opacity-40" />
                      </div>
                      <p className="text-sm font-medium">No emails added yet</p>
                      <p className="text-xs mt-1">Paste a list of email addresses above to get started</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="animate-fade-in-up stagger-3">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md p-1.5 bg-indigo-100 dark:bg-indigo-900/40">
                      <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">SMTP Settings</CardTitle>
                      <CardDescription className="text-xs mt-0.5">Configure your Gmail credentials and email content</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="sender-email" className="flex items-center gap-1.5 text-xs">
                        <AtSign className="h-3 w-3 text-muted-foreground" /> Gmail Address
                      </Label>
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
                      <Label htmlFor="app-password" className="flex items-center gap-1.5 text-xs">
                        <Lock className="h-3 w-3 text-muted-foreground" /> App Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="app-password"
                          data-testid="input-app-password"
                          type={showPassword ? "text" : "password"}
                           placeholder={hasSavedAppPassword ? "Saved securely — enter a new one to replace it" : "xxxx xxxx xxxx xxxx"}
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
                      <p className="text-[11px] text-muted-foreground">
                        {hasSavedAppPassword ? "A saved app password is active. Leave blank to keep it." : "Save it once; it will be encrypted in the database."}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="sender-name" className="flex items-center gap-1.5 text-xs">
                        <UserCircle className="h-3 w-3 text-muted-foreground" /> Your Name (optional)
                      </Label>
                      <Input
                        id="sender-name"
                        data-testid="input-sender-name"
                        placeholder="John Doe"
                        value={smtpConfig.senderName}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, senderName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="subject" className="flex items-center gap-1.5 text-xs">
                        <Mail className="h-3 w-3 text-muted-foreground" /> Subject Line
                      </Label>
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
                    <Label htmlFor="email-body" className="flex items-center gap-1.5 text-xs">
                      <MessageSquare className="h-3 w-3 text-muted-foreground" />
                      Email Body
                      <span className="text-muted-foreground ml-1">( Use {"{{name}}"} for recipient name )</span>
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
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">Gmail settings</p>
                      <p>{hasSavedAppPassword ? "App password saved securely" : "App password not saved yet"}</p>
                    </div>
                    <Button type="button" variant="outline" onClick={saveSettings} disabled={savingSettings || !smtpConfig.senderEmail || !smtpConfig.senderName || (!hasSavedAppPassword && !smtpConfig.appPassword)}>
                      {savingSettings ? <Loader2 className="animate-spin" /> : <Lock />}
                      {hasSavedAppPassword ? "Update saved settings" : "Save settings"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-6">
            <div className="animate-fade-in-up stagger-2">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md p-1.5 bg-indigo-100 dark:bg-indigo-900/40">
                      <Paperclip className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Resume</CardTitle>
                      <CardDescription className="text-xs mt-0.5">PDF attachment for every email</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!resume && (
                    <label
                      htmlFor="resume-upload"
                      className={`flex flex-col items-center justify-center border-2 border-dashed rounded-md py-8 cursor-pointer transition-all ${
                        dragOver ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-border"
                      }`}
                      data-testid="label-upload-area"
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                    >
                      <div className="h-12 w-12 rounded-full bg-muted/80 flex items-center justify-center mb-3">
                        <Upload className={`h-5 w-5 transition-colors ${dragOver ? "text-indigo-500" : "text-muted-foreground"}`} />
                      </div>
                      <p className="text-sm font-medium">
                        {dragOver ? "Drop your PDF here" : "Click or drag to upload"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">PDF only, max 10MB</p>
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
                    <div className="flex items-center justify-between gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-md border border-indigo-200 dark:border-indigo-800/40 animate-fade-in">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-md bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" data-testid="text-resume-name">{resume.name}</p>
                          <p className="text-xs text-muted-foreground">{formatSize(resume.size)}</p>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => setResume(null)} data-testid="button-remove-resume">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {!canSend && !progress.isRunning && emails.length > 0 && (
              <div className="animate-fade-in-up stagger-3">
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md p-1.5 bg-amber-100 dark:bg-amber-900/30 shrink-0 mt-0.5">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="text-sm space-y-2">
                        <p className="font-medium text-sm">Before sending:</p>
                        <ul className="space-y-1.5 text-xs text-muted-foreground">
                          {pendingCount === 0 && (
                            <li className="flex items-center gap-1.5">
                              <ArrowRight className="h-3 w-3 shrink-0" /> At least one pending email
                            </li>
                          )}
                          {!smtpConfig.senderEmail && (
                            <li className="flex items-center gap-1.5">
                              <ArrowRight className="h-3 w-3 shrink-0" /> Gmail address
                            </li>
                          )}
                          {!hasSavedAppPassword && (
                            <li className="flex items-center gap-1.5">
                              <ArrowRight className="h-3 w-3 shrink-0" /> Gmail App Password
                            </li>
                          )}
                          {!smtpConfig.subject && (
                            <li className="flex items-center gap-1.5">
                              <ArrowRight className="h-3 w-3 shrink-0" /> Subject line
                            </li>
                          )}
                          {!smtpConfig.emailBody && (
                            <li className="flex items-center gap-1.5">
                              <ArrowRight className="h-3 w-3 shrink-0" /> Email body content
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="animate-fade-in-up stagger-4">
              <Card>
                <CardContent className="py-4">
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Tips</p>
                    <div className="space-y-2.5">
                      <div className="flex items-start gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">Use a Gmail <span className="font-medium text-foreground">App Password</span>, not your regular password</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">3-5 second delay between emails to avoid rate limits</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Globe className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">{"{{name}}"} auto-extracts the recipient's name from their email</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
