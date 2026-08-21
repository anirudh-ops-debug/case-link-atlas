import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Investigation } from "@/lib/caselink/types";
import { AccessibleConnectionList } from "./AccessibleConnectionList";
import type { BoardConnection } from "./board.types";
import { CaseBoardCard } from "./CaseBoardCard";
import { EvidenceStickyNote } from "./EvidenceStickyNote";
import { buildCaseEvidenceNotes, factorNoteCategory, type EvidenceNoteCategory, type SelectedBoardNote } from "./evidence-notes";

interface Point { x: number; y: number }
interface StringPath { connection: BoardConnection; factor: BoardConnection["factors"][number]; category: EvidenceNoteCategory; path: string; label: Point }

function noteKey(caseId: string, category: EvidenceNoteCategory): string { return `${caseId}:${category}`; }

function mappedFactors(connection: BoardConnection): Array<{ factor: BoardConnection["factors"][number]; category: EvidenceNoteCategory }> {
  const strongest = new Map<EvidenceNoteCategory, BoardConnection["factors"][number]>();
  if (connection.score < 60) return [];
  connection.factors.forEach((factor) => {
    if (factor.insufficient_data || factor.similarity == null || factor.similarity <= 0) return;
    const category = factorNoteCategory(factor.factor);
    if (!category || (category === "Other Evidence" && factor.sources.length === 0)) return;
    const current = strongest.get(category);
    if (!current || factor.similarity! > current.similarity! || (factor.similarity === current.similarity && factor.weight > current.weight)) strongest.set(category, factor);
  });
  return [...strongest.entries()].map(([category, factor]) => ({ category, factor })).sort((a, b) => (b.factor.similarity! - a.factor.similarity!) || (b.factor.weight - a.factor.weight));
}

function anchorPoint(element: HTMLButtonElement, side: "left" | "right" | "top" | "bottom", board: DOMRect): Point | null {
  const anchor = element.querySelector<HTMLElement>(`[data-string-anchor="${side}"]`);
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - board.left, y: rect.top + rect.height / 2 - board.top };
}

function facingAnchors(source: HTMLButtonElement, target: HTMLButtonElement, board: DOMRect): { start: Point; end: Point } | null {
  const a = source.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { start: anchorPoint(source, "right", board)!, end: anchorPoint(target, "left", board)! } : { start: anchorPoint(source, "left", board)!, end: anchorPoint(target, "right", board)! };
  return dy >= 0 ? { start: anchorPoint(source, "bottom", board)!, end: anchorPoint(target, "top", board)! } : { start: anchorPoint(source, "top", board)!, end: anchorPoint(target, "bottom", board)! };
}

function curve(start: Point, end: Point, variation: number): { path: string; label: Point } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / distance, y: dx / distance };
  const bend = Math.min(34, distance * 0.12) * variation;
  const c1 = { x: start.x + dx * 0.35 + normal.x * bend, y: start.y + dy * 0.35 + normal.y * bend };
  const c2 = { x: start.x + dx * 0.65 + normal.x * bend, y: start.y + dy * 0.65 + normal.y * bend };
  return { path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2 + normal.x * bend * 0.7, y: (start.y + end.y) / 2 + normal.y * bend * 0.7 } };
}

