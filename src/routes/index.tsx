import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Camera, ChevronLeft, ChevronRight, FileCheck, Lock, Mail, ShieldCheck, Upload, UserPlus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { TraceLogo } from "@/components/caselink/TraceLogo";
import {
  applicationStatusMessage,
  AccountApplicationUploadError,
  completePendingApplicationId,
  submitAccountApplication,
  validateOfficialIdFile,
  type ApplicationRole,
  type ApplicationStatus,
} from "@/lib/caselink/account-applications.repository";
import { useCaseLink, type DatabaseRole } from "@/lib/caselink/store";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "CASELINK · Secure Investigative Access" },
    { name: "description", content: "Sign in with an assigned CASELINK role or submit an identity-reviewed account application." },
  ] }),
  component: LoginPage,
});

const ROLES: Array<{ value: ApplicationRole; label: string }> = [
  { value: "investigator", label: "Investigator" },
  { value: "senior_investigator", label: "Senior Investigator" },
  { value: "administrator", label: "Administrator" },
  { value: "authorized_user", label: "Authorized User" },
];

interface ApplicationDraft {
  requestedRole: ApplicationRole;
  fullLegalName: string;
  workEmail: string;
  contactNumber: string;
  password: string;
  confirmPassword: string;
  agencyDepartment: string;
  employeeIdNumber: string;
  rankDesignation: string;
  serviceStartDate: string;
  specialization: string;
  awards: string;
  professionalBio: string;
}

const EMPTY_DRAFT: ApplicationDraft = {
  requestedRole: "investigator", fullLegalName: "", workEmail: "", contactNumber: "",
  password: "", confirmPassword: "", agencyDepartment: "", employeeIdNumber: "",
  rankDesignation: "", serviceStartDate: "", specialization: "", awards: "", professionalBio: "",
};

