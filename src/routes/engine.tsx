import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Cpu,
  HelpCircle,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/caselink/Shell";
import { FACTOR_WEIGHTS } from "@/lib/caselink/engine";
import {
  findHiddenConnections,
  getConnections,
  getCorpus,
  runAnalysis,
  setConnectionVerdict,
} from "@/lib/caselink/engine.functions";

export const Route = createFileRoute("/engine")({
  validateSearch: (search: Record<string, unknown>) => ({
    case: typeof search["case"] === "string" ? (search["case"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Intelligent Matching · CASELINK Correlation Engine" },
      {
        name: "description",
        content:
          "Weighted seven-factor correlation engine with deterministic candidate filtering, per-case hidden connection discovery, freshness tracking and explicit data gaps.",
      },
      { property: "og:title", content: "Intelligent Matching · CASELINK" },
      {
        property: "og:description",
        content:
          "Explainable cross-case correlation scoring with candidate filtering, factor breakdown and investigator verification.",
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
  sources: string[];
}

interface RunSummary {
  cases: number;
  pairsEvaluated: number;
  candidatePairs: number;
  skippedPairs: number;
  belowThreshold: number;
  stored: number;
  high: number;
  moderate: number;
  weak: number;
  low: number;
  computedAt: string;
  focusCaseNo: string | null;
}

const VERDICTS = [
  { key: "confirmed" as const, label: "Confirm link", icon: CheckCircle2, cls: "border-success/50 text-success hover:bg-success/10" },
  { key: "rejected" as const, label: "Reject", icon: CircleSlash, cls: "border-danger/50 text-danger hover:bg-danger/10" },
  { key: "inconclusive" as const, label: "Needs more evidence", icon: HelpCircle, cls: "border-amber/50 text-amber hover:bg-amber/10" },
];

/** Human wording for an insufficient-data factor record. */
const GAP_TEXT: Record<string, string> = {
  Vehicle: "Vehicle information missing on one file",
  "Witness / persons": "Witness descriptors unavailable",
  Weapon: "Weapon / evidence details insufficient",
  Location: "Coordinates unavailable",
  Time: "Incident time not recorded",
  "Modus operandi": "Modus-operandi narrative too thin to compare",
  "Other identifiers": "No phone numbers or classification tags on file",
};

function EnginePage() {
  const search = Route.useSearch();
  const fetchConnections = useServerFn(getConnections);
  const fetchCorpus = useServerFn(getCorpus);
  const analyse = useServerFn(runAnalysis);
  const findOne = useServerFn(findHiddenConnections);
  const verdictFn = useServerFn(setConnectionVerdict);
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [focusId, setFocusId] = useState<string>(search.case ?? "");
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [leadIds, setLeadIds] = useState<string[] | null>(null);
  const autoRan = useRef(false);

  const connections = useQuery({
    queryKey: ["connections"],
    queryFn: () => fetchConnections(),
  });

  const corpus = useQuery({
    queryKey: ["corpus-index"],
    queryFn: () => fetchCorpus(),
  });

  const applySummary = (r: RunSummary & { leads?: { caseAId: string; caseBId: string }[] }) => {
    setSummary(r);
    setLeadIds((r.leads ?? []).map((l) => [l.caseAId, l.caseBId].sort().join("::")));
    toast.success(
      r.focusCaseNo ? `Hidden-connection search complete · ${r.focusCaseNo}` : `Analysis complete`,
      {
        description: `${r.candidatePairs} candidate pairs · ${r.skippedPairs} skipped · ${r.stored} stored`,
      },
    );
    void qc.invalidateQueries({ queryKey: ["connections"] });
  };

  const run = useMutation({
    mutationFn: () => analyse(),
    onSuccess: applySummary,
    onError: (e: Error) => toast.error("Analysis failed", { description: e.message }),
  });

  const runOne = useMutation({
    mutationFn: (caseId: string) => findOne({ data: { caseId } }),
    onSuccess: applySummary,
    onError: (e: Error) => toast.error("Hidden-connection search failed", { description: e.message }),
  });

  useEffect(() => {
    if (!search.case || autoRan.current) return;
    autoRan.current = true;
    setFocusId(search.case);
    runOne.mutate(search.case);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.case]);

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

  const allRows = connections.data ?? [];
  const rows = leadIds
    ? allRows.filter((c) => leadIds.includes([c.case_a_id, c.case_b_id].sort().join("::")))
    : allRows;
  const files = (corpus.data ?? []) as { id: string; case_no: string; title: string }[];
  const busy = run.isPending || runOne.isPending;

  return (
    <Shell
      title="Intelligent Matching"
      subtitle="Candidate filtering → weighted seven-factor scoring · database corpus"
      actions={
        <button
          onClick={() => run.mutate()}
          disabled={busy}
          className="flex items-center gap-2 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-60"
        >
          {run.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Cpu className="size-3.5" />}
          {run.isPending ? "Correlating…" : "Run analysis"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="panel p-4">
          <p className="label-xs mb-3">Scoring model — fixed weights, evaluated per candidate pair</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {Object.entries(FACTOR_WEIGHTS).map(([f, w]) => (
              <div key={f} className="rounded-sm border border-border/70 bg-surface-2/50 px-2.5 py-2">
                <p className="font-mono text-[15px] text-cyan">{Math.round(w * 100)}%</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{f}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            Pairs are first gated by deterministic candidate filtering (crime type, MO overlap, geography, time
            pattern, registration data, shared identifiers). Factors without recorded data are excluded from the
            denominator and reported as gaps. Every correlation is a lead for human verification, never a conclusion.
          </p>
        </div>

        {/* single-case discovery */}
        <div className="panel flex flex-wrap items-center gap-2 p-4">
          <p className="label-xs w-full">Find hidden connections for one investigation</p>
          <select
            value={focusId}
            onChange={(e) => setFocusId(e.target.value)}
            className="min-w-[260px] flex-1 rounded-sm border border-input bg-background/70 px-2.5 py-2 text-[12px] outline-none focus:border-cyan/60"
          >
            <option value="">Select a database case…</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.case_no} — {f.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!focusId || busy}
            onClick={() => runOne.mutate(focusId)}
            className="flex items-center gap-2 rounded-md border border-cyan/50 bg-cyan/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/20 disabled:opacity-50"
          >
            {runOne.isPending ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
            Find hidden connections
          </button>
          {leadIds ? (
            <button
              type="button"
              onClick={() => {
                setLeadIds(null);
                setSummary(null);
              }}
              className="rounded-md border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:border-cyan/40 hover:text-cyan"
            >
              Show all correlations
            </button>
          ) : null}
        </div>

        {summary ? (
          <div className="panel p-4">
            <p className="label-xs mb-3">
              Analysis summary{summary.focusCaseNo ? ` · focused on ${summary.focusCaseNo}` : " · corpus-wide"}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {[
                ["Cases considered", summary.cases],
                ["Pairs examined", summary.pairsEvaluated],
                ["Candidate pairs", summary.candidatePairs],
                ["Skipped as irrelevant", summary.skippedPairs],
                ["Connections stored", summary.stored],
                ["High", summary.high],
                ["Moderate", summary.moderate],
                ["Weak", summary.weak],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-sm border border-border/70 bg-surface-2/50 px-2.5 py-2">
                  <p className="font-mono text-[15px] text-cyan">{value as number}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{label as string}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              {summary.low} low-relevance · {summary.belowThreshold} candidate pairs scored below the storage
              threshold and were not stored · calculated {new Date(summary.computedAt).toLocaleString()}
            </p>
          </div>
        ) : null}

        {connections.isLoading ? (
          <p className="panel p-4 font-mono text-xs text-muted-foreground">Loading correlation layer…</p>
        ) : connections.isError ? (
          <div className="panel flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="size-6 text-danger" />
            <p className="text-sm font-medium text-danger">Could not load correlations</p>
            <p className="max-w-lg font-mono text-[11px] text-muted-foreground">
              {connections.error instanceof Error ? connections.error.message : "Unknown request error"}
            </p>
            <button
              type="button"
              onClick={() => void connections.refetch()}
              className="rounded-md border border-cyan/50 bg-cyan/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/20"
            >
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="panel flex flex-col items-center gap-3 p-10 text-center">
            <Activity className="size-6 text-cyan" />
            <p className="text-sm">No correlations to show.</p>
            <p className="max-w-md text-[12px] text-muted-foreground">
              Run the analysis to gate every case pair through candidate filtering and score the survivors across the
              seven weighted factors.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((c) => {
              const isOpen = open === c.id;
              const strong = c.score >= 85;
              const factors = c.factors as ConnectionFactor[];
              const gaps = factors.filter((f) => f.insufficient_data);
              const sources = [
                ...new Set(
                  factors.filter((f) => !f.insufficient_data).flatMap((f) => f.sources ?? []),
                ),
              ].filter(Boolean);
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
                        {c.stale ? (
                          <span className="flex items-center gap-1 rounded-sm border border-amber/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amber">
                            <RefreshCw className="size-2.5" /> needs recalculation
                          </span>
                        ) : null}
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

                      {c.stale ? (
                        <p className="flex items-start gap-1.5 rounded-sm border border-amber/40 bg-amber/5 p-2.5 text-[11.5px] leading-snug text-amber">
                          <RefreshCw className="mt-0.5 size-3 shrink-0" />
                          One of these files was edited after {new Date(c.computed_at).toLocaleString()}. This score is
                          out of date — run the analysis or a hidden-connection search to recalculate. The recorded
                          verdict is preserved.
                        </p>
                      ) : null}

                      {sources.length ? (
                        <div className="rounded-sm border border-border/70 bg-surface-2/40 p-3">
                          <p className="label-xs mb-2">Supporting sources</p>
                          <div className="flex flex-wrap gap-1.5">
                            {sources.map((s) => {
                              const ref = s.startsWith("case:") ? s.slice(5) : null;
                              const target =
                                ref === c.caseA?.case_no
                                  ? c.case_a_id
                                  : ref === c.caseB?.case_no
                                    ? c.case_b_id
                                    : null;
                              return target ? (
                                <Link
                                  key={s}
                                  to="/investigations/$caseId"
                                  params={{ caseId: target as string }}
                                  className="rounded-sm border border-cyan/40 bg-cyan/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan hover:bg-cyan/20"
                                >
                                  {ref}
                                </Link>
                              ) : (
                                <span
                                  key={s}
                                  className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                >
                                  {ref ?? s}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {gaps.length ? (
                        <div className="rounded-sm border border-amber/40 bg-amber/5 p-3">
                          <p className="label-xs mb-2 text-amber">Data gaps — factors that could not be evaluated</p>
                          <ul className="space-y-1">
                            {gaps.map((f) => (
                              <li key={f.id} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-amber">
                                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                                {GAP_TEXT[f.factor] ?? `${f.factor} data unavailable`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="space-y-1.5">
                        {factors.map((f) => (
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
                              onClick={() => verdict.mutate({ connectionId: c.id, verdict: v.key, reason })}
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
