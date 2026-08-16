/**
 * CASELINK INVESTIGATOR ASSISTANT + "WHAT IF?" MODE (modules 7 & 13)
 *
 * Purpose: answer investigator questions in plain language over the authorized
 * corpus already loaded in the client store — no external model, fully
 * explainable, and every answer cites the case and evidence IDs it used.
 *
 * Logic: the question is normalised, matched against a small intent table
 * (MO / geography / time / vehicle / device / compare / summarise / evidence),
 * then the corresponding deterministic query runs against the corpus.
 *
 * Data flow: question -> intent + params -> corpus query -> AnswerBlock with citations.
 */
import { compareCases, haversineKm, norm, phones, plates, tokens } from "./matching";
import type { CaseLink, Investigation } from "./types";

export interface AnswerRow {
  title: string;
  detail: string;
  cites: string[];
  score?: number;
}

export interface Answer {
  intent: string;
  headline: string;
  reasoning: string;
  rows: AnswerRow[];
  caseCites: string[];
  evidenceCites: string[];
}

export const PRESET_QUERIES = [
  "Show cases with a similar modus operandi",
  "Show related cases within 100 km",
  "Show cases occurring within a similar time window",
  "Show recurring vehicles",
  "Show evidence shared across cases",
  "Find cases that may belong to the same criminal pattern",
  "Summarize the common characteristics across these cases",
] as const;

const uniq = <T,>(x: T[]) => Array.from(new Set(x));

function distanceKm(a: Investigation, b: Investigation): number {
  let best = Infinity;
  for (const eA of a.evidence)
    for (const eB of b.evidence) best = Math.min(best, haversineKm(eA.lat, eA.lng, eB.lat, eB.lng));
  return best;
}

