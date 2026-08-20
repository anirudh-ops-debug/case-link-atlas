import { useMemo } from "react";

import { EVIDENCE_COLOR, EVIDENCE_ICON, fmtDateTime } from "./bits";
import type { Evidence } from "@/lib/caselink/types";
import { cn } from "@/lib/utils";

export function Timeline({
  evidence,
  selectedId,
  onSelect,
  highlighted = [],
  className,
}: {
  evidence: Evidence[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  highlighted?: string[];
  className?: string;
}) {
  const ordered = useMemo(
    () => [...evidence].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp)),
    [evidence],
  );

  return (
    <div className={cn("relative", className)}>
      {ordered.length === 0 ? (
        <p className="px-3 py-8 text-center label-xs">No timeline events</p>
      ) : (
        <ol className="relative space-y-1 py-2 pl-1">
          <span className="absolute bottom-3 left-[26px] top-3 w-px bg-gradient-to-b from-cyan/50 via-border to-transparent" />
          {ordered.map((e, i) => {
            const Icon = EVIDENCE_ICON[e.type];
            const color = EVIDENCE_COLOR[e.type];
            const isSel = selectedId === e.id;
            const isHi = highlighted.includes(e.id);
            const prev = ordered[i - 1];
            const gapMin = prev
              ? Math.round((+new Date(e.timestamp) - +new Date(prev.timestamp)) / 60000)
              : 0;
            return (
              <li key={e.id} className="relative">
                {prev && (
                  <p className="ml-[46px] font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
                    + {gapMin >= 60 ? `${(gapMin / 60).toFixed(1)} h` : `${gapMin} min`}
                  </p>
                )}
                <button
                  onClick={() => onSelect?.(e.id)}
                  className={cn(
                    "group flex w-full items-start gap-3 rounded-md border px-2 py-2 text-left transition-all duration-200",
                    isSel
                      ? "border-cyan/50 bg-cyan/10"
                      : isHi
                        ? "border-amber/40 bg-amber/5"
                        : "border-transparent hover:border-border hover:bg-surface-2/60",
                  )}
                >
                  <span
                    className="relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border bg-background"
                    style={{
                      borderColor: color,
                      boxShadow: isSel || isHi ? `0 0 14px ${color}` : undefined,
                    }}
                  >
                    <Icon className="size-3.5" style={{ color }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color }}>
                        {e.type}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {fmtDateTime(e.timestamp)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-foreground">{e.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {e.locationName || "Location not recorded"} · reliability {e.reliability == null ? "not recorded" : `${e.reliability}%`} · {e.id}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
