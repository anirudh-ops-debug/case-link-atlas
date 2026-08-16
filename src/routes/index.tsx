import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { TraceLogo } from "@/components/caselink/TraceLogo";
import { ROLE_NOTES, ROLE_PERMISSIONS, useCaseLink } from "@/lib/caselink/store";
import type { Role } from "@/lib/caselink/types";

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
  const { signIn, session } = useCaseLink();
  const router = useRouter();
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role>("INVESTIGATOR");

  useEffect(() => {
    if (session) void router.navigate({ to: "/dashboard" });
  }, [session, router]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id.trim().length < 3) {
      setError("Investigator ID must be at least 3 characters.");
      return;
    }
    if (code.trim().length < 4) {
      setError("Access code must be at least 4 characters.");
      return;
    }
    setError(null);
    setBusy(true);
    window.setTimeout(() => {
      signIn(id.trim(), role);
      void router.navigate({ to: "/dashboard" });
    }, 900);
  };

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
            <span className="label-xs">Investigator ID</span>
            <span className="flex items-center gap-2 rounded-md border border-input bg-background/70 px-3 py-2 focus-within:border-cyan/60 focus-within:glow-cyan">
              <Fingerprint className="size-4 text-muted-foreground" />
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="TN-CIC-0917"
                autoComplete="off"
                className="w-full bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="label-xs">Access Code</span>
            <span className="flex items-center gap-2 rounded-md border border-input bg-background/70 px-3 py-2 focus-within:border-cyan/60 focus-within:glow-cyan">
              <Lock className="size-4 text-muted-foreground" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                type="password"
                placeholder="••••••••"
                className="w-full bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </span>
          </label>

          <div className="space-y-1.5">
            <span className="label-xs">Authorization role</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(Object.keys(ROLE_PERMISSIONS) as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={
                    "rounded-sm border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors " +
                    (role === r
                      ? "border-cyan/60 bg-cyan/15 text-cyan"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{ROLE_NOTES[role]}</p>
          </div>


          {error ? (
            <p className="rounded-sm border border-danger/40 bg-danger/10 px-2.5 py-1.5 font-mono text-[11px] text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="group relative w-full overflow-hidden rounded-md border border-cyan/50 bg-cyan/15 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-70"
          >
            {busy ? "Establishing secure channel…" : "Enter Secure Environment"}
            {busy ? (
              <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-cyan/25 to-transparent animate-sweep" />
            ) : null}
          </button>

          <p className="text-center text-[11px] text-muted-foreground">
            Any ID and code combination opens the prototype. No real credentials are stored.
          </p>
        </form>

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-amber">
          Synthetic demo data only
        </p>
      </div>
    </div>
  );
}
