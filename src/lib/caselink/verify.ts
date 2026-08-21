/**
 * DOUBLE VERIFY (module 8)
 *
 * Purpose: after the matching engine proposes a link, run an *independent*
 * second pass that re-derives each dimension from the raw evidence records
 * rather than from the link's own score. Every check is labelled with the
 * layer it belongs to so an AI inference is never displayed as fact.
 *
 * Data flow: Investigation A + Investigation B  ->  checks[]  ->  verdict banner.
 */
import { haversineKm, norm, phones, plates, tokens } from "./matching";
import type { CaseLink, Investigation, VerifyCheck } from "./types";

const STRENGTH_SCORE = { Weak: 8, Moderate: 18, Stronger: 26, Strong: 34 } as const;

function evidenceIds(c: Investigation, pred: (t: string) => boolean): string[] {
  return c.evidence
    .filter((e) => pred(`${e.label} ${e.source} ${e.details} ${e.keywords.join(" ")}`))
    .map((e) => e.id);
}

export interface DoubleVerifyResult {
  checks: VerifyCheck[];
  supported: number;
  strength: "LOW" | "MODERATE" | "HIGH";
  score: number;
  summary: string;
}

export function doubleVerify(
  link: CaseLink,
  a: Investigation,
  b: Investigation,
): DoubleVerifyResult {
  const checks: VerifyCheck[] = [];
  const corpus = (c: Investigation) =>
    [c.notes, c.modusOperandi ?? "", c.weapon ?? "", c.subject.vehicle ?? "", c.subject.phone ?? "",
      ...c.evidence.map((e) => `${e.label} ${e.source} ${e.details} ${e.keywords.join(" ")}`)].join(" ");

  /* 1. Independent timeline re-check ------------------------------------ */
  const stamps = (c: Investigation) => c.evidence.map((e) => +new Date(e.timestamp));
  let gap = Infinity;
  for (const x of stamps(a)) for (const y of stamps(b)) gap = Math.min(gap, Math.abs(x - y));
  const gapH = gap / 36e5;
  const hourA = new Date(a.incidentDate).getUTCHours();
  const hourB = new Date(b.incidentDate).getUTCHours();
  const sameWindow = Math.abs(hourA - hourB) <= 2;
  checks.push({
    id: "timeline",
    label: "Timeline comparison",
    layer: "DIRECT EVIDENCE",
    status: gapH <= 48 ? "SUPPORTED" : sameWindow ? "PARTIAL" : "UNSUPPORTED",
    strength: gapH <= 6 ? "Stronger" : sameWindow ? "Moderate" : "Weak",
    detail:
      `Closest independently time-stamped records are ${gapH < 1 ? `${Math.round(gapH * 60)} min` : `${gapH.toFixed(1)} h`} apart. ` +
      `Time-of-day pattern ${sameWindow ? `matches (${hourA}:00 vs ${hourB}:00 window)` : "differs materially"}. ` +
      `Time-of-day alone is weak corroboration.`,
    sources: [...a.evidence.slice(0, 2), ...b.evidence.slice(0, 2)].map((e) => e.id),
  });

  /* 2. Independent geographic re-check --------------------------------- */
  let km = Infinity;
  const pair: string[] = [];
  for (const eA of a.evidence)
    for (const eB of b.evidence) {
      if (eA.lat == null || eA.lng == null || eB.lat == null || eB.lng == null) continue;
      const d = haversineKm(eA.lat, eA.lng, eB.lat, eB.lng);
      if (d < km) {
        km = d;
        pair.length = 0;
        pair.push(eA.id, eB.id);
      }
    }
  checks.push({
    id: "geography",
    label: "Geographic comparison",
    layer: "DIRECT EVIDENCE",
    status: km <= 6 ? "SUPPORTED" : km <= 25 ? "PARTIAL" : "UNSUPPORTED",
    strength: km <= 1 ? "Stronger" : km <= 6 ? "Moderate" : "Weak",
    detail:
      `Nearest evidence points are ${Number.isFinite(km) ? `${km.toFixed(2)} km` : "n/a"} apart` +
      `${a.district === b.district ? `, both inside ${a.district}` : `, across ${a.district} and ${b.district}`}.`,
    sources: pair,
  });

  /* 3. Modus operandi re-check (concept overlap, not string equality) --- */
  const mA = new Set(tokens(`${a.modusOperandi ?? ""} ${a.notes}`));
  const mB = new Set(tokens(`${b.modusOperandi ?? ""} ${b.notes}`));
  const moShared = [...mA].filter((t) => mB.has(t));
  checks.push({
    id: "mo",
    label: "Modus operandi comparison",
    layer: "AI INFERENCE",
    status: moShared.length >= 3 ? "SUPPORTED" : moShared.length ? "PARTIAL" : "UNSUPPORTED",
    strength: moShared.length >= 5 ? "Stronger" : moShared.length >= 2 ? "Moderate" : "Weak",
    detail: moShared.length
      ? `${moShared.length} normalised behavioural descriptors recur: ${moShared.slice(0, 8).join(", ")}. Derived by normalisation, not literal text match.`
      : "No recurring behavioural descriptors after normalisation.",
    sources: [...evidenceIds(a, () => true).slice(0, 1), ...evidenceIds(b, () => true).slice(0, 1)],
  });

  /* 4. Hard identifiers — the only genuinely strong indicator ----------- */
  const pShared = plates(corpus(a)).filter((p) => plates(corpus(b)).includes(p));
  const hShared = phones(corpus(a)).filter((p) => phones(corpus(b)).includes(p));
  const idShared = [...pShared, ...hShared.map((h) => `•••${h.slice(-5)}`)];
  checks.push({
    id: "identifiers",
    label: "Independent identifier match",
    layer: "DIRECT EVIDENCE",
    status: idShared.length ? "SUPPORTED" : "UNSUPPORTED",
    strength: idShared.length ? "Strong" : "Weak",
    detail: idShared.length
      ? `Recurring vehicle or device identifiers recorded separately in both files: ${idShared.join(", ")}.`
      : "No vehicle or device identifier appears in both files. The lead rests on softer indicators only.",
    sources: [
      ...evidenceIds(a, (t) => pShared.some((p) => norm(t).includes(norm(p))) || hShared.some((h) => t.includes(h.slice(-5)))),
      ...evidenceIds(b, (t) => pShared.some((p) => norm(t).includes(norm(p))) || hShared.some((h) => t.includes(h.slice(-5)))),
    ],
  });

  /* 5. Supporting records: witnesses and shared sources ---------------- */
  const wShared = a.witnesses.filter((w) => b.witnesses.some((x) => norm(x) === norm(w)));
  const srcShared = a.evidence
    .filter((eA) => b.evidence.some((eB) => norm(eB.source) === norm(eA.source)))
    .map((e) => e.id);
  checks.push({
    id: "records",
    label: "Supporting record comparison",
    layer: "DIRECT EVIDENCE",
    status: wShared.length || srcShared.length ? "SUPPORTED" : "UNSUPPORTED",
    strength: srcShared.length ? "Strong" : wShared.length ? "Stronger" : "Weak",
    detail:
      (wShared.length ? `Shared witness statement(s): ${wShared.join(", ")}. ` : "") +
      (srcShared.length ? `${srcShared.length} evidence record(s) originate from the same source system.` : "") ||
      "No witness or source-system overlap found.",
    sources: srcShared,
  });

  const supported = checks.filter((c) => c.status === "SUPPORTED").length;
  const score = checks.reduce(
    (s, c) => s + (c.status === "SUPPORTED" ? STRENGTH_SCORE[c.strength] : c.status === "PARTIAL" ? STRENGTH_SCORE[c.strength] / 2 : 0),
    0,
  );
  const strength = supported >= 4 || score >= 80 ? "HIGH" : supported >= 2 ? "MODERATE" : "LOW";

  return {
    checks,
    supported,
    strength,
    score: Math.round(score),
    summary:
      `${strength}-strength investigative lead based on ${supported} independently corroborated indicator(s) ` +
      `out of ${checks.length} checked (${link.aId} ↔ ${link.bId}). ` +
      `${idShared.length ? "At least one hard identifier recurs, which materially raises the lead strength." : "No hard identifier recurs, so this remains a similarity-level lead only."} ` +
      `Strength describes evidentiary support for further enquiry — it is not a statement about any person's culpability.`,
  };
}

