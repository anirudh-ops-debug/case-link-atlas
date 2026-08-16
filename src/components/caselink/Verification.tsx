/**
 * DOUBLE VERIFY + EVIDENCE CHAIN UI (modules 5 & 8)
 *
 * Purpose: give the investigator a second, independent pass over an AI-proposed
 * link, and a traceable path from the suggestion back to the source records.
 * Each row is tagged with its evidence layer so an inference is never shown as
 * established fact.
 */
import { ArrowDown, CheckCircle2, CircleSlash, MinusCircle, ShieldQuestion } from "lucide-react";
import { useMemo, useState } from "react";

import { Chip, SectionTitle } from "./bits";
import { doubleVerify, evidenceChain, type ChainStep } from "@/lib/caselink/verify";
import type { CaseLink, Investigation, VerifyCheck } from "@/lib/caselink/types";
import { cn } from "@/lib/utils";

const LAYER_TONE: Record<VerifyCheck["layer"], string> = {
  "AI INFERENCE": "border-cyan/40 bg-cyan/10 text-cyan",
  "DIRECT EVIDENCE": "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  "INVESTIGATOR CONFIRMED": "border-amber/40 bg-amber/10 text-amber",
};

function StatusIcon({ status }: { status: VerifyCheck["status"] }) {
  if (status === "SUPPORTED") return <CheckCircle2 className="size-4 text-emerald-400" />;
  if (status === "PARTIAL") return <MinusCircle className="size-4 text-amber" />;
  return <CircleSlash className="size-4 text-muted-foreground" />;
}

export function DoubleVerifyPanel({
  link,
  a,
  b,
  onRun,
  onInspectEvidence,
}: {
  link: CaseLink;
  a: Investigation;
  b: Investigation;
  onRun?: () => void;
  onInspectEvidence?: (evidenceId: string) => void;
}) {
  const [run, setRun] = useState(false);
  const result = useMemo(() => doubleVerify(link, a, b), [link, a, b]);

  return (
    <section className="panel overflow-hidden">
      <SectionTitle
        right={
          run ? (
            <Chip tone={result.strength === "HIGH" ? "amber" : "default"}>
              {result.strength} STRENGTH LEAD
            </Chip>

          ) : (
            <Chip>Layer 2</Chip>
          )
        }
      >
        Double Verify
      </SectionTitle>

      {!run ? (
        <div className="space-y-3 p-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            The initial analysis proposed this relationship. Double Verify re-derives every
            dimension directly from the underlying evidence records — independently of the original
            score — and separates AI inference from direct evidence before you act on the lead.
          </p>
          <ol className="space-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <li>1 · Initial AI analysis · complete</li>
            <li>2 · Independent timeline check</li>
            <li>3 · Independent geographic check</li>
            <li>4 · Modus operandi re-derivation</li>
            <li>5 · Identifier and supporting-record check</li>
            <li>6 · Final investigative lead</li>
          </ol>
          <button
            onClick={() => {
              setRun(true);
              onRun?.();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan transition-colors hover:bg-cyan/25"
          >
            <ShieldQuestion className="size-3.5" /> Run secondary verification
          </button>
        </div>
      ) : (
        <div className="space-y-2.5 p-3">
          <div className="rounded-md border border-amber/30 bg-amber/[0.07] p-2.5 text-[12px] leading-relaxed text-foreground/90">
            {result.summary}
          </div>
          <ul className="space-y-2">
            {result.checks.map((c) => (
              <li key={c.id} className="rounded-md border border-border/70 bg-surface-2/40 p-2.5">
                <div className="flex items-start gap-2">
                  <StatusIcon status={c.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[12px] font-medium text-foreground">{c.label}</p>
                      <span
                        className={cn(
                          "rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]",
                          LAYER_TONE[c.layer],
                        )}
                      >
                        {c.layer}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                        {c.strength} indicator
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{c.detail}</p>
                    {c.sources.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {Array.from(new Set(c.sources)).map((s) => (
                          <button
                            key={s}
                            onClick={() => onInspectEvidence?.(s)}
                            className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setRun(false)}
            className="w-full rounded-sm border border-border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            Reset verification
          </button>
        </div>
      )}
    </section>
  );
}

const CHAIN_TONE: Record<ChainStep["kind"], string> = {
  case: "border-cyan/40 bg-cyan/10 text-foreground",
  evidence: "border-emerald-400/35 bg-emerald-400/[0.08] text-foreground",
  attribute: "border-border bg-surface-2/50 text-muted-foreground",
  inference: "border-amber/40 bg-amber/[0.08] text-amber",
};

export function EvidenceChainView({
  link,
  a,
  b,
  onInspectEvidence,
}: {
  link: CaseLink;
  a: Investigation;
  b: Investigation;
  onInspectEvidence?: (evidenceId: string) => void;
}) {
  const steps = useMemo(() => evidenceChain(link, a, b), [link, a, b]);
  return (
    <section className="panel overflow-hidden">
      <SectionTitle right={<Chip>{steps.length} hops</Chip>}>Evidence chain</SectionTitle>
      <div className="space-y-1 p-3">
        <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
          Exactly which records produced this suggestion, in order. Nothing here is a black box.
        </p>
        {steps.map((s, i) => (
          <div key={`${s.label}-${i}`}>
            <button
              disabled={s.kind !== "evidence"}
              onClick={() => s.ref && onInspectEvidence?.(s.ref)}
              className={cn(
                "w-full rounded-md border px-2.5 py-1.5 text-left text-[11px] leading-snug transition-colors",
                CHAIN_TONE[s.kind],
                s.kind === "evidence" && "hover:border-cyan/60",
              )}
            >
              {s.ref ? <span className="font-mono text-[9px] text-muted-foreground">{s.ref} · </span> : null}
              {s.label}
            </button>
            {i < steps.length - 1 ? (
              <div className="flex justify-center py-0.5">
                <ArrowDown className="size-3 text-muted-foreground/60" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
