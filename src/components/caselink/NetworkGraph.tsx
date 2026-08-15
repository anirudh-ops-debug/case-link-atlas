import { useMemo, useState } from "react";

import type { CaseLink, Investigation, Verdict } from "@/lib/caselink/types";
import { cn } from "@/lib/utils";

const W = 880;
const H = 560;

const verdictColor = (v: Verdict) =>
  v === "confirmed"
    ? "var(--success)"
    : v === "rejected"
      ? "var(--danger)"
      : v === "more-evidence"
        ? "var(--amber)"
        : "var(--cyan)";

export function NetworkGraph({
  cases,
  links,
  verdicts,
  selectedLinkId,
  onSelectLink,
  selectedCaseId,
  onSelectCase,
  className,
}: {
  cases: Investigation[];
  links: CaseLink[];
  verdicts: Record<string, Verdict>;
  selectedLinkId?: string | null;
  onSelectLink?: (id: string) => void;
  selectedCaseId?: string | null;
  onSelectCase?: (id: string) => void;
  className?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const nodes = useMemo(() => {
    const R = Math.min(W, H) / 2 - 92;
    const cx = W / 2;
    const cy = H / 2;
    return cases.map((c, i) => {
      const a = (i / Math.max(1, cases.length)) * Math.PI * 2 - Math.PI / 2;
      const degree = links.filter((l) => l.aId === c.id || l.bId === c.id).length;
      return {
        c,
        degree,
        x: cx + Math.cos(a) * R,
        y: cy + Math.sin(a) * R * 0.86,
      };
    });
  }, [cases, links]);

  const pos = (id: string) => nodes.find((n) => n.c.id === id);

  return (
    <div className={cn("panel relative overflow-hidden", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-full w-full" role="img" aria-label="Cross-case network graph">
        <defs>
          <pattern id="net-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--grid)" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#net-grid)" />

        {links.map((l, i) => {
          const a = pos(l.aId);
          const b = pos(l.bId);
          if (!a || !b) return null;
          const v = verdicts[l.id] ?? "pending";
          const color = verdictColor(v);
          const active = selectedLinkId === l.id || hover === l.id;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={l.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={active ? 3 : Math.max(1, l.confidence / 34)}
                opacity={v === "rejected" ? 0.3 : active ? 1 : 0.55}
                strokeDasharray={v === "pending" ? undefined : "none"}
                style={{
                  ["--len" as string]: len,
                  strokeDasharray: len,
                  animation: `draw-line 1.1s ease-out ${i * 0.09}s both`,
                }}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth="18"
                style={{ cursor: "pointer" }}
                onClick={() => onSelectLink?.(l.id)}
                onMouseEnter={() => setHover(l.id)}
                onMouseLeave={() => setHover((h) => (h === l.id ? null : h))}
              />
              <g transform={`translate(${mx} ${my})`} style={{ pointerEvents: "none" }}>
                <rect
                  x="-19"
                  y="-9"
                  width="38"
                  height="18"
                  rx="3"
                  fill="var(--background)"
                  stroke={color}
                  strokeOpacity={active ? 0.9 : 0.4}
                />
                <text
                  textAnchor="middle"
                  y="4"
                  fontSize="10"
                  className="font-mono"
                  fill={active ? color : "var(--muted-foreground)"}
                >
                  {l.confidence}%
                </text>
              </g>
            </g>
          );
        })}

        {nodes.map((n) => {
          const isSel = selectedCaseId === n.c.id;
          const r = 20 + Math.min(12, n.degree * 3);
          const color =
            n.c.priority === "Critical"
              ? "var(--danger)"
              : n.c.priority === "High"
                ? "var(--amber)"
                : "var(--cyan)";
          return (
            <g
              key={n.c.id}
              transform={`translate(${n.x} ${n.y})`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectCase?.(n.c.id)}
            >
              <circle r={r + 8} fill={color} opacity={isSel ? 0.2 : 0.09} className="animate-trace-pulse" />
              <circle r={r} fill="var(--surface)" stroke={color} strokeWidth={isSel ? 3 : 1.5} />
              <text textAnchor="middle" y="-2" fontSize="11" className="font-mono" fill="var(--foreground)">
                {n.c.code}
              </text>
              <text textAnchor="middle" y="10" fontSize="9" className="font-mono" fill="var(--muted-foreground)">
                {n.degree} link{n.degree === 1 ? "" : "s"}
              </text>
              <text
                textAnchor="middle"
                y={r + 15}
                fontSize="10"
                fill="var(--muted-foreground)"
              >
                {n.c.type}
              </text>
            </g>
          );
        })}
      </svg>

      {!links.length && (
        <div className="absolute inset-x-0 bottom-4 text-center label-xs">
          No correlations above threshold — nodes shown without edges
        </div>
      )}
    </div>
  );
}
