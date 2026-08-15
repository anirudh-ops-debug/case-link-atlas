import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Chip, PriorityDot, Skeletons, EmptyState } from "@/components/caselink/bits";
import { Shell } from "@/components/caselink/Shell";
import { CASE_TYPES, PRIORITIES } from "@/lib/caselink/data";
import { useCaseLink } from "@/lib/caselink/store";

export const Route = createFileRoute("/investigations/")({
  head: () => ({
    meta: [
      { title: "Active Investigations · CASELINK" },
      {
        name: "description",
        content:
          "Browse, search and filter every active CASELINK investigation file by type, priority and status, with evidence counts and correlation totals.",
      },
      { property: "og:title", content: "Active Investigations · CASELINK" },
      {
        property: "og:description",
        content: "Search and triage active synthetic investigation files in the CASELINK register.",
      },
    ],
  }),
  component: InvestigationsPage,
});

function InvestigationsPage() {
  const { ready, cases, links, deleteCase } = useCaseLink();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [priority, setPriority] = useState("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases.filter((c) => {
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
  }, [cases, q, type, priority]);

  const select =
    "rounded-md border border-input bg-background/70 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-cyan/60";

  return (
    <Shell
      title="Active Investigations"
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
          {CASE_TYPES.map((t) => (
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
        <Chip tone="cyan">{filtered.length} shown</Chip>
      </div>

      {!ready ? (
        <Skeletons rows={5} />
      ) : filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No investigations match these filters"
            hint="Clear the search text or widen the case type and priority filters."
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
                  {c.type} · {c.status} · {c.district}
                </p>
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
                  <button
                    onClick={() => {
                      deleteCase(c.id);
                      toast.success(`${c.code} archived`, {
                        description: "Correlations and graph edges recomputed.",
                      });
                    }}
                    className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="size-3" /> Archive
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
