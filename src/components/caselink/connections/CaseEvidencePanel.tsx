import { SectionTitle } from "@/components/caselink/bits";
import type { Investigation } from "@/lib/caselink/types";

function recorded(value: string | undefined): string {
  return value?.trim() || "Not recorded";
}

export function CaseEvidencePanel({ cases }: { cases: Investigation[] }) {
  return (
    <section className="panel overflow-hidden">
      <SectionTitle>Direct Recorded Evidence</SectionTitle>
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        {cases.map((investigation) => (
          <article key={investigation.id} className="rounded-md border border-border/70 bg-surface-2/30 p-3">
            <h3 className="font-mono text-[11px] text-cyan">{investigation.code} · {investigation.title}</h3>
            <dl className="mt-3 grid grid-cols-[82px_1fr] gap-x-2 gap-y-1.5 text-[11px]">
              <dt className="text-muted-foreground">Person</dt><dd>{recorded(investigation.subject.name)}</dd>
              <dt className="text-muted-foreground">Vehicle</dt><dd>{recorded(investigation.subject.vehicle)}</dd>
              <dt className="text-muted-foreground">Weapon</dt><dd>{recorded(investigation.weapon)}</dd>
              <dt className="text-muted-foreground">Witnesses</dt><dd>{investigation.witnesses.length ? investigation.witnesses.join(", ") : "Not recorded"}</dd>
              <dt className="text-muted-foreground">Location</dt><dd>{recorded(investigation.lastKnownLocation)}</dd>
            </dl>
            <div className="mt-3 border-t border-border/60 pt-2.5">
              <p className="label-xs">Evidence, CCTV and timeline records</p>
              {investigation.evidence.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">No associated records are available.</p>
              ) : (
                <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                  {investigation.evidence.map((evidence) => (
                    <li key={`${evidence.recordKind ?? "evidence"}-${evidence.id}`} className="rounded border border-border/60 px-2 py-1.5 text-[11px]">
                      <span className="font-medium text-foreground">{evidence.label}</span>
                      <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{evidence.recordKind ?? "evidence"}</span>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{evidence.locationName || "Location not recorded"} · {new Date(evidence.timestamp).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
