import { AlertTriangle } from "lucide-react";

import { Chip, SectionTitle } from "@/components/caselink/bits";
import type { Investigation } from "@/lib/caselink/types";
import type { BoardConnection } from "./board.types";
import type { SelectedBoardNote } from "./evidence-notes";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolvedSource(source: string, cases: Investigation[]): string {
  if (!UUID_PATTERN.test(source)) return source;
  const investigation = cases.find((item) => item.id === source);
  if (investigation) return `${investigation.code} · ${investigation.title}`;
  for (const item of cases) {
    const evidence = item.evidence.find((record) => record.id === source);
    if (evidence) return `${item.code} · ${evidence.label}`;
  }
  return "Referenced record unavailable";
}

export function ConnectionDetailsPanel({
  connection,
  cases,
  selectedFactorId,
  selectedNote,
}: {
  connection: BoardConnection | null;
  cases: Investigation[];
  selectedFactorId: string | null;
  selectedNote: SelectedBoardNote | null;
}) {
  const caseMap = new Map(cases.map((investigation) => [investigation.id, investigation]));
  const a = connection ? caseMap.get(connection.case_a_id) : undefined;
  const b = connection ? caseMap.get(connection.case_b_id) : undefined;
  const selectedFactor = connection?.factors.find((factor) => factor.id === selectedFactorId) ?? null;
  const noteCase = selectedNote ? caseMap.get(selectedNote.caseId) : undefined;

  return (
    <section className="panel overflow-hidden">
      <SectionTitle right={connection && !selectedNote ? <Chip tone="danger">{connection.score.toFixed(1)}%</Chip> : null}>{selectedNote ? "Evidence Details" : "Connection Details"}</SectionTitle>
      {selectedNote ? (
        <div className="space-y-3 p-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-cyan">{noteCase?.code ?? "Referenced record unavailable"}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{noteCase?.title ?? "Referenced record unavailable"}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-surface-2/40 p-3">
            <p className="label-xs">{selectedNote.note.category}</p>
            <p className="mt-1 text-[12px] font-medium text-foreground">{selectedNote.note.title}</p>
            <ul className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-muted-foreground">
              {selectedNote.note.details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          </div>
        </div>
      ) : !connection ? (
        <p className="p-4 text-[12px] text-muted-foreground">Select a red connection or a structured connection entry to inspect its stored analysis.</p>
      ) : (
        <div className="space-y-4 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {a?.code ?? "Referenced record unavailable"} ↔ {b?.code ?? "Referenced record unavailable"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {a?.title ?? "Referenced record unavailable"} · {b?.title ?? "Referenced record unavailable"}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[11px]">
            <div><dt className="label-xs">Connection</dt><dd className="mt-1 text-foreground">{connection.score.toFixed(1)}%</dd></div>
            <div><dt className="label-xs">Classification</dt><dd className="mt-1 text-foreground">{connection.classification}</dd></div>
          </dl>
          {selectedFactor ? (
            <div className="rounded-md border border-danger/40 bg-danger/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="label-xs text-danger">Selected matching factor · {selectedFactor.factor}</p>
                <span className="font-mono text-[11px] text-danger">{selectedFactor.similarity == null ? "Not scored" : `${Math.round(selectedFactor.similarity * 100)}%`}</span>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{selectedFactor.detail || "No factor detail was stored."}</p>
              <p className="mt-2 label-xs">Supporting sources</p>
              {selectedFactor.sources.length ? <div className="mt-1.5 flex flex-wrap gap-1.5">{selectedFactor.sources.map((source, index) => <Chip key={`${selectedFactor.id}-selected-${index}`}>{resolvedSource(source, cases)}</Chip>)}</div> : <p className="mt-1 text-[11px] text-muted-foreground">No supporting sources were stored.</p>}
              <p className="mt-2 label-xs text-amber">Data gaps</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{selectedFactor.insufficient_data ? selectedFactor.detail || "Required data is unavailable." : "No data gap was recorded for this factor."}</p>
            </div>
          ) : null}
          <div>
            <p className="label-xs">Matching-engine explanation</p>
            <p className="mt-1.5 rounded-md border border-border/70 bg-surface-2/40 p-3 text-[11.5px] leading-relaxed text-muted-foreground">{connection.explanation || "No matching-engine explanation was stored."}</p>
          </div>
          <div>
            <p className="label-xs">Real connection factors</p>
            <div className="mt-2 space-y-2">
              {connection.factors.length === 0 ? <p className="text-[11px] text-muted-foreground">No factor records are available.</p> : connection.factors.map((factor) => (
                <article key={factor.id} className="rounded-md border border-border/70 bg-surface-2/30 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11.5px] font-medium text-foreground">{factor.factor}</p>
                    <span className="font-mono text-[10px] text-cyan">{factor.similarity == null ? "Not scored" : `${Math.round(factor.similarity * 100)}%`} · weight {Math.round(factor.weight * 100)}%</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{factor.detail || "No factor detail was stored."}</p>
                  {factor.sources.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Sources for ${factor.factor}`}>
                      {factor.sources.map((source, index) => <Chip key={`${factor.id}-${index}`}>{resolvedSource(source, cases)}</Chip>)}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
          <div>
            <p className="label-xs text-amber">Missing information</p>
            {connection.factors.some((factor) => factor.insufficient_data) ? (
              <ul className="mt-2 space-y-1.5">
                {connection.factors.filter((factor) => factor.insufficient_data).map((factor) => (
                  <li key={factor.id} className="flex items-start gap-1.5 text-[11px] text-amber"><AlertTriangle className="mt-0.5 size-3 shrink-0" /> {factor.factor}: {factor.detail || "Required data is unavailable."}</li>
                ))}
              </ul>
            ) : <p className="mt-1.5 text-[11px] text-muted-foreground">No data gaps were recorded for this connection.</p>}
          </div>
          <div className="rounded-md border border-border/70 p-3">
            <p className="label-xs">Investigator verdict</p>
            <p className="mt-1.5 font-mono text-[11px] uppercase text-foreground">{connection.verdict}</p>
            {connection.verified_by_name ? <p className="mt-1 text-[11px] text-muted-foreground">Recorded by {connection.verified_by_name}{connection.verified_at ? ` · ${new Date(connection.verified_at).toLocaleString()}` : ""}</p> : null}
            {connection.verdict_reason ? <p className="mt-1 text-[11px] text-muted-foreground">{connection.verdict_reason}</p> : null}
          </div>
        </div>
      )}
    </section>
  );
}
