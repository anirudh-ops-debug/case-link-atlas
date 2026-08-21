import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Lock, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { TraceLogo } from "@/components/caselink/TraceLogo";
import {
  DATABASE_ROLE_TO_ROLE,
  ROLE_NOTES,
  useCaseLink,
  type DatabaseRole,
} from "@/lib/caselink/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CASELINK · Secure Investigative Access" },
      {
        name: "description",
        content:
          "Secure access to CASELINK, an investigative intelligence prototype that correlates fragmented evidence into timelines, maps and explainable AI insights. Synthetic demo data only.",
      },
      { property: "og:title", content: "CASELINK · Secure Investigative Access" },
      {
        property: "og:description",
        content:
          "Investigative intelligence command centre prototype — evidence correlation, cross-case link discovery and human verification.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { authError, clearAuthError, signIn, signUp, session } = useCaseLink();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<DatabaseRole>("investigator");

  useEffect(() => {
    if (session) void router.navigate({ to: "/dashboard" });
  }, [session, router]);

  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  const validate = () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address.");
      return false;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return false;
    }
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setError(null);
    setNotice(null);
    clearAuthError();
    setBusy(true);
    try {
      await signIn(email.trim(), password, role);
      void router.navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (!validate()) return;
    setError(null);
    setNotice(null);
    clearAuthError();
    setBusy(true);
    try {
      const result = await signUp(email.trim(), password, role);
      if (result.requiresEmailConfirmation) {
        setNotice("Account created. Check your email to confirm the account, then sign in as Investigator.");
      } else {
        void router.navigate({ to: "/dashboard" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account.");
    } finally {
      setBusy(false);
    }
  };

  const roleChoices: Array<{ value: DatabaseRole; label: string }> = [
    { value: "investigator", label: "Investigator" },
    { value: "senior_investigator", label: "Senior Investigator" },
    { value: "administrator", label: "Administrator" },
  ];

  return (
    <div className="forensic-grid flex min-h-screen items-center justify-center px-4 py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-20%,oklch(0.8_0.128_205.5/0.16),transparent_60%)]" />
      <div className="relative w-full max-w-md animate-rise">
        <div className="mb-6 flex flex-col items-center text-center">
          <TraceLogo size={78} />
          <h1 className="mt-4 text-3xl font-semibold tracking-[0.32em]">CASELINK</h1>
          <p className="label-xs mt-2">Investigative Intelligence Platform · TRACE Core</p>
        </div>

        <form onSubmit={submit} className="panel space-y-4 p-5 shadow-panel">
          <div className="flex items-center gap-2 border-b border-border/70 pb-3">
            <ShieldCheck className="size-4 text-cyan" />
            <p className="label-xs">Restricted · authorized personnel only</p>
          </div>

          <label className="block space-y-1.5">
            <span className="label-xs">Email</span>
            <span className="flex items-center gap-2 rounded-md border border-input bg-background/70 px-3 py-2 focus-within:border-cyan/60 focus-within:glow-cyan">
              <Mail className="size-4 text-muted-foreground" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="officer@example.gov"
                autoComplete="email"
                className="w-full bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="label-xs">Password</span>
            <span className="flex items-center gap-2 rounded-md border border-input bg-background/70 px-3 py-2 focus-within:border-cyan/60 focus-within:glow-cyan">
              <Lock className="size-4 text-muted-foreground" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </span>
          </label>

          <div className="space-y-1.5">
            <span className="label-xs">Authorization role</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {roleChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setRole(choice.value)}
                  className={
                    "rounded-sm border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors " +
                    (role === choice.value
                      ? "border-cyan/60 bg-cyan/15 text-cyan"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {ROLE_NOTES[DATABASE_ROLE_TO_ROLE[role]]}
            </p>
          </div>

          {error ? (
            <p className="rounded-sm border border-danger/40 bg-danger/10 px-2.5 py-1.5 font-mono text-[11px] text-danger">
              {error}
            </p>
          ) : null}

          {notice ? (
            <p className="rounded-sm border border-cyan/40 bg-cyan/10 px-2.5 py-1.5 font-mono text-[11px] text-cyan">
              {notice}
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="submit"
              disabled={busy}
              className="group relative overflow-hidden rounded-md border border-cyan/50 bg-cyan/15 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-70"
            >
              {busy ? "Authenticating…" : "Sign in"}
              {busy ? (
                <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-cyan/25 to-transparent animate-sweep" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => void createAccount()}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-cyan/50 hover:text-cyan disabled:opacity-70"
            >
              <UserPlus className="size-3.5" /> Create account
            </button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            New accounts receive Investigator access only. Elevated roles require administrator assignment.
          </p>
        </form>

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-amber">
          Synthetic demo data only
        </p>
      </div>
    </div>
  );
}
