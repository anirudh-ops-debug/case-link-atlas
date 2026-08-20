import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import {
  Chip,
  ConfidenceBar,
  EVIDENCE_COLOR,
  EVIDENCE_ICON,
  PriorityDot,
  fmtDateTime,
} from "./bits";
import { VerdictControls } from "./AIPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCaseLink } from "@/lib/caselink/store";
import type { Evidence, Investigation } from "@/lib/caselink/types";

export interface DrawerTarget {
  kind: "evidence" | "case";
  id: string;
}

export function DetailDrawer({
  target,
  onClose,
  onSelectEvidence,
}: {
  target: DrawerTarget | null;
  onClose: () => void;
  onSelectEvidence?: (id: string) => void;
}) {
  const { cases, allEvidence, linksFor, verdicts, setVerdict, getCase } = useCaseLink();

  const evidence: Evidence | undefined =
    target?.kind === "evidence" ? allEvidence.find((e) => e.id === target.id) : undefined;
  const investigation: Investigation | undefined =
    target?.kind === "case"
      ? getCase(target.id)
      : evidence
        ? getCase(evidence.caseId)
        : undefined;

  // evidence thread: everything sharing keywords, source, location or case
  const thread = evidence
    ? allEvidence.filter((e) => {
        if (e.id === evidence.id) return false;
        if (e.caseId === evidence.caseId) return true;
        if (e.source === evidence.source) return true;
        if (e.locationName === evidence.locationName) return true;
        return e.keywords.some((k) => evidence.keywords.includes(k));
      })
    : [];

  const links = investigation ? linksFor(investigation.id) : [];

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto border-border bg-surface/95 p-0 backdrop-blur-xl sm:max-w-lg">
        <SheetHeader className="border-b border-border/70 p-4">
          <SheetTitle className="text-base">
            {evidence ? evidence.label : (investigation?.title ?? "Record")}
          </SheetTitle>
          <p className="label-xs">
            {evidence
              ? `${evidence.id} · ${evidence.type} evidence`
              : `${investigation?.code ?? ""} · ${investigation?.type ?? ""}`}
          </p>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {evidence ? (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Source" value={evidence.source || "Not recorded"} />
                <Field label="Timestamp" value={fmtDateTime(evidence.timestamp)} />
                <Field label="Location" value={evidence.locationName || "Not recorded"} />
                <Field
                  label="Coordinates"
                  value={
                    evidence.lat != null && evidence.lng != null
                      ? `${evidence.lat.toFixed(4)}, ${evidence.lng.toFixed(4)}`
                      : "Not recorded"
                  }
                />
                <Field label="Stage" value={evidence.stage} />
                <Field label="Case file" value={evidence.caseId} />
              </dl>

              {evidence.reliability != null ? (
                <ConfidenceBar label="Source reliability" value={evidence.reliability} />
              ) : (
                <p className="label-xs">Source reliability · not recorded</p>
              )}

              <Block title="Recorded detail">{evidence.details}</Block>
              <Block title="AI interpretation">{evidence.interpretation}</Block>

              <div>
                <p className="label-xs">Attributes</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {evidence.keywords.map((k) => (
                    <Chip key={k}>{k}</Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="label-xs">Related evidence thread ({thread.length})</p>
                <div className="mt-1.5 space-y-1.5">
                  {thread.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      No connected records — this evidence is currently standalone.
                    </p>
                  ) : (
                    thread.slice(0, 10).map((e) => {
                      const Icon = EVIDENCE_ICON[e.type];
                      return (
                        <button
                          key={e.id}
                          onClick={() => onSelectEvidence?.(e.id)}
                          className="flex w-full items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-left transition-colors hover:border-cyan/40 hover:bg-surface-2/60"
                        >
                          <Icon className="size-3.5 shrink-0" style={{ color: EVIDENCE_COLOR[e.type] }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] text-foreground">{e.label}</span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">
                              {e.caseId} · {e.id} · {fmtDateTime(e.timestamp)}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : null}

          {investigation ? (
            <>
              <div className="rounded-md border border-border/70 bg-surface-2/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-cyan">{investigation.code}</p>
                  <PriorityDot priority={investigation.priority} />
                </div>
                <p className="mt-1 text-sm font-medium text-foreground">{investigation.title}</p>
                <dl className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="Subject" value={investigation.subject.name || "Not recorded"} />
                  <Field label="Status" value={investigation.status} />
                  <Field label="Incident" value={fmtDateTime(investigation.incidentDate)} />
                  <Field label="Last known" value={investigation.lastKnownLocation || "Not recorded"} />
                  <Field label="Officer" value={investigation.officer || "Not recorded"} />
                  <Field label="Evidence" value={`${investigation.evidence.length} records`} />
                </dl>
                {investigation.subject.aliases.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {investigation.subject.aliases.map((a) => (
                      <Chip key={a} tone="amber">
                        alias {a}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                <Link
                  to="/investigations/$caseId"
                  params={{ caseId: investigation.id }}
                  onClick={onClose}
                  className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan hover:underline"
                >
                  Open investigation view <ExternalLink className="size-3" />
                </Link>
              </div>

              <Block title="Case notes">{investigation.notes}</Block>

              <div>
                <p className="label-xs">Linked investigations ({links.length})</p>
                <div className="mt-1.5 space-y-2">
                  {links.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      No cross-case correlations above threshold.
                    </p>
                  ) : (
                    links.map((l) => {
                      const other = cases.find(
                        (c) => c.id === (l.aId === investigation.id ? l.bId : l.aId),
                      );
                      const v = verdicts[l.id] ?? "pending";
                      return (
                        <div key={l.id} className="rounded-md border border-border/70 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[12px] text-foreground">
                              {other?.code} · {other?.title}
                            </p>
                            <span className="font-mono text-[12px] text-amber">{l.confidence}%</span>
                          </div>
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                            {l.explanation}
                          </p>
                          <div className="mt-2">
                            <VerdictControls linkId={l.id} verdict={v} onChange={setVerdict} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-xs">{label}</dt>
      <dd className="truncate text-[12px] text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/70 bg-surface-2/40 p-3">
      <p className="label-xs">{title}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
