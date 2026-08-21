import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Boxes,
  FolderSearch,
  Network,
  Radar,
  UserSearch,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  Chip,
  CountUp,
  PriorityDot,
  SectionTitle,
  Skeletons,
  VerdictBadge,
  fmtDateTime,
  relative,
} from "@/components/caselink/bits";
import { DetailDrawer, type DrawerTarget } from "@/components/caselink/DetailDrawer";
import { Shell } from "@/components/caselink/Shell";
import { useCaseLink } from "@/lib/caselink/store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Command Center · CASELINK" },
      {
        name: "description",
        content:
          "CASELINK command centre: live investigation feed, active case load, AI correlation discoveries and intelligence alerts across synthetic case files.",
      },
      { property: "og:title", content: "Command Center · CASELINK" },
      {
        property: "og:description",
        content:
          "Monitor active investigations, evidence volume and AI-discovered cross-case links in one investigative command centre.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { ready, cases, links, verdicts, feed, allEvidence } = useCaseLink();
  const [target, setTarget] = useState<DrawerTarget | null>(null);

  const stats = useMemo(() => {
    const active = cases.filter((c) => c.status !== "Closed").length;
    const missing = cases.filter((c) => c.type === "Missing Person").length;
    const pending = links.filter((l) => (verdicts[l.id] ?? "pending") === "pending").length;
    return { active, missing, pending, evidence: allEvidence.length };
  }, [cases, links, verdicts, allEvidence]);

  const discoveries = links.slice(0, 4);

  const alerts = useMemo(() => {
    const out: { tone: "danger" | "amber" | "cyan"; text: string }[] = [];
    for (const c of cases) {
      if (c.priority === "Critical" && c.status !== "Closed") {
        out.push({
          tone: "danger",
          text: `${c.code} is CRITICAL — vulnerable subject ${c.subject.name}; corridor sweep pending review.`,
        });
      }
    }
    for (const l of links.slice(0, 3)) {
      if ((verdicts[l.id] ?? "pending") === "pending" && l.confidence >= 60) {
        out.push({
          tone: "amber",
          text: `High-confidence link (${l.confidence}%) awaiting human verification: ${l.aId} ↔ ${l.bId}.`,
        });
      }
    }
    const noEvidence = cases.filter((c) => c.evidence.length < 2);
    for (const c of noEvidence) {
      out.push({
        tone: "cyan",
        text: `${c.code} has fewer than two evidence records — direction inference is unreliable.`,
      });
    }
    return out.slice(0, 6);
  }, [cases, links, verdicts]);

  return (
    <Shell
      title="Command Center"
      subtitle="Live operational picture"
      actions={
        <Link
          to="/investigations/new"
          className="rounded-md border border-cyan/50 bg-cyan/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan transition-colors hover:bg-cyan/25"
        >
          New investigation
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={FolderSearch}
            label="Active cases"
            value={stats.active}
            hint={`${cases.length} total files in corpus`}
          />
          <Metric
            icon={UserSearch}
            label="Missing persons"
            value={stats.missing}
            hint="Vulnerable-subject protocol active"
            tone="danger"
          />
          <Metric
            icon={Network}
            label="Potential links"
            value={stats.pending}
            hint={`${links.length} candidates generated`}
            tone="amber"
          />
          <Metric
            icon={Boxes}
            label="Evidence records"
            value={stats.evidence}
            hint="Indexed and correlated"
            tone="success"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
          <section className="panel overflow-hidden">
            <SectionTitle right={<Chip tone="cyan">{cases.length} files</Chip>}>
              Active case load
            </SectionTitle>
            {!ready ? (
              <Skeletons rows={4} />
            ) : (
              <div className="grid gap-2 p-3 md:grid-cols-2">
                {cases.map((c) => {
                  const caseLinks = links.filter((l) => l.aId === c.id || l.bId === c.id);
                  return (
                    <Link
                      key={c.id}
                      to="/investigations/$caseId"
                      params={{ caseId: c.id }}
                      className="group rounded-md border border-border/70 bg-surface-2/40 p-3 transition-all duration-200 hover:border-cyan/40 hover:bg-cyan/[0.06]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-cyan">{c.code}</span>
                        <PriorityDot priority={c.priority} />
                      </div>
                      <p className="mt-1.5 truncate text-[13px] font-medium text-foreground">
                        {c.title}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {c.type} · {c.lastKnownLocation}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Chip>{c.evidence.length} evidence</Chip>
                        <Chip tone={caseLinks.length ? "amber" : "default"}>
                          {caseLinks.length} links
                        </Chip>
                        <Chip>{c.status}</Chip>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel flex flex-col overflow-hidden">
            <SectionTitle right={<Chip tone="success">streaming</Chip>}>
              <span className="flex items-center gap-1.5">
                <Activity className="size-3.5 text-success" /> Live investigation feed
              </span>
            </SectionTitle>
            <div className="max-h-[380px] flex-1 space-y-2 overflow-y-auto p-3">
              {feed.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  No session activity yet. Register a case, add evidence or verify a link and every
                  action will stream here with a timestamp.
                </p>
              ) : (
                feed.map((f) => (
                  <div
                    key={f.id}
                    className="animate-rise rounded-md border border-border/60 bg-surface-2/40 p-2"
                  >
                    <p className="flex items-center justify-between gap-2 label-xs">
                      <span>{f.kind}</span>
                      <span>{relative(f.at)}</span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-foreground">{f.text}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <section className="panel overflow-hidden">
            <SectionTitle right={<Chip tone="amber">needs verification</Chip>}>
              <span className="flex items-center gap-1.5">
                <Radar className="size-3.5 text-amber" /> Recent AI discoveries
              </span>
            </SectionTitle>
            <div className="space-y-2 p-3">
              {discoveries.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No correlations above the reporting threshold in the current corpus.
                </p>
              ) : (
                discoveries.map((l) => (
                  <Link
                    key={l.id}
                    to="/links"
                    search={{ case: l.aId, link: l.id }}
                    className="block rounded-md border border-border/70 bg-surface-2/40 p-2.5 transition-colors hover:border-amber/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] text-foreground">
                        {l.aId} ↔ {l.bId}
                      </p>
                      <span className="font-mono text-[12px] text-amber">{l.confidence}%</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {l.reasons[0]?.detail}
                    </p>
                    <div className="mt-1.5">
                      <VerdictBadge verdict={verdicts[l.id] ?? "pending"} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="panel overflow-hidden">
            <SectionTitle right={<Chip tone="danger">{alerts.length}</Chip>}>
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-danger" /> Intelligence alerts
              </span>
            </SectionTitle>
            <div className="space-y-2 p-3">
              {alerts.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No open alerts.</p>
              ) : (
                alerts.map((a, i) => (
                  <div
                    key={i}
                    className="rounded-md border p-2.5 text-[12px] leading-snug"
                    style={{
                      borderColor:
                        a.tone === "danger"
                          ? "oklch(0.64 0.21 25.5 / 0.4)"
                          : a.tone === "amber"
                            ? "oklch(0.77 0.16 70 / 0.4)"
                            : "oklch(0.8 0.128 205.5 / 0.35)",
                    }}
                  >
                    {a.text}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="panel overflow-hidden">
          <SectionTitle right={<Chip>{allEvidence.length} records</Chip>}>
            Latest evidence intake
          </SectionTitle>
          <div className="divide-y divide-border/60">
            {[...allEvidence]
              .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
              .slice(0, 6)
              .map((e) => (
                <button
                  key={e.id}
                  onClick={() => setTarget({ kind: "evidence", id: e.id })}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-cyan/[0.05]"
                >
                  <span className="font-mono text-[10px] text-muted-foreground">{e.caseId}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                    {e.label}
                  </span>
                  <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                    {fmtDateTime(e.timestamp)}
                  </span>
                  <Chip tone="cyan">{e.type}</Chip>
                </button>
              ))}
          </div>
        </section>
      </div>

      <DetailDrawer
        target={target}
        onClose={() => setTarget(null)}
        onSelectEvidence={(id) => setTarget({ kind: "evidence", id })}
      />
    </Shell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone = "cyan",
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  hint: string;
  tone?: "cyan" | "amber" | "danger" | "success";
}) {
  const color =
    tone === "amber"
      ? "var(--amber)"
      : tone === "danger"
        ? "var(--danger)"
        : tone === "success"
          ? "var(--success)"
          : "var(--cyan)";
  return (
    <div className="panel relative overflow-hidden p-3">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
      <div className="flex items-start justify-between">
        <p className="label-xs">{label}</p>
        <Icon className="size-4" style={{ color }} />
      </div>
      <p className="mt-2 font-mono text-4xl leading-none" style={{ color }}>
        <CountUp value={value} />
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
