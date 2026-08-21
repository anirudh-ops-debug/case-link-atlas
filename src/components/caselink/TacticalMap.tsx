import { useMemo, useState } from "react";

import { EVIDENCE_COLOR, fmtDateTime } from "./bits";
import { haversineKm } from "@/lib/caselink/matching";
import type { Evidence } from "@/lib/caselink/types";
import { cn } from "@/lib/utils";

const W = 900;
const H = 620;
const PAD = 74;

export function TacticalMap({
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
  const [hoverSeg, setHoverSeg] = useState<number | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  const ordered = useMemo(
    () => evidence
      .filter((item): item is Evidence & { lat: number; lng: number } => item.lat != null && item.lng != null)
      .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp)),
    [evidence],
  );

  const project = useMemo(() => {
    if (!ordered.length) return () => ({ x: W / 2, y: H / 2 });
    const lats = ordered.map((e) => e.lat);
    const lngs = ordered.map((e) => e.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanLat = Math.max(0.03, maxLat - minLat);
    const spanLng = Math.max(0.03, maxLng - minLng);
    return (lat: number, lng: number) => ({
      x: PAD + ((lng - minLng) / spanLng) * (W - PAD * 2),
      y: H - PAD - ((lat - minLat) / spanLat) * (H - PAD * 2),
    });
  }, [ordered]);

  const pts = ordered.map((e) => ({ e, ...(project as (a: number, b: number) => { x: number; y: number })(e.lat, e.lng) }));

  const segments = pts.slice(1).map((p, i) => {
    const prev = pts[i]!;
    const km = haversineKm(prev.e.lat, prev.e.lng, p.e.lat, p.e.lng);
    const mins = (+new Date(p.e.timestamp) - +new Date(prev.e.timestamp)) / 60000;
    const speed = mins > 0 ? (km / mins) * 60 : 0;
    const confidence = prev.e.reliability != null && p.e.reliability != null
      ? Math.round(
          Math.max(
            18,
            Math.min(
              95,
              (prev.e.reliability + p.e.reliability) / 2 -
                Math.abs(speed - 34) * 0.55 -
                (mins > 720 ? 18 : 0),
            ),
          ),
        )
      : null;
    return { from: prev, to: p, km, mins, speed, confidence, index: i };
  });

  const hovered = hoverSeg !== null ? segments[hoverSeg] : null;
  const hoveredNode = hoverNode ? pts.find((p) => p.e.id === hoverNode) : null;

  return (
    <div className={cn("panel relative overflow-hidden", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-full w-full" role="img" aria-label="Tactical evidence map">
        <defs>
          <pattern id="map-grid" width="45" height="45" patternUnits="userSpaceOnUse">
            <path d="M45 0H0V45" fill="none" stroke="var(--grid)" strokeWidth="1" />
          </pattern>
          <linearGradient id="map-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="var(--background)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="var(--background)" />
        <rect width={W} height={H} fill="url(#map-grid)" />
        <rect width={W} height={H} fill="url(#map-fade)" />

        {/* synthetic coastline / corridor hints */}
        <path
          d={`M ${W - 150} 0 C ${W - 190} 160, ${W - 120} 330, ${W - 168} ${H}`}
          fill="none"
          stroke="oklch(0.75 0.09 240 / 0.35)"
          strokeWidth="2"
        />
        <path
          d={`M 0 ${H * 0.66} C ${W * 0.3} ${H * 0.58}, ${W * 0.62} ${H * 0.78}, ${W} ${H * 0.7}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1.5"
          strokeDasharray="10 12"
        />

        {/* movement paths */}
        {segments.map((s) => {
          const active = hoverSeg === s.index;
          const mx = (s.from.x + s.to.x) / 2;
          const my = (s.from.y + s.to.y) / 2 - 26;
          const d = `M ${s.from.x} ${s.from.y} Q ${mx} ${my} ${s.to.x} ${s.to.y}`;
          return (
            <g key={s.index}>
              <path
                d={d}
                fill="none"
                stroke={active ? "var(--amber)" : "var(--cyan)"}
                strokeWidth={active ? 2.6 : 1.6}
                opacity={active ? 1 : 0.7}
                className="path-flow"
              />
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth="20"
                style={{ cursor: "help" }}
                onMouseEnter={() => setHoverSeg(s.index)}
                onMouseLeave={() => setHoverSeg((v) => (v === s.index ? null : v))}
              />
              <text
                x={mx}
                y={my + 4}
                textAnchor="middle"
                className="font-mono"
                fontSize="11"
                fill={active ? "var(--amber)" : "var(--muted-foreground)"}
              >
                {s.confidence == null ? "—" : `${s.confidence}%`}
              </text>
            </g>
          );
        })}

        {/* markers */}
        {pts.map((p, i) => {
          const color = EVIDENCE_COLOR[p.e.type];
          const isSel = selectedId === p.e.id;
          const isHi = highlighted.includes(p.e.id);
          return (
            <g
              key={p.e.id}
              transform={`translate(${p.x} ${p.y})`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect?.(p.e.id)}
              onMouseEnter={() => setHoverNode(p.e.id)}
              onMouseLeave={() => setHoverNode((v) => (v === p.e.id ? null : v))}
            >
              {(isSel || isHi) && (
                <circle r="19" fill={color} opacity="0.18" className="animate-trace-pulse" />
              )}
              <circle r="11" fill="var(--background)" stroke={color} strokeWidth={isSel ? 3 : 1.6} />
              <circle r="4.5" fill={color} />
              <text
                y="-17"
                textAnchor="middle"
                className="font-mono"
                fontSize="10"
                fill={isSel ? color : "var(--muted-foreground)"}
              >
                {i + 1} · {p.e.type}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        {Object.entries(EVIDENCE_COLOR).map(([k, v]) => (
          <span
            key={k}
            className="flex items-center gap-1 rounded-sm border border-border/70 bg-background/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground"
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: v }} />
            {k}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute right-3 top-3 rounded-sm border border-border/70 bg-background/80 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        Synthetic tactical overlay · Chennai region
      </div>

      {(hovered || hoveredNode) && (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 max-w-md rounded-md border border-cyan/30 bg-background/95 p-3 shadow-panel animate-rise">
          {hovered ? (
            <>
              <p className="label-xs text-cyan">
                Route link {hovered.from.e.id} → {hovered.to.e.id}
                {hovered.confidence == null ? "" : ` · ${hovered.confidence}% confidence`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground">
                Why this connection exists: {hovered.from.e.type} evidence at{" "}
                {hovered.from.e.locationName} is followed {Math.round(hovered.mins)} min later by{" "}
                {hovered.to.e.type} evidence at {hovered.to.e.locationName},{" "}
                {hovered.km.toFixed(2)} km away. The implied {hovered.speed.toFixed(0)} km/h is{" "}
                {hovered.speed > 18 ? "consistent with vehicle travel" : "consistent with movement on foot or local transit"}
                .{hovered.from.e.reliability != null && hovered.to.e.reliability != null ? (
                  <> Mean source reliability is {Math.round((hovered.from.e.reliability + hovered.to.e.reliability) / 2)}%.</>
                ) : null}
              </p>
            </>
          ) : hoveredNode ? (
            <>
              <p className="label-xs text-cyan">
                {hoveredNode.e.id} · {hoveredNode.e.type} · {fmtDateTime(hoveredNode.e.timestamp)}
              </p>
              <p className="mt-1 text-xs text-foreground">{hoveredNode.e.label}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{hoveredNode.e.interpretation}</p>
            </>
          ) : null}
        </div>
      )}

      {!ordered.length && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="label-xs">No geolocated evidence on this file yet</p>
        </div>
      )}
    </div>
  );
}