function LoginPage() {
  const { authError, clearAuthError, pendingApplication, refreshPendingApplication, signIn, signOut, session } = useCaseLink();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "application">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<DatabaseRole>("investigator");
  const [error, setError] = useState<string | null>(null);
  const [cleanupWarning, setCleanupWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ApplicationDraft>(EMPTY_DRAFT);
  const [officialId, setOfficialId] = useState<File | null>(null);
  const [submittedStatus, setSubmittedStatus] = useState<ApplicationStatus | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);

  useEffect(() => { if (session) void router.navigate({ to: "/dashboard" }); }, [session, router]);
  useEffect(() => { if (authError && mode === "signin") setError(authError); }, [authError, mode]);

  const update = <K extends keyof ApplicationDraft>(key: K, value: ApplicationDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function submitSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim().includes("@") || !password) { setError("Work email and password are required."); return; }
    setBusy(true); setError(null); setCleanupWarning(null); clearAuthError();
    try {
      const result = await signIn(email.trim(), password, role);
      if (result === "approved") void router.navigate({ to: "/dashboard" });
      else setError(null);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to verify account access."); }
    finally { setBusy(false); }
  }

  function validateThrough(nextStep: number): boolean {
    let message: string | null = null;
    if (nextStep >= 1 && (!draft.fullLegalName.trim() || !draft.agencyDepartment.trim() || !draft.employeeIdNumber.trim())) message = "Complete all identity and agency fields.";
    else if (nextStep >= 2 && (!draft.workEmail.includes("@") || !draft.contactNumber.trim() || draft.password.length < 8 || draft.password !== draft.confirmPassword)) message = "Enter a valid work email and contact number, use at least 8 password characters, and confirm the password.";
    else if (nextStep >= 3 && (!draft.rankDesignation.trim() || !draft.serviceStartDate || new Date(draft.serviceStartDate) > new Date() || !draft.specialization.trim())) message = "Complete the professional profile using a valid service start date.";
    else if (nextStep >= 4 && !officialId) message = "Capture or select an official ID document.";
    if (!message && nextStep >= 4 && officialId) {
      try { validateOfficialIdFile(officialId); } catch (cause) { message = cause instanceof Error ? cause.message : "The official ID is invalid."; }
    }
    setError(message);
    return !message;
  }

  function chooseOfficialId(file: File | null) {
    if (!file) return;
    try { validateOfficialIdFile(file); setOfficialId(file); setError(null); }
    catch (cause) { setOfficialId(null); setError(cause instanceof Error ? cause.message : "The official ID is invalid."); }
  }

  async function submitApplication() {
    if (!officialId || busy || !validateThrough(4)) return;
    setBusy(true); setError(null); clearAuthError();
    try {
      const result = await submitAccountApplication({
        requestedRole: draft.requestedRole, fullLegalName: draft.fullLegalName,
        workEmail: draft.workEmail, contactNumber: draft.contactNumber, password: draft.password,
        agencyDepartment: draft.agencyDepartment, employeeIdNumber: draft.employeeIdNumber,
        rankDesignation: draft.rankDesignation, serviceStartDate: draft.serviceStartDate,
        specialization: draft.specialization,
        awards: draft.awards.split(",").map((item) => item.trim()).filter(Boolean),
        professionalBio: draft.professionalBio.trim() || null, officialId,
      });
      setSubmittedStatus(result.status);
      setStatusDetail(result.requiresEmailConfirmation
        ? "Confirm your work email, then return to complete document attachment. No CASELINK role has been granted."
        : "Your private official ID is attached and awaiting Administrator review. No CASELINK role has been granted.");
      setDraft((current) => ({ ...current, password: "", confirmPassword: "" }));
      setOfficialId(null);
      setStep(5);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The account application could not be submitted.");
      setCleanupWarning(cause instanceof AccountApplicationUploadError ? cause.cleanupWarning : null);
    }
    finally { setBusy(false); }
  }

  async function resumeIdUpload() {
    if (!officialId || busy) { setError("Capture or select the official ID document again."); return; }
    setBusy(true); setError(null); setCleanupWarning(null);
    try {
      const confirmed = await completePendingApplicationId(officialId);
      await refreshPendingApplication();
      setOfficialId(null);
      setSubmittedStatus(confirmed.status);
      setStatusDetail("The private official ID upload and application attachment were confirmed. Your application is awaiting Administrator review.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The ID upload could not be completed.");
      setCleanupWarning(cause instanceof AccountApplicationUploadError ? cause.cleanupWarning : null);
    }
    finally { setBusy(false); }
  }

  return <div className="forensic-grid min-h-screen px-4 py-10">
    <div className={`relative mx-auto w-full ${mode === "signin" ? "max-w-md" : "max-w-3xl"}`}>
      <header className="mb-6 flex flex-col items-center text-center"><TraceLogo size={70} /><h1 className="mt-3 text-3xl font-semibold tracking-[0.32em]">CASELINK</h1><p className="label-xs mt-2">Investigative Intelligence Platform · TRACE Core</p></header>
      {pendingApplication ? <section className="panel space-y-4 p-5 shadow-panel">
        <RestrictedHeader />
        <div><h2 className="text-xl font-semibold">Application status</h2><p className="mt-1 text-sm text-muted-foreground">{applicationStatusMessage(pendingApplication.status)}</p></div>
        <p className="rounded border border-amber/40 bg-amber/10 p-3 text-xs text-amber">This authenticated session is restricted to application completion. Cases, evidence, dashboards and connections remain unavailable.</p>
        {!pendingApplication.official_id_path ? <div className="space-y-3"><h3 className="font-medium">Complete ID upload</h3><p className="text-xs text-muted-foreground">Email confirmation is complete. Select or capture the official ID again to continue.</p><div className="flex flex-wrap gap-2"><FilePicker label="Use camera" icon={<Camera className="size-4" />} accept="image/jpeg,image/png,image/webp" capture onChange={chooseOfficialId} /><FilePicker label="Choose file" icon={<Upload className="size-4" />} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseOfficialId} /></div>{officialId ? <p className="rounded border border-success/40 bg-success/10 p-3 text-sm text-success"><FileCheck className="mr-2 inline size-4" />{officialId.name}</p> : null}<button type="button" disabled={busy || !officialId} onClick={() => void resumeIdUpload()} className="w-full rounded border border-cyan/50 bg-cyan/10 p-3 text-sm text-cyan disabled:opacity-50">{busy ? "Uploading and confirming…" : "Complete ID upload"}</button></div> : <p className="rounded border border-success/40 bg-success/10 p-3 text-sm text-success">The private ID document is attached. Awaiting Administrator review.</p>}
        {submittedStatus ? <p className="text-sm text-cyan">{applicationStatusMessage(submittedStatus)}</p> : null}
        {statusDetail ? <p className="text-xs text-muted-foreground">{statusDetail}</p> : null}
        <ErrorMessage message={error} />
        {cleanupWarning ? <p role="alert" className="rounded border border-amber/40 bg-amber/10 p-2 text-xs text-amber">Cleanup warning: {cleanupWarning}</p> : null}
        <button type="button" onClick={() => void signOut()} className="w-full rounded border border-border p-2 text-sm text-muted-foreground">Sign out</button>
      </section> : mode === "signin" ? <form onSubmit={submitSignIn} className="panel space-y-4 p-5 shadow-panel">
        <RestrictedHeader />
        <Field label="Work email"><InputShell icon={<Mail className="size-4" />}><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="w-full bg-transparent text-sm outline-none" /></InputShell></Field>
        <Field label="Password"><InputShell icon={<Lock className="size-4" />}><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" className="w-full bg-transparent text-sm outline-none" /></InputShell></Field>
        <RoleSelector value={role} onChange={setRole} />
        <ErrorMessage message={error} />
        {cleanupWarning ? <p role="alert" className="rounded border border-amber/40 bg-amber/10 p-2 text-xs text-amber">Cleanup warning: {cleanupWarning}</p> : null}
        <button type="submit" disabled={busy} className="w-full rounded border border-cyan/50 bg-cyan/15 p-3 font-mono text-xs uppercase text-cyan disabled:opacity-50">{busy ? "Verifying…" : "Sign in"}</button>
        <button type="button" onClick={() => { setMode("application"); setError(null); }} className="flex w-full items-center justify-center gap-2 rounded border border-border p-3 font-mono text-xs uppercase text-muted-foreground hover:text-cyan"><UserPlus className="size-4" />Submit Application</button>
        <p className="text-center text-[11px] text-muted-foreground">The selected role must already be assigned in the database. Role selection never grants access.</p>
      </form> : <section className="panel space-y-5 p-5 shadow-panel">
        <RestrictedHeader />
        <div className="grid grid-cols-5 gap-1" aria-label="Application progress">{["Identity", "Account", "Profile", "Official ID", "Review"].map((label, index) => <div key={label} className={`rounded border p-2 text-center text-[9px] uppercase ${step === index ? "border-cyan text-cyan" : "border-border text-muted-foreground"}`}>{index + 1}<span className="hidden sm:block">{label}</span></div>)}</div>
        {step === 0 ? <div className="space-y-3"><RoleSelector value={draft.requestedRole} onChange={(value) => update("requestedRole", value)} /><FormGrid><TextField label="Full legal name" value={draft.fullLegalName} onChange={(value) => update("fullLegalName", value)} /><TextField label="Agency/department" value={draft.agencyDepartment} onChange={(value) => update("agencyDepartment", value)} /><TextField label="Employee/work ID" value={draft.employeeIdNumber} onChange={(value) => update("employeeIdNumber", value)} /></FormGrid><p className="text-xs text-amber">Requested roles are not granted during signup. An Administrator must review and approve the stored request.</p></div> : null}
        {step === 1 ? <FormGrid><TextField label="Work email" type="email" value={draft.workEmail} onChange={(value) => update("workEmail", value)} /><TextField label="Contact number" type="tel" value={draft.contactNumber} onChange={(value) => update("contactNumber", value)} /><TextField label="Password" type="password" value={draft.password} onChange={(value) => update("password", value)} /><TextField label="Confirm password" type="password" value={draft.confirmPassword} onChange={(value) => update("confirmPassword", value)} /></FormGrid> : null}
        {step === 2 ? <FormGrid><TextField label="Rank/designation" value={draft.rankDesignation} onChange={(value) => update("rankDesignation", value)} /><TextField label="Service start date" type="date" value={draft.serviceStartDate} onChange={(value) => update("serviceStartDate", value)} /><TextField label="Specialization" value={draft.specialization} onChange={(value) => update("specialization", value)} /><TextField label="Awards/recognitions (optional, comma separated)" value={draft.awards} onChange={(value) => update("awards", value)} /><label className="space-y-1 md:col-span-2"><span className="label-xs">Professional biography (optional)</span><textarea value={draft.professionalBio} onChange={(event) => update("professionalBio", event.target.value)} maxLength={4000} rows={4} className="w-full rounded border border-input bg-background p-2 text-sm" /></label></FormGrid> : null}
        {step === 3 ? <div className="space-y-3"><p className="text-sm">Capture or select a clear official work ID for private Administrator review.</p><div className="flex flex-wrap gap-2"><FilePicker label="Use camera" icon={<Camera className="size-4" />} accept="image/jpeg,image/png,image/webp" capture onChange={chooseOfficialId} /><FilePicker label="Choose file" icon={<Upload className="size-4" />} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseOfficialId} /></div>{officialId ? <p className="rounded border border-success/40 bg-success/10 p-3 text-sm text-success"><FileCheck className="mr-2 inline size-4" />{officialId.name}</p> : null}<p className="text-xs text-muted-foreground">JPEG, PNG, WebP or PDF · maximum 10 MB · stored in a private bucket.</p></div> : null}
        {step === 4 ? <div className="space-y-3"><h2 className="text-lg font-semibold">Review and submit</h2><dl className="grid gap-2 sm:grid-cols-2">{[["Requested role", draft.requestedRole.replaceAll("_", " ")], ["Full legal name", draft.fullLegalName], ["Work email", draft.workEmail], ["Agency", draft.agencyDepartment], ["Employee/work ID", draft.employeeIdNumber], ["Rank", draft.rankDesignation], ["Specialization", draft.specialization], ["Official ID", officialId?.name ?? "Not selected"]].map(([label, value]) => <div key={label} className="rounded border border-border p-2"><dt className="label-xs">{label}</dt><dd className="mt-1 text-sm capitalize">{value}</dd></div>)}</dl><p className="rounded border border-amber/40 bg-amber/10 p-3 text-xs text-amber">Submission creates a pending application only. It does not grant CASELINK access.</p></div> : null}
        {step === 5 ? <div className="py-8 text-center"><ShieldCheck className="mx-auto size-10 text-cyan" /><h2 className="mt-3 text-xl">Application status</h2><p className="mt-2 text-sm">{submittedStatus ? applicationStatusMessage(submittedStatus) : "Application status is unavailable."}</p><p className="mt-2 text-xs text-muted-foreground">{statusDetail}</p><button type="button" onClick={() => { setMode("signin"); setEmail(draft.workEmail); setRole(draft.requestedRole); setStep(0); setError(null); }} className="mt-5 rounded border border-cyan/50 px-3 py-2 text-sm text-cyan">Return to Sign In</button></div> : null}
        <ErrorMessage message={error} />
        {step < 5 ? <div className="flex justify-between border-t border-border pt-4"><button type="button" onClick={() => step === 0 ? setMode("signin") : setStep((current) => current - 1)} disabled={busy} className="flex items-center gap-1 rounded border border-border px-3 py-2 text-sm"><ChevronLeft className="size-4" />{step === 0 ? "Sign in" : "Back"}</button>{step < 4 ? <button type="button" onClick={() => { if (validateThrough(step + 1)) setStep((current) => current + 1); }} className="flex items-center gap-1 rounded border border-cyan/50 px-3 py-2 text-sm text-cyan">Continue<ChevronRight className="size-4" /></button> : <button type="button" disabled={busy} onClick={() => void submitApplication()} className="rounded border border-cyan/50 bg-cyan/10 px-3 py-2 text-sm text-cyan disabled:opacity-50">{busy ? "Submitting securely…" : "Submit Application"}</button>}</div> : null}
      </section>}
      <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-amber">Synthetic demo data only</p>
    </div>
  </div>;
}

