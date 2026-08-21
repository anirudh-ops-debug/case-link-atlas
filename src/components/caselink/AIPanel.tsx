import { Link } from "@tanstack/react-router";
import { BrainCircuit, Check, HelpCircle, X, Sparkles } from "lucide-react";

import { Chip, ConfidenceBar, SectionTitle, VerdictBadge, fmtDateTime } from "./bits";
import { inferDirection } from "@/lib/caselink/matching";
import { useCaseLink } from "@/lib/caselink/store";
import type { Investigation, Verdict } from "@/lib/caselink/types";
import { cn } from "@/lib/utils";

export function VerdictControls({
  linkId,
  verdict,
  onChange,
}: {
  linkId: string;
  verdict: Verdict;
  onChange: (id: string, v: Verdict) => void;
}) {
  const btn =
    "flex flex-1 items-center justify-center gap-1 rounded-sm border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors";
  return (
    <div className="flex gap-1.5">
      <button
        onClick={() => onChange(linkId, verdict === "confirmed" ? "pending" : "confirmed")}
        className={cn(
          btn,
          verdict === "confirmed"
            ? "border-success bg-success/15 text-success"
            : "border-border text-muted-foreground hover:border-success/50 hover:text-success",
        )}
      >
        <Check className="size-3" /> Confirm
      </button>
      <button
        onClick={() => onChange(linkId, verdict === "rejected" ? "pending" : "rejected")}
        className={cn(
          btn,
          verdict === "rejected"
            ? "border-danger bg-danger/15 text-danger"
            : "border-border text-muted-foreground hover:border-danger/50 hover:text-danger",
        )}
      >
        <X className="size-3" /> Reject
      </button>
      <button
        onClick={() => onChange(linkId, verdict === "more-evidence" ? "pending" : "more-evidence")}
        className={cn(
          btn,
          verdict === "more-evidence"
            ? "border-amber bg-amber/15 text-amber"
            : "border-border text-muted-foreground hover:border-amber/50 hover:text-amber",
        )}
      >
        <HelpCircle className="size-3" /> More
      </button>
    </div>
  );
}

export function AIPanel({
  investigation,
  selectedEvidenceId,
  onSelectEvidence,
  className,
}: {
  investigation: Investigation;
  selectedEvidenceId?: string | null;
  onSelectEvidence?: (id: string) => void;
  className?: string;
}) {
  const { linksFor, verdicts, setVerdict, getCase } = useCaseLink();
  const direction = inferDirection(investigation);
  const links = linksFor(investigation.id);
  const selected = investigation.evidence.find((e) => e.id === selectedEvidenceId);

  return (
    <div className={cn("panel flex min-h-0 flex-col overflow-hidden", className)}>
      <SectionTitle right={<Chip tone="cyan">Decision support</Chip>}>
        <span className="flex items-center gap-1.5">
          <BrainCircuit className="size-3.5 text-cyan" /> AI Intelligence Panel
        </span>
      </SectionTitle>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="rounded-md border border-cyan/25 bg-cyan/[0.06] p-3">
          <p className="label-xs text-cyan">Most probable direction</p>
          <p className="mt-1 text-sm font-medium leading-snug text-foreground">
            {direction.heading}
          </p>
          <div className="mt-2 flex items-end gap-3">
            <span className="font-mono text-3xl leading-none text-cyan">
              {direction.confidence}%
            </span>
            <span className="label-xs pb-1">aggregate confidence</span>
          </div>
        </section>

        <section>
          <p className="label-xs">Confidence breakdown</p>
          <div className="mt-2 space-y-2">
            {direction.breakdown.map((b) => (
              <ConfidenceBar key={b.label} label={b.label} value={b.value} />
            ))}
          </div>
        </section>

        <section>
          <p className="label-xs">Supporting evidence</p>
          <div className="mt-2 space-y-1.5">
            {direction.supporting.map((id) => {
              const e = investigation.evidence.find((x) => x.id === id);
              if (!e) return null;
              return (
                <button
                  key={id}
                  onClick={() => onSelectEvidence?.(id)}
                  className={cn(
                    "w-full rounded-md border px-2 py-1.5 text-left transition-colors",
                    selectedEvidenceId === id
                      ? "border-cyan/50 bg-cyan/10"
                      : "border-border/70 hover:border-cyan/40 hover:bg-surface-2/60",
                  )}
                >
                  <p className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    <span>
                      {e.id} · {e.type}
                    </span>
                    <span>{e.reliability == null ? "Reliability not recorded" : `${e.reliability}%`}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-foreground">{e.label}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-md border border-border/70 bg-surface-2/40 p-3">
          <p className="label-xs flex items-center gap-1.5">
            <Sparkles className="size-3 text-amber" /> Why the AI reached this conclusion
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {direction.explanation}
          </p>
        </section>

        {selected ? (
          <section className="rounded-md border border-amber/25 bg-amber/[0.05] p-3">
            <p className="label-xs text-amber">Selected evidence interpretation</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {selected.id} · {fmtDateTime(selected.timestamp)} · {selected.source}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">
              {selected.interpretation}
            </p>
          </section>
        ) : null}

        <section>
          <p className="label-xs">Cross-case correlations ({links.length})</p>
          <div className="mt-2 space-y-2">
            {links.length === 0 ? (
              <p className="rounded-md border border-border/70 p-2.5 text-[11px] text-muted-foreground">
                No candidate links cross the reporting threshold yet. Add vehicle, handset, witness
                or location evidence to widen the comparison surface.
              </p>
            ) : (
              links.map((l) => {
                const otherId = l.aId === investigation.id ? l.bId : l.aId;
                const other = getCase(otherId);
                const verdict = verdicts[l.id] ?? "pending";
                return (
                  <div key={l.id} className="rounded-md border border-border/70 bg-surface-2/40 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium text-foreground">
                          {other?.code} · {other?.title ?? "Unknown file"}
                        </p>
                        <p className="label-xs mt-0.5">{l.reasons.length} correlating signals</p>
                      </div>
                      <span className="font-mono text-sm text-amber">{l.confidence}%</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {l.reasons.slice(0, 3).map((r) => (
                        <li key={r.factor} className="text-[11px] leading-snug text-muted-foreground">
                          <span className="text-foreground/85">{r.factor}:</span> {r.detail}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <VerdictBadge verdict={verdict} />
                      <Link
                        to="/links"
                        search={{ link: l.id }}
                        className="font-mono text-[10px] uppercase tracking-[0.1em] text-cyan hover:underline"
                      >
                        Open in graph
                      </Link>
                    </div>
                    <div className="mt-2">
                      <VerdictControls linkId={l.id} verdict={verdict} onChange={setVerdict} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <p className="border-t border-border/70 px-3 py-2 label-xs">
        AI is decision support only — a human investigator owns every outcome
      </p>
    </div>
  );
}
