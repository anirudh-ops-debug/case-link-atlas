import { forwardRef } from "react";

import type { CaseEvidenceNote } from "./evidence-notes";

const NOTE_COLORS: Record<CaseEvidenceNote["category"], string> = {
  "Modus Operandi": "bg-[#e8d59b] border-[#9b8247]", Vehicle: "bg-[#cfdcce] border-[#718b70]", Location: "bg-[#d7e2d0] border-[#758e68]", "Date and Time": "bg-[#d8d7e8] border-[#7d789a]", Weapon: "bg-[#e4cccc] border-[#9c6b6b]", "Person or Witness": "bg-[#ead7bd] border-[#9a7957]", CCTV: "bg-[#cbdbe1] border-[#668493]", "Other Evidence": "bg-[#e7ddc8] border-[#97866a]",
};

export const EvidenceStickyNote = forwardRef<HTMLButtonElement, { note: CaseEvidenceNote; selected: boolean; onSelect: () => void; rotation?: -1 | 0 | 1; contextLabel?: string | undefined }>(function EvidenceStickyNote({ note, selected, onSelect, rotation = 0, contextLabel }, ref) {
  return (
    <button ref={ref} type="button" onClick={onSelect} aria-pressed={selected} className={`relative z-40 min-h-[96px] w-full overflow-hidden border p-2.5 text-left text-[#30271d] shadow-[0_5px_12px_rgba(50,29,12,0.3)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan/70 ${NOTE_COLORS[note.category]} ${selected ? "ring-2 ring-cyan" : "hover:brightness-[1.03]"}`} style={{ transform: `rotate(${rotation}deg)` }}>
      <span className="absolute left-1/2 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#6d2727] bg-[#b63b38] shadow" aria-hidden="true" />
      <span data-string-anchor="left" className="absolute left-0 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#6d2727] bg-[#b63b38] shadow" aria-hidden="true" />
      <span data-string-anchor="right" className="absolute right-0 top-1/2 size-2 translate-x-1/2 -translate-y-1/2 rounded-full border border-[#6d2727] bg-[#b63b38] shadow" aria-hidden="true" />
      <span data-string-anchor="top" className="absolute left-1/2 top-0 size-1 -translate-x-1/2 -translate-y-1/2" aria-hidden="true" />
      <span data-string-anchor="bottom" className="absolute bottom-0 left-1/2 size-1 -translate-x-1/2 translate-y-1/2" aria-hidden="true" />
      <span className="block font-mono text-[8px] uppercase tracking-[0.12em] text-[#6b4b33]">{note.title}</span>
      <span className="mt-1 block space-y-0.5 font-serif text-[11px] leading-tight">{note.summary.map((line) => <span key={line} className="block">{line}</span>)}</span>
      {contextLabel ? <span className="mt-2 block border-t border-[#65513d]/20 pt-1 font-mono text-[7px] uppercase tracking-[0.08em] text-[#6b5743]">{contextLabel}</span> : null}
    </button>
  );
});