export function InvestigationBoard({ cases, connections, selectedCaseId, selectedConnectionId, selectedFactorId, selectedNote, onSelectCase, onSelectConnection, onSelectFactor, onSelectNote }: {
  cases: Investigation[]; connections: BoardConnection[]; selectedCaseId: string; selectedConnectionId: string | null; selectedFactorId: string | null; selectedNote: SelectedBoardNote | null;
  onSelectCase: (caseId: string) => void; onSelectConnection: (connectionId: string) => void; onSelectFactor: (connectionId: string, factorId: string) => void; onSelectNote: (selection: SelectedBoardNote) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef(new Map<string, HTMLButtonElement>());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const caseMap = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);
  const notesByCase = useMemo(() => new Map(cases.map((item) => [item.id, buildCaseEvidenceNotes(item).filter((note) => note.recorded)])), [cases]);
  const selectedConnection = connections.find((item) => item.id === selectedConnectionId) ?? connections[0] ?? null;
  const focusedIds = selectedConnection ? [selectedConnection.case_a_id, selectedConnection.case_b_id] : cases.slice(0, 1).map((item) => item.id);
  const focusedCases = focusedIds.map((id) => caseMap.get(id)).filter((item): item is Investigation => item != null);
  const additionalCases = cases.filter((item) => !focusedIds.includes(item.id));
  const selectedMatches = selectedConnection ? mappedFactors(selectedConnection).filter(({ category }) => focusedIds.every((id) => notesByCase.get(id)?.some((note) => note.category === category))) : [];
  const matchedCategories = new Set(selectedMatches.map(({ category }) => category));

  useLayoutEffect(() => {
    const board = boardRef.current;
    const viewport = viewportRef.current;
    if (!board || !viewport) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setLayoutVersion((version) => version + 1)); };
    const observer = new ResizeObserver(schedule);
    observer.observe(board);
    noteRefs.current.forEach((element) => observer.observe(element));
    viewport.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); viewport.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [cases, notesByCase, selectedConnectionId]);

  const strings = useMemo<StringPath[]>(() => {
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) return [];
    let index = 0;
    return connections.flatMap((connection) => mappedFactors(connection).flatMap(({ factor, category }) => {
      const source = noteRefs.current.get(noteKey(connection.case_a_id, category));
      const target = noteRefs.current.get(noteKey(connection.case_b_id, category));
      if (!source || !target) return [];
      const anchors = facingAnchors(source, target, board);
      if (!anchors) return [];
      const variation = (index++ % 2 ? -1 : 1) * (0.45 + (index % 3) * 0.18);
      return [{ connection, factor, category, ...curve(anchors.start, anchors.end, variation) }];
    }));
  }, [connections, layoutVersion]);

  const renderNote = (investigation: Investigation, category: EvidenceNoteCategory, contextLabel?: string) => {
    const note = notesByCase.get(investigation.id)?.find((item) => item.category === category);
    if (!note) return null;
    return <EvidenceStickyNote key={category} ref={(element) => { const key = noteKey(investigation.id, category); if (element) noteRefs.current.set(key, element); else noteRefs.current.delete(key); }} note={note} selected={selectedNote?.caseId === investigation.id && selectedNote.note.category === category} onSelect={() => onSelectNote({ caseId: investigation.id, note })} rotation={0} contextLabel={contextLabel} />;
  };
  const orderedAdditionalNotes = (caseId: string) => {
    const ranks = new Map<EvidenceNoteCategory, { similarity: number; weight: number }>();
    connections.filter((connection) => (connection.case_a_id === caseId && focusedIds.includes(connection.case_b_id)) || (connection.case_b_id === caseId && focusedIds.includes(connection.case_a_id))).forEach((connection) => mappedFactors(connection).forEach(({ category, factor }) => {
      const current = ranks.get(category);
      if (!current || factor.similarity! > current.similarity || (factor.similarity === current.similarity && factor.weight > current.weight)) ranks.set(category, { similarity: factor.similarity!, weight: factor.weight });
    }));
    return [...(notesByCase.get(caseId) ?? [])].sort((a, b) => {
      const rankA = ranks.get(a.category);
      const rankB = ranks.get(b.category);
      if (!rankA && !rankB) return 0;
      if (!rankA) return 1;
      if (!rankB) return -1;
      return (rankB.similarity - rankA.similarity) || (rankB.weight - rankA.weight);
    }).map((note) => ({ note, matched: ranks.has(note.category) }));
  };

  return (
    <section className="panel overflow-hidden" aria-label="Focused multiple-case investigation board">
      <div ref={viewportRef} className="overflow-auto">
        <div ref={boardRef} className="relative min-h-[360px] w-full min-w-[320px] border-[10px] border-[#4a2e18] bg-[#9a6034] p-5 shadow-inner md:p-8" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,225,170,.16) 0 1px, transparent 1.8px), radial-gradient(circle at 75% 65%, rgba(65,31,12,.18) 0 1px, transparent 2px), linear-gradient(115deg, rgba(255,255,255,.05), rgba(70,31,8,.13))", backgroundSize: "17px 19px, 23px 21px, 100% 100%" }}>
          <svg className="pointer-events-none absolute inset-0 z-30 size-full overflow-visible" aria-label="Evidence-factor connection strings">
            <defs><filter id="string-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1" dy="2" stdDeviation="1.2" floodColor="#3a100d" floodOpacity="0.45" /></filter></defs>
            {strings.map(({ connection, factor, category, path, label }) => {
              const selectedPair = connection.id === selectedConnection?.id;
              const selected = selectedPair && selectedFactorId === factor.id;
              const select = () => onSelectFactor(connection.id, factor.id);
              return <g key={`${connection.id}-${factor.id}`} role="button" tabIndex={0} aria-label={`${category} match for ${caseMap.get(connection.case_a_id)?.code ?? "unavailable case"} and ${caseMap.get(connection.case_b_id)?.code ?? "unavailable case"}`} onClick={select} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }} className="pointer-events-auto cursor-pointer focus:outline-none" opacity={selectedPair ? 1 : 0.24}>
                <path d={path} fill="none" stroke="#44110f" strokeWidth={selected ? 5 : 3} opacity="0.35" filter="url(#string-shadow)" /><path d={path} fill="none" stroke="#b51f24" strokeWidth={selected ? 3 : 2} /><path d={path} fill="none" stroke="transparent" strokeWidth="18" />
                {selected ? <g transform={`translate(${label.x} ${label.y})`}><rect x="-25" y="-12" width="50" height="24" rx="3" fill="#ead9ad" stroke="#8b2523" /><text textAnchor="middle" y="4" fill="#6e1d1b" fontSize="10" fontWeight="bold">{Math.round(factor.similarity! * 100)}%</text></g> : null}
              </g>;
            })}
          </svg>

          {focusedCases.length === 2 && selectedConnection ? <div className="relative z-20 mx-auto max-w-[1100px]">
            <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-[minmax(260px,1fr)_90px_minmax(260px,1fr)] md:gap-4">
              <CaseBoardCard investigation={focusedCases[0]!} selected={selectedCaseId === focusedCases[0]!.id} onSelect={() => onSelectCase(focusedCases[0]!.id)} rotation={-1} />
              <button type="button" onClick={() => onSelectConnection(selectedConnection.id)} className="z-40 mx-auto rounded border border-[#8b5b32] bg-[#ead9ad] px-2 py-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-[#6e1d1b] shadow"><span className="block text-[8px]">Overall connection</span>{selectedConnection.score.toFixed(1)}%</button>
              <CaseBoardCard investigation={focusedCases[1]!} selected={selectedCaseId === focusedCases[1]!.id} onSelect={() => onSelectCase(focusedCases[1]!.id)} rotation={1} />
            </div>
            {selectedMatches.length ? <div className="mt-6 space-y-4">{selectedMatches.map(({ category }) => <div key={category} className="grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(220px,1fr)_56px_minmax(220px,1fr)] md:gap-3">{renderNote(focusedCases[0]!, category)}<span className="hidden text-center font-mono text-[8px] uppercase tracking-[0.08em] text-[#4e2d18] md:block">Match</span>{renderNote(focusedCases[1]!, category)}</div>)}</div> : null}
            <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
              {focusedCases.map((investigation) => { const remainder = (notesByCase.get(investigation.id) ?? []).filter((note) => !matchedCategories.has(note.category)); return <div key={`remainder-${investigation.id}`}>{remainder.length ? <><p className="mb-3 font-mono text-[8px] uppercase tracking-[0.1em] text-[#3f2819]">{investigation.code} · recorded evidence</p><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{remainder.map((note) => renderNote(investigation, note.category, "Recorded — not part of this connection"))}</div></> : null}</div>; })}
            </div>
          </div> : focusedCases.map((investigation) => <div key={investigation.id} className="relative z-20 mx-auto max-w-[520px]"><CaseBoardCard investigation={investigation} selected onSelect={() => onSelectCase(investigation.id)} /><div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">{(notesByCase.get(investigation.id) ?? []).map((note) => renderNote(investigation, note.category))}</div></div>)}

          {additionalCases.length ? <div className="relative z-20 mt-10 border-t border-[#5a351c]/40 pt-6"><p className="mb-4 font-mono text-[9px] uppercase tracking-[0.12em] text-[#3e2618]">Additional connected investigations</p><div className="grid grid-cols-1 gap-7 md:grid-cols-2 xl:grid-cols-3">{additionalCases.map((investigation, caseIndex) => <article key={investigation.id} className="space-y-4 rounded-lg border border-[#69401f]/35 bg-[#6f3f1a]/10 p-4"><CaseBoardCard investigation={investigation} selected={selectedCaseId === investigation.id} onSelect={() => onSelectCase(investigation.id)} rotation={([-1, 0, 1] as const)[caseIndex % 3]!} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{orderedAdditionalNotes(investigation.id).map(({ note, matched }) => renderNote(investigation, note.category, matched ? "Recorded — supports another stored connection" : "Recorded — not part of this connection"))}</div></article>)}</div></div> : null}
          {cases.length === 1 && connections.length === 0 ? <p className="relative z-20 mx-auto mt-6 w-fit rounded border border-[#7b5d3c]/50 bg-[#ead9ad] px-4 py-2 text-center text-[11px] text-[#57422d]">No connections reached the 60% threshold.</p> : null}
        </div>
      </div>
      <AccessibleConnectionList connections={connections} caseMap={caseMap} selectedConnectionId={selectedConnection?.id ?? null} onSelect={onSelectConnection} />
    </section>
  );
}
