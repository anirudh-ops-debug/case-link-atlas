import { useMemo } from "react";

import { EVIDENCE_COLOR, EVIDENCE_ICON, fmtDateTime } from "@/components/caselink/bits";
import type { Evidence } from "@/lib/caselink/types";

export function InvestigationTimeline({ evidence }: { evidence: Evidence[] }) {
  const ordered = useMemo(
    () => [...evidence].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)),
    [evidence],
  );
  if (!ordered.length) return <p className="px-3 py-8 text-center label-xs">No recent activity</p>;
  return (
    <ol className="relative space-y-1 py-2 pl-1">
      <span aria-hidden className="absolute bottom-3 left-[26px] top-3 w-px bg-gradient-to-b from-cyan/50 via-border to-transparent" />
      {ordered.map((item) => {
        const Icon = EVIDENCE_ICON[item.type];
        const color = EVIDENCE_COLOR[item.type];
        return (
          <li key={`${item.recordKind ?? "record"}-${item.id}`} className="relative">
            <div className="flex items-start gap-3 rounded-md border border-transparent px-2 py-2">
              <span className="relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border bg-background" style={{ borderColor: color }}>
                <Icon className="size-3.5" style={{ color }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color }}>{item.recordKind === "timeline" ? "Activity" : item.type}</span>
                  <time className="font-mono text-[10px] text-muted-foreground">{fmtDateTime(item.timestamp)}</time>
                </span>
                <span className="mt-0.5 block text-[13px] text-foreground">{item.label}</span>
                {item.details ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.details}</span> : null}
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.locationName || "Location not recorded"}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
