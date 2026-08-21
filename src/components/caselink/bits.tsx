import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Users,
  Smartphone,
  Image as ImageIcon,
  Bus,
  MapPin,
  FileQuestion,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { EvidenceType, Priority, Verdict } from "@/lib/caselink/types";

export const EVIDENCE_ICON: Record<EvidenceType, LucideIcon> = {
  CCTV: Camera,
  Witness: Users,
  Phone: Smartphone,
  Photo: ImageIcon,
  Transport: Bus,
  Location: MapPin,
  Other: FileQuestion,
};

export const EVIDENCE_COLOR: Record<EvidenceType, string> = {
  CCTV: "var(--cyan)",
  Witness: "var(--amber)",
  Phone: "var(--success)",
  Photo: "oklch(0.7 0.1 300)",
  Transport: "oklch(0.75 0.09 240)",
  Location: "var(--danger)",
  Other: "var(--muted-foreground)",
};

export function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function relative(iso: string) {
  const diff = Date.now() - +new Date(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function CountUp({
  value,
  duration = 900,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{shown}</span>;
}

export function PriorityDot({ priority }: { priority: Priority }) {
  const color =
    priority === "Critical"
      ? "var(--danger)"
      : priority === "High"
        ? "var(--amber)"
        : priority === "Medium"
          ? "var(--cyan)"
          : "var(--muted-foreground)";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-2 rounded-full animate-trace-pulse"
        style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
      />
      <span className="label-xs" style={{ color }}>
        {priority}
      </span>
    </span>
  );
}

export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "cyan" | "amber" | "danger" | "success";
  className?: string;
}) {
  const map = {
    default: "border-border text-muted-foreground",
    cyan: "border-cyan/40 text-cyan",
    amber: "border-amber/40 text-amber",
    danger: "border-danger/40 text-danger",
    success: "border-success/40 text-success",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border bg-surface-2/50 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.1em] uppercase",
        map[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ConfidenceBar({
  value,
  label,
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const tone =
    value >= 70 ? "var(--danger)" : value >= 45 ? "var(--amber)" : "var(--cyan)";
  return (
    <div className={cn("space-y-1", className)}>
      {label ? (
        <div className="flex items-baseline justify-between">
          <span className="label-xs">{label}</span>
          <span className="font-mono text-[11px] text-foreground">{value}%</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${Math.max(2, Math.min(100, value))}%`,
            backgroundColor: tone,
            boxShadow: `0 0 12px ${tone}`,
          }}
        />
      </div>
    </div>
  );
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  if (verdict === "confirmed") return <Chip tone="success">Confirmed</Chip>;
  if (verdict === "rejected") return <Chip tone="danger">Rejected</Chip>;
  if (verdict === "more-evidence") return <Chip tone="amber">Needs evidence</Chip>;
  return <Chip tone="cyan">Awaiting review</Chip>;
}

export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
      <h2 className="label-xs text-foreground/80">{children}</h2>
      {right}
    </div>
  );
}

export function Skeletons({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="scanline h-12 overflow-hidden rounded-md border border-border/60 bg-surface-2/40"
        >
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-cyan/10 to-transparent animate-sweep" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  );
}
