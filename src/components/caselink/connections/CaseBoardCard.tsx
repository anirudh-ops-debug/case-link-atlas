import { forwardRef } from "react";

import type { Investigation } from "@/lib/caselink/types";

export const CaseBoardCard = forwardRef<HTMLButtonElement, {
  investigation: Investigation;
  selected: boolean;
  onSelect: () => void;
  rotation?: -1 | 0 | 1;
}>(function CaseBoardCard({ investigation, selected, onSelect, rotation = 0 }, ref) {
  return (
    <button ref={ref} type="button" onClick={onSelect} aria-pressed={selected} className={"relative z-40 w-full rounded-sm border bg-[#d5b77d] p-3 text-left text-[#2d2115] shadow-[0_10px_25px_rgba(38,20,7,0.42)] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan/70 " + (selected ? "border-cyan ring-2 ring-cyan/50" : "border-[#76542e] hover:border-[#4b3018]")} style={{ transform: `rotate(${rotation}deg)` }}>
      <span className="absolute left-1/2 top-0 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#792929] bg-[#c94a42] shadow-[0_2px_4px_rgba(0,0,0,0.55)]" aria-hidden="true"><span className="absolute left-1 top-0.5 size-1 rounded-full bg-white/50" /></span>
      <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#7b281f]">Case file · {investigation.code}</span>
      <span className="mt-1 block border-b border-[#785731]/35 pb-1.5 font-serif text-[14px] font-bold leading-snug text-[#2d2115]">{investigation.title}</span>
      <span className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[10px] leading-tight text-[#654b31]">
        <span>Subject</span><span className="font-medium text-[#2d2115]">{investigation.subject.name || "Not recorded"}</span>
        <span>Location</span><span className="font-medium text-[#2d2115]">{investigation.lastKnownLocation || "Not recorded"}</span>
        <span>Status</span><span className="font-medium text-[#2d2115]">{investigation.status}</span>
        <span>Investigator</span><span className="font-medium text-[#2d2115]">{investigation.officer || "Not assigned"}</span>
      </span>
    </button>
  );
});