function RestrictedHeader() { return <div className="flex items-center gap-2 border-b border-border pb-3"><ShieldCheck className="size-4 text-cyan" /><p className="label-xs">Restricted · authorized personnel only</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1"><span className="label-xs">{label}</span>{children}</label>; }
function InputShell({ icon, children }: { icon: ReactNode; children: ReactNode }) { return <span className="flex items-center gap-2 rounded border border-input bg-background px-3 py-2 text-muted-foreground">{icon}{children}</span>; }
function FormGrid({ children }: { children: ReactNode }) { return <div className="grid gap-3 md:grid-cols-2">{children}</div>; }
function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="space-y-1"><span className="label-xs">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} max={type === "date" ? new Date().toISOString().slice(0, 10) : undefined} autoComplete="off" className="w-full rounded border border-input bg-background p-2 text-sm" /></label>; }
function ErrorMessage({ message }: { message: string | null }) { return message ? <p role="alert" className="rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger">{message}</p> : null; }
function RoleSelector<T extends ApplicationRole>({ value, onChange }: { value: T; onChange: (role: T) => void }) { return <div className="space-y-2"><span className="label-xs">Requested or assigned role</span><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{ROLES.map((choice) => <button key={choice.value} type="button" onClick={() => onChange(choice.value as T)} className={`rounded border p-2 text-xs ${value === choice.value ? "border-cyan bg-cyan/10 text-cyan" : "border-border text-muted-foreground"}`}>{choice.label}</button>)}</div></div>; }
function FilePicker({ label, icon, accept, capture, onChange }: { label: string; icon: ReactNode; accept: string; capture?: boolean; onChange: (file: File | null) => void }) { return <label className="flex cursor-pointer items-center gap-2 rounded border border-cyan/50 px-3 py-2 text-sm text-cyan">{icon}{label}<input type="file" accept={accept} capture={capture ? "environment" : undefined} className="hidden" onChange={(event) => onChange(event.target.files?.[0] ?? null)} /></label>; }
