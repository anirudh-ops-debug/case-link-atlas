import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, CheckCircle2, CircleSlash, Cpu, HelpCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/caselink/Shell";
import { FACTOR_WEIGHTS } from "@/lib/caselink/engine";
import {
  getConnections,
  runAnalysis,
  setConnectionVerdict,
} from "@/lib/caselink/engine.functions";

export const Route = createFileRoute("/engine")({
  head: () => ({
    meta: [
      { title: "Intelligent Matching · CASELINK Correlation Engine" },
      {
        name: "description",
        content:
          "Weighted seven-factor correlation engine that scores cross-case relationships on modus operandi, location, time, vehicle, weapon, witnesses and identifiers — with explicit data gaps and human verdicts.",
      },
      { property: "og:title", content: "Intelligent Matching · CASELINK" },
      {
        property: "og:description",
        content:
          "Explainable cross-case correlation scoring with factor-by-factor breakdown and investigator verification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EnginePage,
  errorComponent: ({ error }) => (
    <Shell title="Intelligent Matching" subtitle="Correlation engine">
      <p className="panel p-4 font-mono text-xs text-danger">{(error as Error).message}</p>
    </Shell>
  ),
  notFoundComponent: () => <Shell title="Intelligent Matching">Not found</Shell>,
});

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

interface ConnectionFactor {
  id: string;
  factor: string;
  similarity: number | null;
  weight: number;
  insufficient_data: boolean;
  detail: string;
}

const VERDICTS = [
  { key: "confirmed" as const, label: "Confirm link", icon: CheckCircle2, cls: "border-success/50 text-success hover:bg-success/10" },
  { key: "rejected" as const, label: "Reject", icon: CircleSlash, cls: "border-danger/50 text-danger hover:bg-danger/10" },
  { key: "inconclusive" as const, label: "Needs more evidence", icon: HelpCircle, cls: "border-amber/50 text-amber hover:bg-amber/10" },
];

function EnginePage() {
  const fetchConnections = useServerFn(getConnections);
  const analyse = useServerFn(runAnalysis);
  const verdictFn = useServerFn(setConnectionVerdict);
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const connections = useQuery({
    queryKey: ["connections"],
    queryFn: () => fetchConnections(),
  });

  const run = useMutation({
    mutationFn: () => analyse(),
    onSuccess: (r) => {
      toast.success(`Analysis complete — ${r.stored} correlations stored`, {
        description: `${r.cases} files · ${r.pairsEvaluated} pairs evaluated · ${r.strong} strong links`,
      });
      void qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (e: Error) => toast.error("Analysis failed", { description: e.message }),
  });

  const verdict = useMutation({
    mutationFn: (v: { connectionId: string; verdict: "confirmed" | "rejected" | "inconclusive"; reason: string }) =>
      verdictFn({ data: v }),
    onSuccess: () => {
      toast.success("Verdict recorded in the audit trail");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (e: Error) =>
      toast.error("Could not record verdict", {
        description: e.message.includes("Unauthorized")
          ? "Sign in with a verifying role to record verdicts."
          : e.message,
      }),
  });

  const rows = connections.data ?? [];

  return (
    <Shell
      title="Intelligent Matching"
      subtitle="Weighted seven-factor correlation engine · database corpus"
      actions={
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="flex items-center gap-2 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-60"
        >
          {run.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Cpu className="size-3.5" />}
          {run.isPending ? "Correlating…" : "Run analysis"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="panel p-4">
          <p className="label-xs mb-3">Scoring model — fixed weights, evaluated per pair</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {Object.entries(FACTOR_WEIGHTS).map(([f, w]) => (
              <div key={f} className="rounded-sm border border-border/70 bg-surface-2/50 px-2.5 py-2">
                <p className="font-mono text-[15px] text-cyan">{Math.round(w * 100)}%</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{f}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            Factors without enough recorded data are excluded from the denominator and reported as gaps — the score is
            damped rather than inflated. Every correlation is a lead for human verification, never a conclusion.
          </p>
        </div>

        {connections.isLoading ? (
          <p className="panel p-4 font-mono text-xs text-muted-foreground">Loading correlation layer…</p>
        ) : rows.length === 0 ? (
          <div className="panel flex flex-col items-center gap-3 p-10 text-center">
            <Activity className="size-6 text-cyan" />
            <p className="text-sm">No correlations computed yet.</p>
            <p className="max-w-md text-[12px] text-muted-foreground">
              Run the analysis to score every case pair in the database across the seven weighted factors.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((c) => {
              const isOpen = open === c.id;
              const strong = c.score >= 85;
              return (
                <article key={c.id} className="panel overflow-hidden">
                  <button
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    className="flex w-full items-start gap-3 p-4 text-left"
                  >
                    <span
                      className={
                        "mt-0.5 rounded-sm border px-2 py-1 font-mono text-[13px] " +
                        (strong
                          ? "border-danger/50 bg-danger/10 text-danger"
                          : c.score >= 50
                            ? "border-amber/50 bg-amber/10 text-amber"
                            : "border-border text-muted-foreground")
                      }
                    >
                      {c.score.toFixed(1)}%
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[12px] text-cyan">{c.caseA?.case_no ?? "—"}</span>
                        <span className="text-muted-foreground">↔</span>
                        <span className="font-mono text-[12px] text-cyan">{c.caseB?.case_no ?? "—"}</span>
                        <span className="label-xs">{c.classification}</span>
                        {c.verdict !== "pending" ? (
                          <span
                            className={
                              "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] " +
                              (c.verdict === "confirmed"
                                ? "border-success/50 text-success"
                                : c.verdict === "rejected"
                                  ? "border-danger/50 text-danger"
                                  : "border-amber/50 text-amber")
                            }
                          >
                            {c.verdict}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-[13px]">
                        {c.caseA?.title ?? "Unknown file"} <span className="text-muted-foreground">·</span>{" "}
                        {c.caseB?.title ?? "Unknown file"}
                      </span>
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="space-y-4 border-t border-border/70 p-4">
                      <p className="text-[12.5px] leading-relaxed text-muted-foreground">{c.explanation}</p>

                      <div className="space-y-1.5">
                        {c.factors.map((f: ConnectionFactor) => (
                          <div key={f.id} className="rounded-sm border border-border/70 bg-surface-2/40 p-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-40 shrink-0 text-[12px]">{f.factor}</span>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
                                <span
                                  className={
                                    "block h-full rounded-full " +
                                    (f.insufficient_data ? "bg-muted-foreground/40" : "bg-cyan glow-cyan")
                                  }
                                  style={{ width: `${Math.round((f.similarity ?? 0) * 100)}%` }}
                                />
                              </span>
                              <span className="w-12 shrink-0 text-right font-mono text-[11px] text-cyan">
                                {pct(f.similarity)}
                              </span>
                              <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                                ×{Math.round(f.weight * 100)}
                              </span>
                            </div>
                            <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
                              {f.insufficient_data ? (
                                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber" />
                              ) : null}
                              {f.detail}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-sm border border-border/70 bg-surface-2/40 p-3">
                        <p className="label-xs mb-2">Human verification — required before action</p>
                        {c.verdict !== "pending" ? (
                          <p className="mb-2 font-mono text-[11px] text-muted-foreground">
                            {c.verdict.toUpperCase()} by {c.verified_by_name ?? "officer"}
                            {c.verified_at ? ` · ${new Date(c.verified_at).toLocaleString()}` : ""}
                            {c.verdict_reason ? ` — ${c.verdict_reason}` : ""}
                          </p>
                        ) : null}
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason for the verdict (recorded in the audit trail)"
                          rows={2}
                          className="w-full rounded-sm border border-input bg-background/70 px-2.5 py-2 text-[12px] outline-none focus:border-cyan/60"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {VERDICTS.map((v) => (
                            <button
                              key={v.key}
                              disabled={verdict.isPending}
                              onClick={() =>
                                verdict.mutate({ connectionId: c.id, verdict: v.key, reason })
                              }
                              className={
                                "flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors disabled:opacity-60 " +
                                v.cls
                              }
                            >
                              <v.icon className="size-3" />
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