/* EVIDENCE CHAIN (module 5) — a traceable path from case to case. */
export interface ChainStep {
  label: string;
  kind: "case" | "evidence" | "attribute" | "inference";
  ref?: string;
}

export function evidenceChain(link: CaseLink, a: Investigation, b: Investigation): ChainStep[] {
  const eA = a.evidence.find((e) => link.sharedEvidenceIds.includes(e.id)) ?? a.evidence[0];
  const eB = b.evidence.find((e) => link.sharedEvidenceIds.includes(e.id) && e.id !== eA?.id) ?? b.evidence[0];
  const attr = link.sharedAttributes[0] ?? link.reasons[0]?.factor ?? "shared descriptor";
  const steps: ChainStep[] = [{ label: `${a.code} · ${a.title}`, kind: "case", ref: a.id }];
  if (eA) steps.push({ label: `${eA.type} · ${eA.label}`, kind: "evidence", ref: eA.id });
  steps.push({ label: attr, kind: "attribute" });
  if (eA) steps.push({ label: `recorded ${new Date(eA.timestamp).toUTCString().slice(17, 22)} at ${eA.locationName}`, kind: "attribute" });
  if (eB) steps.push({ label: `${eB.type} · ${eB.label} (${eB.locationName})`, kind: "evidence", ref: eB.id });
  steps.push({ label: `${b.code} · ${b.title}`, kind: "case", ref: b.id });
  steps.push({
    label: `CASELINK proposes a potential relationship (${link.confidence}% correlation, ${link.reasons.length} signals)`,
    kind: "inference",
  });
  return steps;
}
