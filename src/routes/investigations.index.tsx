import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Database, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Chip, PriorityDot, Skeletons, EmptyState } from "@/components/caselink/bits";
import { Shell } from "@/components/caselink/Shell";
import { CASE_TYPES, PRIORITIES } from "@/lib/caselink/data";
import { useCaseLink } from "@/lib/caselink/store";
import { supabase } from "@/integrations/supabase/client";
import { loadEligibleInvestigators, type EligibleInvestigator } from "@/lib/caselink/investigations.repository";

export const Route = createFileRoute("/investigations/")({
  head: () => ({
    meta: [
      { title: "Investigations · CASELINK" },
      {
        name: "description",
        content:
          "Browse, search and filter database-backed CASELINK investigations by workflow status, type and priority.",
      },
      { property: "og:title", content: "Investigations · CASELINK" },
      {
        property: "og:description",
        content: "Search and triage database-backed investigation files in the CASELINK register.",
      },
    ],
  }),
  component: InvestigationsPage,
});

function InvestigationsPage() {
  const { cases, casesError, casesLoading, retryCases, links, deleteCase } = useCaseLink();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [priority, setPriority] = useState("all");
  const [statusTab, setStatusTab] = useState<"all" | "active" | "under-review" | "dormant" | "completed">("all");
  const [investigator, setInvestigator] = useState("all");
  const [eligibleInvestigators, setEligibleInvestigators] = useState<EligibleInvestigator[]>([]);
  useEffect(() => { void loadEligibleInvestigators(supabase).then(setEligibleInvestigators).catch(() => setEligibleInvestigators([])); }, []);
  const caseTypes = useMemo(() => Array.from(new Set([...CASE_TYPES, ...cases.map((item) => item.type)])), [cases]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusTab === "active" && c.status !== "Active") return false;
      if (statusTab === "under-review" && c.status !== "Under Review") return false;
      if (statusTab === "completed" && c.status !== "Closed") return false;
      if (statusTab === "dormant" && c.status !== "Dormant") return false;
      if (investigator === "unassigned" && c.assignedInvestigatorId) return false;
      if (investigator !== "all" && investigator !== "unassigned" && c.assignedInvestigatorId !== investigator) return false;
      if (type !== "all" && c.type !== type) return false;
      if (priority !== "all" && c.priority !== priority) return false;
      if (!needle) return true;
      return [
        c.code,
        c.title,
        c.type,
        c.status,
        c.subject.name,
        c.lastKnownLocation,
        c.notes,
        ...c.subject.aliases,
        ...c.evidence.map((e) => `${e.label} ${e.locationName} ${e.keywords.join(" ")}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [cases, q, type, priority, statusTab, investigator]);

  const tabCounts = {
    all: cases.length,
    active: cases.filter((item) => item.status === "Active").length,
    underReview: cases.filter((item) => item.status === "Under Review").length,
    dormant: cases.filter((item) => item.status === "Dormant").length,
    completed: cases.filter((item) => item.status === "Closed").length,
  };

  const select =
    "rounded-md border border-input bg-background/70 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-cyan/60";

  return (
    <Shell
      title="Investigations"
      subtitle={`${cases.length} files in register`}
      actions={
        <Link
          to="/investigations/new"
          className="rounded-md border border-cyan/50 bg-cyan/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:bg-cyan/25"
        >
          New investigation
        </Link>
      }
    >
      <div className="panel mb-3 flex flex-wrap gap-2 p-2" role="tablist" aria-label="Investigation status">
        {(["all", "active", "under-review", "dormant", "completed"] as const).map((tab) => {
          const count = tab === "all" ? tabCounts.all : tab === "active" ? tabCounts.active : tab === "under-review" ? tabCounts.underReview : tab === "dormant" ? tabCounts.dormant : tabCounts.completed;
          const label = tab === "all" ? "All" : tab === "under-review" ? "Under Review" : `${tab.charAt(0).toUpperCase()}${tab.slice(1)}`;
          return <button key={tab} type="button" role="tab" aria-selected={statusTab === tab} onClick={() => setStatusTab(tab)} className="rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] data-[selected=true]:border-cyan/60 data-[selected=true]:text-cyan" data-selected={statusTab === tab}>{label} {count}</button>;
        })}
      </div>
      <div className="panel mb-3 flex flex-wrap items-center gap-2 p-2.5">
        <span className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-input bg-background/70 px-2.5 py-1.5 focus-within:border-cyan/60">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subjects, aliases, locations, keywords…"
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
          />
        </span>
        <select value={type} onChange={(e) => setType(e.target.value)} className={select}>
          <option value="all">All case types</option>
          {caseTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={select}>
          <option value="all">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={investigator} onChange={(event) => setInvestigator(event.target.value)} className={select} aria-label="Filter by assigned investigator">
          <option value="all">All investigators</option><option value="unassigned">Unassigned</option>
          {eligibleInvestigators.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
        </select>
        <Chip tone="cyan">{filtered.length} shown</Chip>
      </div>

      {casesLoading ? (
        <Skeletons rows={5} />
      ) : casesError ? (
        <div className="panel flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="size-6 text-danger" />
          <p className="text-sm font-medium text-danger">Could not load investigations</p>
          <p className="max-w-lg font-mono text-[11px] text-muted-foreground">{casesError}</p>
          <button
            type="button"
            onClick={retryCases}
            className="flex items-center gap-2 rounded-md border border-cyan/50 bg-cyan/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/20"
          >
            <RefreshCw className="size-3" /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={cases.length === 0 ? "No investigations in the database" : "No investigations match these filters"}
            hint={
              cases.length === 0
                ? "The authenticated database query returned zero case records."
                : "Clear the search text or widen the case type and priority filters."
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((c) => {
            const caseLinks = links.filter((l) => l.aId === c.id || l.bId === c.id);
            return (
              <article
                key={c.id}
                className="panel group animate-rise p-3 transition-colors hover:border-cyan/35"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-cyan">{c.code}</span>
                  <PriorityDot priority={c.priority} />
                </div>
                <Link
                  to="/investigations/$caseId"
                  params={{ caseId: c.id }}
                  className="mt-1.5 block text-[14px] font-medium text-foreground hover:text-cyan"
                >
                  {c.title}
                </Link>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {c.type} · {c.status === "Closed" ? "Completed" : c.status} · {c.district}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">Assigned investigator: {c.officer || "Name not recorded"}</p>
                <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                  {c.notes}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Chip>{c.evidence.length} evidence</Chip>
                  <Chip tone={caseLinks.length ? "amber" : "default"}>
                    {caseLinks.length} links
                  </Chip>
                  <Chip>{c.lastKnownLocation}</Chip>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                  <Link
                    to="/investigations/$caseId"
                    params={{ caseId: c.id }}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:underline"
                  >
                    Open workspace
                  </Link>
                  {c.isDatabaseBacked ? (
                    <span
                      title="Database archive is not implemented in this read-only phase"
                      className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      <Database className="size-3" /> Read only
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        deleteCase(c.id);
                        toast.success(`${c.code} removed from this local session`);
                      }}
                      className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="size-3" /> Remove local
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
