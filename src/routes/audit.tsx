/**
 * AUDIT TRAIL (module 15)
 *
 * Purpose: every AI request, verification and verdict recorded in this session is
 * listed here with actor, role and timestamp — accountability for a system that
 * only ever proposes leads.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Chip, EmptyState, SectionTitle, fmtDateTime, relative } from "@/components/caselink/bits";
import { Shell } from "@/components/caselink/Shell";
import { useCaseLink } from "@/lib/caselink/store";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Trail · CASELINK" },
      {
        name: "description",
        content:
          "Accountability log of every AI analysis, secondary verification and investigator verdict recorded in the current CASELINK session.",
      },
      { property: "og:title", content: "Audit Trail · CASELINK" },
      {
        property: "og:description",
        content: "Who asked what, when, and what they decided — full investigative accountability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { audit, session, can } = useCaseLink();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return audit;
    return audit.filter((a) =>
      `${a.actor} ${a.role} ${a.action} ${a.subject} ${a.detail}`.toLowerCase().includes(t),
    );
  }, [audit, q]);

  if (!can("audit.read")) {
    return (
      <Shell title="Audit Trail" subtitle="Restricted">
        <section className="panel p-8">
          <EmptyState
            title="Insufficient authorization"
            hint={`The audit trail is available to supervisor and administrator roles. Your session is authorized as ${session?.role ?? "unauthenticated"}.`}
          />
        </section>
      </Shell>
    );
  }

  const exportLog = () => {
    const csv = [
      "timestamp,actor,role,action,subject,detail",
      ...audit.map((a) =>
        [a.at, a.actor, a.role, a.action, a.subject, a.detail]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "caselink-audit.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Shell title="Audit Trail" subtitle="Append-only accountability record">
      <div className="space-y-3">
        <section className="panel flex flex-wrap items-center gap-2 p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by actor, action or case…"
            className="min-w-[220px] flex-1 rounded-md border border-input bg-background/70 px-3 py-2 text-[13px] outline-none focus:border-cyan/60 placeholder:text-muted-foreground/60"
          />
          <Chip tone="cyan">{rows.length} entries</Chip>
          <button
            onClick={exportLog}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
          >
            <Download className="size-3.5" /> Export CSV
          </button>
        </section>

        <section className="panel overflow-hidden">
          <SectionTitle right={<Chip>session scope</Chip>}>Recorded activity</SectionTitle>
          {rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No activity recorded yet"
                hint="Run an AI analysis, a secondary verification, or record a link verdict and it will appear here immediately."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows.map((a) => (
                <li key={a.id} className="px-3 py-2.5 hover:bg-cyan/[0.03]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-cyan">
                      {a.action}
                    </span>
                    <span className="font-mono text-[11px] text-foreground">{a.subject}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {fmtDateTime(a.at)} · {relative(a.at)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{a.detail}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    {a.actor} · {a.role}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