export function askAssistant(
  question: string,
  cases: Investigation[],
  links: CaseLink[],
): Answer {
  const q = norm(question);
  const rows: AnswerRow[] = [];
  const caseCites: string[] = [];
  const evidenceCites: string[] = [];

  const mentioned = cases.filter((c) => q.includes(norm(c.code)) || q.includes(norm(c.id)));

  /* --- WHY is X related to Y? ---------------------------------------- */
  if (q.includes("why") && mentioned.length >= 2) {
    const [a, b] = [mentioned[0]!, mentioned[1]!];
    const r = compareCases(a, b);
    for (const reason of r.reasons)
      rows.push({ title: reason.factor, detail: reason.detail, cites: [a.id, b.id], score: reason.weight });
    caseCites.push(a.id, b.id);
    evidenceCites.push(...r.sharedEvidenceIds);
    return {
      intent: "Explain a proposed relationship",
      headline: `${a.code} and ${b.code} — ${r.confidence}% correlation across ${r.reasons.length} independent signals`,
      reasoning:
        `Each row below is one independently derived indicator with the weight it contributed. ` +
        `No single indicator establishes a relationship; the lead exists because several agree. ` +
        `Run Double Verify before relying on it.`,
      rows,
      caseCites: uniq(caseCites),
      evidenceCites: uniq(evidenceCites),
    };
  }

  /* --- connections between named cases ------------------------------- */
  if (mentioned.length >= 2 && (q.includes("connection") || q.includes("compare") || q.includes("between"))) {
    for (let i = 0; i < mentioned.length; i++)
      for (let j = i + 1; j < mentioned.length; j++) {
        const a = mentioned[i]!;
        const b = mentioned[j]!;
        const r = compareCases(a, b);
        rows.push({
          title: `${a.code} ↔ ${b.code}`,
          detail: r.reasons.length
            ? `${r.reasons.length} signals: ${r.reasons.map((x) => x.factor.toLowerCase()).join(", ")}.`
            : "No shared indicators detected between these files.",
          cites: [a.id, b.id],
          score: r.confidence,
        });
        caseCites.push(a.id, b.id);
        evidenceCites.push(...r.sharedEvidenceIds);
      }
    return {
      intent: "Compare specific cases",
      headline: `Pairwise comparison of ${mentioned.length} selected files`,
      reasoning: "Every pair was scored independently using the full multi-dimensional comparison.",
      rows,
      caseCites: uniq(caseCites),
      evidenceCites: uniq(evidenceCites),
    };
  }

  /* --- similar modus operandi / entry method ------------------------- */
  if (q.includes("modus") || q.includes("entry") || q.includes("method") || q.includes("pattern")) {
    for (const l of links) {
      const a = cases.find((c) => c.id === l.aId);
      const b = cases.find((c) => c.id === l.bId);
      const mo = l.reasons.find((r) => r.factor.startsWith("Behavioural") || r.factor.startsWith("Weapon"));
      if (!a || !b || !mo) continue;
      rows.push({ title: `${a.code} ↔ ${b.code}`, detail: mo.detail, cites: [a.id, b.id], score: l.confidence });
      caseCites.push(a.id, b.id);
      evidenceCites.push(...l.sharedEvidenceIds);
    }
    return {
      intent: "Modus operandi similarity",
      headline: rows.length
        ? `${rows.length} file pair(s) share behavioural or tool patterns`
        : "No behavioural overlap above threshold",
      reasoning:
        "Descriptions are normalised into concept tokens first, so 'entered through rear window' and " +
        "'forced open rear window' are treated as related rather than as different strings.",
      rows: rows.sort((x, y) => (y.score ?? 0) - (x.score ?? 0)),
      caseCites: uniq(caseCites),
      evidenceCites: uniq(evidenceCites),
    };
  }

  /* --- geography ------------------------------------------------------ */
  if (q.includes("km") || q.includes("near") || q.includes("geograph") || q.includes("distance") || q.includes("cluster")) {
    const radius = Number(q.match(/(\d+)\s*km/)?.[1] ?? 100);
    for (let i = 0; i < cases.length; i++)
      for (let j = i + 1; j < cases.length; j++) {
        const a = cases[i]!;
        const b = cases[j]!;
        const d = distanceKm(a, b);
        if (d > radius) continue;
        rows.push({
          title: `${a.code} ↔ ${b.code}`,
          detail: `Nearest evidence points ${d.toFixed(2)} km apart (${a.district} / ${b.district}).`,
          cites: [a.id, b.id],
          score: Math.round(Math.max(0, 100 - d * 4)),
        });
        caseCites.push(a.id, b.id);
      }
    return {
      intent: `Geographic proximity within ${radius} km`,
      headline: `${rows.length} pair(s) fall inside a ${radius} km radius`,
      reasoning: "Great-circle distance is computed between every pair of geo-tagged evidence records.",
      rows: rows.sort((x, y) => (y.score ?? 0) - (x.score ?? 0)),
      caseCites: uniq(caseCites),
      evidenceCites: [],
    };
  }

  /* --- temporal ------------------------------------------------------- */
  if (q.includes("time") || q.includes("hour") || q.includes("night") || q.includes("window") || q.includes("date")) {
    for (let i = 0; i < cases.length; i++)
      for (let j = i + 1; j < cases.length; j++) {
        const a = cases[i]!;
        const b = cases[j]!;
        let gap = Infinity;
        for (const eA of a.evidence)
          for (const eB of b.evidence)
            gap = Math.min(gap, Math.abs(+new Date(eA.timestamp) - +new Date(eB.timestamp)));
        const h = gap / 36e5;
        if (h > 96) continue;
        rows.push({
          title: `${a.code} ↔ ${b.code}`,
          detail: `Activity windows converge within ${h < 1 ? `${Math.round(h * 60)} minutes` : `${h.toFixed(1)} hours`}. Time-of-day alone is weak corroboration.`,
          cites: [a.id, b.id],
          score: Math.round(Math.max(0, 100 - h)),
        });
        caseCites.push(a.id, b.id);
      }
    return {
      intent: "Temporal similarity",
      headline: `${rows.length} pair(s) with converging activity windows`,
      reasoning: "Evidence time-stamps are compared pairwise; only windows under 96 hours are returned.",
      rows: rows.sort((x, y) => (y.score ?? 0) - (x.score ?? 0)),
      caseCites: uniq(caseCites),
      evidenceCites: [],
    };
  }

  /* --- recurring vehicles / devices ---------------------------------- */
  if (q.includes("vehicle") || q.includes("suv") || q.includes("car") || q.includes("plate") || q.includes("device") || q.includes("phone")) {
    const wantDevice = q.includes("device") || q.includes("phone");
    const index = new Map<string, { cases: Set<string>; evidence: Set<string> }>();
    for (const c of cases) {
      const blob = [c.notes, c.subject.vehicle ?? "", c.subject.phone ?? "", ...c.evidence.map((e) => `${e.label} ${e.details}`)].join(" ");
      const ids = wantDevice ? phones(blob) : plates(blob);
      for (const id of ids) {
        const entry = index.get(id) ?? { cases: new Set<string>(), evidence: new Set<string>() };
        entry.cases.add(c.id);
        for (const e of c.evidence)
          if ((wantDevice ? phones(`${e.label} ${e.details}`) : plates(`${e.label} ${e.details}`)).includes(id))
            entry.evidence.add(e.id);
        index.set(id, entry);
      }
    }
    for (const [id, entry] of index) {
      if (entry.cases.size < 2) continue;
      rows.push({
        title: wantDevice ? `Device •••${id.slice(-5)}` : `Vehicle ${id}`,
        detail: `Appears in ${entry.cases.size} files: ${[...entry.cases].join(", ")}.`,
        cites: [...entry.cases, ...entry.evidence],
        score: 60 + entry.cases.size * 10,
      });
      caseCites.push(...entry.cases);
      evidenceCites.push(...entry.evidence);
    }
    return {
      intent: wantDevice ? "Recurring device identifiers" : "Recurring vehicle identifiers",
      headline: `${rows.length} identifier(s) recur across more than one file`,
      reasoning:
        "Identifiers are extracted from free-text evidence with pattern recognition, normalised, then indexed by case. " +
        "A recurring identifier is a strong indicator but still requires independent verification.",
      rows,
      caseCites: uniq(caseCites),
      evidenceCites: uniq(evidenceCites),
    };
  }

  /* --- shared evidence ------------------------------------------------ */
  if (q.includes("evidence") || q.includes("shared") || q.includes("source")) {
    for (const l of links) {
      if (!l.sharedEvidenceIds.length) continue;
      const a = cases.find((c) => c.id === l.aId);
      const b = cases.find((c) => c.id === l.bId);
      if (!a || !b) continue;
      rows.push({
        title: `${a.code} ↔ ${b.code}`,
        detail: `${l.sharedEvidenceIds.length} evidence record(s) participate in this link: ${l.sharedEvidenceIds.join(", ")}.`,
        cites: [a.id, b.id, ...l.sharedEvidenceIds],
        score: l.confidence,
      });
      caseCites.push(a.id, b.id);
      evidenceCites.push(...l.sharedEvidenceIds);
    }
    return {
      intent: "Evidence shared across cases",
      headline: `${rows.length} link(s) rest on traceable shared evidence`,
      reasoning: "Only links whose evidence chain resolves to concrete records are listed.",
      rows: rows.sort((x, y) => (y.score ?? 0) - (x.score ?? 0)),
      caseCites: uniq(caseCites),
      evidenceCites: uniq(evidenceCites),
    };
  }

  /* --- summarise common characteristics ------------------------------ */
  if (q.includes("summar") || q.includes("common") || q.includes("characteristic")) {
    const pool = mentioned.length ? mentioned : cases;
    const freq = new Map<string, number>();
    for (const c of pool)
      for (const t of uniq(tokens(`${c.notes} ${c.modusOperandi ?? ""} ${c.evidence.map((e) => e.keywords.join(" ")).join(" ")}`)))
        freq.set(t, (freq.get(t) ?? 0) + 1);
    const top = [...freq.entries()].filter(([, n]) => n > 1).sort((x, y) => y[1] - x[1]).slice(0, 10);
    for (const [t, n] of top)
      rows.push({ title: `"${t}"`, detail: `Recurs in ${n} of ${pool.length} files.`, cites: pool.map((c) => c.id), score: n * 12 });
    return {
      intent: "Summarise common characteristics",
      headline: `${top.length} descriptors recur across ${pool.length} file(s)`,
      reasoning: "Descriptor frequency is computed over normalised concept tokens, stop-words removed.",
      rows,
      caseCites: pool.map((c) => c.id),
      evidenceCites: [],
    };
  }

  /* --- fallback: strongest leads ------------------------------------- */
  for (const l of links.slice(0, 8)) {
    const a = cases.find((c) => c.id === l.aId);
    const b = cases.find((c) => c.id === l.bId);
    if (!a || !b) continue;
    rows.push({
      title: `${a.code} ↔ ${b.code}`,
      detail: `${l.reasons.length} correlated indicators: ${l.reasons.map((r) => r.factor.toLowerCase()).slice(0, 4).join(", ")}.`,
      cites: [a.id, b.id, ...l.sharedEvidenceIds],
      score: l.confidence,
    });
    caseCites.push(a.id, b.id);
  }
  return {
    intent: "Strongest current leads",
    headline: "I could not match a specific intent, so here are the strongest leads in the corpus",
    reasoning:
      "Try phrasing such as 'similar modus operandi', 'within 50 km', 'similar time window', " +
      "'recurring vehicles', 'shared evidence', or 'why is CASE-… related to CASE-…'.",
    rows,
    caseCites: uniq(caseCites),
    evidenceCites: [],
  };
}
