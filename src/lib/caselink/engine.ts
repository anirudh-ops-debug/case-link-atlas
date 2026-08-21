/**
 * CASELINK weighted correlation engine (database corpus).
 *
 * Deterministic, explainable scoring. Weights are fixed by policy:
 *   Modus operandi 30% · Location 15% · Time 15% · Vehicle 15%
 *   Weapon 10% · Witness/person overlap 10% · Other identifiers 5%
 *
 * Every factor reports its own similarity, the weight it carries, the sources
 * it drew from and whether there was enough data to judge it at all. A factor
 * with insufficient data is excluded from the denominator instead of being
 * scored zero — the investigator sees the gap rather than a false negative.
 */

export const FACTOR_WEIGHTS = {
  "Modus operandi": 0.3,
  Location: 0.15,
  Time: 0.15,
  Vehicle: 0.15,
  Weapon: 0.1,
  "Witness / persons": 0.1,
  "Other identifiers": 0.05,
} as const;

export type FactorName = keyof typeof FACTOR_WEIGHTS;

export interface FactorResult {
  factor: FactorName;
  similarity: number | null; // 0..1, null when insufficient data
  weight: number;
  insufficientData: boolean;
  detail: string;
  sources: string[];
}

export type Classification =
  | "High Potential Connection"
  | "Moderate Potential Connection"
  | "Weak Potential Connection"
  | "Low Relevance";

export interface ScoredPair {
  caseAId: string;
  caseBId: string;
  score: number; // 0..100
  classification: Classification;
  explanation: string;
  factors: FactorResult[];
}

export interface CaseBundle {
  id: string;
  case_no: string;
  title: string;
  crime_type: string;
  description: string | null;
  occurred_at: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  modus_operandi: string[];
  tags: string[];
  notes: string | null;
  persons: { full_name: string; aliases: string[]; phone: string | null; descriptors: string[] }[];
  vehicles: { make_model: string | null; color: string | null; plate: string | null; plate_partial: string | null; vehicle_type: string | null }[];
  weapons: { weapon_type: string; description: string | null }[];
  witnesses: { name: string; descriptors: string[] }[];
  locations: { name: string; latitude: number | null; longitude: number | null }[];
}

const STOP = new Set([
  "the", "and", "for", "with", "from", "near", "that", "this", "were", "was",
  "into", "onto", "their", "not", "did", "reported", "subject", "seen", "last",
  "after", "before", "during", "same", "also", "been", "have", "has", "are",
  "outside", "inside", "around", "toward", "towards", "then", "than", "over",
  "when", "while", "which", "where", "who", "about", "against", "along", "case",
]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();

function tokenSet(parts: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const p of parts) {
    if (!p) continue;
    for (const t of norm(p).split(" ")) {
      if (t.length > 3 && !STOP.has(t)) out.add(t);
    }
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function overlap(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const t of a) if (b.has(t)) out.push(t);
  return out.sort();
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const plateKey = (v: CaseBundle["vehicles"][number]) =>
  (v.plate ?? v.plate_partial ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function coords(c: CaseBundle): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  if (c.latitude != null && c.longitude != null) out.push({ lat: c.latitude, lng: c.longitude });
  for (const l of c.locations) {
    if (l.latitude != null && l.longitude != null) out.push({ lat: l.latitude, lng: l.longitude });
  }
  return out;
}

function factorMO(a: CaseBundle, b: CaseBundle): FactorResult {
  const ta = tokenSet([...a.modus_operandi, ...a.tags, a.description, a.notes, a.crime_type]);
  const tb = tokenSet([...b.modus_operandi, ...b.tags, b.description, b.notes, b.crime_type]);
  if (ta.size < 2 || tb.size < 2) {
    return {
      factor: "Modus operandi",
      similarity: null,
      weight: FACTOR_WEIGHTS["Modus operandi"],
      insufficientData: true,
      detail: "Not enough narrative or MO tags recorded on one of the files to compare method.",
      sources: [],
    };
  }
  const shared = overlap(ta, tb);
  const exact = a.modus_operandi.filter((m) => b.modus_operandi.some((x) => norm(x) === norm(m)));
  const sim = Math.min(1, jaccard(ta, tb) * 1.6 + exact.length * 0.18);
  return {
    factor: "Modus operandi",
    similarity: sim,
    weight: FACTOR_WEIGHTS["Modus operandi"],
    insufficientData: false,
    detail: exact.length
      ? `Identical MO tags recorded on both files: ${exact.join(", ")}.`
      : shared.length
        ? `Method language overlaps on ${shared.slice(0, 6).join(", ")}.`
        : "No shared method language between the two narratives.",
    sources: [...new Set([...exact, ...shared.slice(0, 6)])],
  };
}

function factorLocation(a: CaseBundle, b: CaseBundle): FactorResult {
  const ca = coords(a);
  const cb = coords(b);
  if (!ca.length || !cb.length) {
    const na = tokenSet([a.location_name]);
    const nb = tokenSet([b.location_name]);
    if (!na.size || !nb.size) {
      return {
        factor: "Location",
        similarity: null,
        weight: FACTOR_WEIGHTS.Location,
        insufficientData: true,
        detail: "No usable coordinates or place names on one of the files.",
        sources: [],
      };
    }
    const sim = jaccard(na, nb);
    return {
      factor: "Location",
      similarity: sim,
      weight: FACTOR_WEIGHTS.Location,
      insufficientData: false,
      detail: sim > 0 ? "Place names overlap but no coordinates are on file." : "Different reported localities.",
      sources: [a.location_name ?? "", b.location_name ?? ""].filter(Boolean),
    };
  }
  let best = Number.POSITIVE_INFINITY;
  for (const p of ca) for (const q of cb) best = Math.min(best, haversineKm(p.lat, p.lng, q.lat, q.lng));
  const sim = best <= 0.6 ? 1 : best >= 14 ? 0 : 1 - (best - 0.6) / 13.4;
  return {
    factor: "Location",
    similarity: Math.max(0, sim),
    weight: FACTOR_WEIGHTS.Location,
    insufficientData: false,
    detail: `Closest recorded scenes are ${best.toFixed(2)} km apart.`,
    sources: [a.location_name ?? "Scene A", b.location_name ?? "Scene B"],
  };
}

function factorTime(a: CaseBundle, b: CaseBundle): FactorResult {
  const ta = new Date(a.occurred_at).getTime();
  const tb = new Date(b.occurred_at).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) {
    return {
      factor: "Time",
      similarity: null,
      weight: FACTOR_WEIGHTS.Time,
      insufficientData: true,
      detail: "Incident time missing on one of the files.",
      sources: [],
    };
  }
  const hours = Math.abs(ta - tb) / 3_600_000;
  const proximity = hours <= 6 ? 1 : hours >= 24 * 30 ? 0 : 1 - (hours - 6) / (24 * 30 - 6);
  const hourA = new Date(ta).getHours();
  const hourB = new Date(tb).getHours();
  const clockGap = Math.min(Math.abs(hourA - hourB), 24 - Math.abs(hourA - hourB));
  const sameWindow = clockGap <= 2 ? 1 : clockGap <= 4 ? 0.5 : 0;
  const sim = Math.max(0, Math.min(1, proximity * 0.6 + sameWindow * 0.4));
  return {
    factor: "Time",
    similarity: sim,
    weight: FACTOR_WEIGHTS.Time,
    insufficientData: false,
    detail: `${hours < 48 ? `${hours.toFixed(1)} hours` : `${(hours / 24).toFixed(1)} days`} apart; both fall around the ${hourA.toString().padStart(2, "0")}:00 / ${hourB.toString().padStart(2, "0")}:00 window.`,
    sources: [a.occurred_at, b.occurred_at],
  };
}

function factorVehicle(a: CaseBundle, b: CaseBundle): FactorResult {
  if (!a.vehicles.length || !b.vehicles.length) {
    return {
      factor: "Vehicle",
      similarity: null,
      weight: FACTOR_WEIGHTS.Vehicle,
      insufficientData: true,
      detail: "No vehicle recorded on one of the files — a known gap in this comparison.",
      sources: [],
    };
  }
  let best = 0;
  let why = "No vehicle attribute in common.";
  const sources: string[] = [];
  for (const va of a.vehicles) {
    for (const vb of b.vehicles) {
      const pa = plateKey(va);
      const pb = plateKey(vb);
      let s = 0;
      if (pa && pb) {
        if (pa === pb) s = 1;
        else if (pa.length >= 4 && (pa.includes(pb) || pb.includes(pa))) s = 0.85;
        else {
          const tail = Math.min(pa.length, pb.length, 4);
          if (tail >= 3 && pa.slice(-tail) === pb.slice(-tail)) s = 0.7;
        }
      }
      const attr =
        (va.make_model && vb.make_model && norm(va.make_model) === norm(vb.make_model) ? 0.4 : 0) +
        (va.color && vb.color && norm(va.color) === norm(vb.color) ? 0.25 : 0) +
        (va.vehicle_type && vb.vehicle_type && norm(va.vehicle_type) === norm(vb.vehicle_type) ? 0.2 : 0);
      const total = Math.min(1, Math.max(s, s * 0.8 + attr, attr));
      if (total > best) {
        best = total;
        why =
          s === 1
            ? `Same registration recorded on both files (${pa}).`
            : s > 0
              ? `Partial plate match ${pa} ↔ ${pb}${attr ? " with matching vehicle description" : ""}.`
              : `Matching vehicle description: ${[va.color, va.make_model, va.vehicle_type].filter(Boolean).join(" ")}.`;
        sources.length = 0;
        sources.push(
          [va.color, va.make_model, va.plate ?? va.plate_partial].filter(Boolean).join(" "),
          [vb.color, vb.make_model, vb.plate ?? vb.plate_partial].filter(Boolean).join(" "),
        );
      }
    }
  }
  return {
    factor: "Vehicle",
    similarity: best,
    weight: FACTOR_WEIGHTS.Vehicle,
    insufficientData: false,
    detail: why,
    sources,
  };
}

function factorWeapon(a: CaseBundle, b: CaseBundle): FactorResult {
  if (!a.weapons.length || !b.weapons.length) {
    return {
      factor: "Weapon",
      similarity: null,
      weight: FACTOR_WEIGHTS.Weapon,
      insufficientData: true,
      detail: "No weapon recorded on one of the files.",
      sources: [],
    };
  }
  let best = 0;
  let why = "Different weapon categories.";
  const sources: string[] = [];
  for (const wa of a.weapons) {
    for (const wb of b.weapons) {
      const same = norm(wa.weapon_type) === norm(wb.weapon_type);
      const partial = jaccard(tokenSet([wa.weapon_type, wa.description]), tokenSet([wb.weapon_type, wb.description]));
      const s = same ? Math.min(1, 0.85 + partial * 0.15) : partial;
      if (s > best) {
        best = s;
        why = same
          ? `Same weapon type used in both incidents (${wa.weapon_type}).`
          : `Weapon descriptions partially overlap (${wa.weapon_type} ↔ ${wb.weapon_type}).`;
        sources.length = 0;
        sources.push(wa.weapon_type, wb.weapon_type);
      }
    }
  }
  return {
    factor: "Weapon",
    similarity: best,
    weight: FACTOR_WEIGHTS.Weapon,
    insufficientData: false,
    detail: why,
    sources,
  };
}

function factorPeople(a: CaseBundle, b: CaseBundle): FactorResult {
  const namesA = [...a.persons.map((p) => p.full_name), ...a.persons.flatMap((p) => p.aliases), ...a.witnesses.map((w) => w.name)];
  const namesB = [...b.persons.map((p) => p.full_name), ...b.persons.flatMap((p) => p.aliases), ...b.witnesses.map((w) => w.name)];
  if (!namesA.length || !namesB.length) {
    return {
      factor: "Witness / persons",
      similarity: null,
      weight: FACTOR_WEIGHTS["Witness / persons"],
      insufficientData: true,
      detail: "No named persons or witnesses on one of the files.",
      sources: [],
    };
  }
  const exact = namesA.filter((n) => namesB.some((m) => norm(m) === norm(n)));
  const descA = tokenSet([...a.persons.flatMap((p) => p.descriptors), ...a.witnesses.flatMap((w) => w.descriptors)]);
  const descB = tokenSet([...b.persons.flatMap((p) => p.descriptors), ...b.witnesses.flatMap((w) => w.descriptors)]);
  const descSim = jaccard(descA, descB);
  const sim = Math.min(1, exact.length * 0.55 + descSim * 0.8);
  return {
    factor: "Witness / persons",
    similarity: sim,
    weight: FACTOR_WEIGHTS["Witness / persons"],
    insufficientData: false,
    detail: exact.length
      ? `Same person appears on both files: ${[...new Set(exact)].join(", ")}.`
      : descSim > 0
        ? `Suspect descriptions share ${overlap(descA, descB).slice(0, 5).join(", ")}.`
        : "No shared persons or descriptions.",
    sources: [...new Set(exact)],
  };
}

function factorOther(a: CaseBundle, b: CaseBundle): FactorResult {
  const idsA = new Set(a.persons.map((p) => (p.phone ?? "").replace(/\D/g, "").slice(-10)).filter((x) => x.length === 10));
  const idsB = new Set(b.persons.map((p) => (p.phone ?? "").replace(/\D/g, "").slice(-10)).filter((x) => x.length === 10));
  const tagsA = tokenSet(a.tags);
  const tagsB = tokenSet(b.tags);
  if ((!idsA.size || !idsB.size) && (!tagsA.size || !tagsB.size)) {
    return {
      factor: "Other identifiers",
      similarity: null,
      weight: FACTOR_WEIGHTS["Other identifiers"],
      insufficientData: true,
      detail: "No phone numbers or classification tags to compare.",
      sources: [],
    };
  }
  const phoneHit = overlap(idsA, idsB);
  const tagSim = jaccard(tagsA, tagsB);
  const sim = Math.min(1, (phoneHit.length ? 1 : 0) * 0.7 + tagSim * 0.6);
  return {
    factor: "Other identifiers",
    similarity: sim,
    weight: FACTOR_WEIGHTS["Other identifiers"],
    insufficientData: false,
    detail: phoneHit.length
      ? `Shared contact number ending ${phoneHit[0]!.slice(-4)}.`
      : tagSim > 0
        ? `Shared classification tags: ${overlap(tagsA, tagsB).join(", ")}.`
        : "No shared identifiers or tags.",
    sources: phoneHit,
  };
}

export function classify(score: number): Classification {
  if (score >= 85) return "High Potential Connection";
  if (score >= 70) return "Moderate Potential Connection";
  if (score >= 50) return "Weak Potential Connection";
  return "Low Relevance";
}

export function scorePair(a: CaseBundle, b: CaseBundle): ScoredPair {
  const factors = [
    factorMO(a, b),
    factorLocation(a, b),
    factorTime(a, b),
    factorVehicle(a, b),
    factorWeapon(a, b),
    factorPeople(a, b),
    factorOther(a, b),
  ];

  let weighted = 0;
  let denominator = 0;
  for (const f of factors) {
    if (f.insufficientData || f.similarity == null) continue;
    weighted += f.similarity * f.weight;
    denominator += f.weight;
  }
  // Confidence is damped when large parts of the model could not be evaluated.
  const coverage = denominator / 1;
  const raw = denominator > 0 ? weighted / denominator : 0;
  const score = Math.round(raw * (0.6 + 0.4 * coverage) * 1000) / 10;

  const drivers = factors
    .filter((f) => !f.insufficientData && (f.similarity ?? 0) >= 0.45)
    .sort((x, y) => (y.similarity ?? 0) * y.weight - (x.similarity ?? 0) * x.weight);
  const gaps = factors.filter((f) => f.insufficientData).map((f) => f.factor);

  const explanation = [
    drivers.length
      ? `Correlated on ${drivers.map((d) => d.factor.toLowerCase()).join(", ")}. ${drivers.map((d) => d.detail).join(" ")}`
      : "No factor cleared the corroboration threshold; the score reflects weak, diffuse similarity only.",
    gaps.length
      ? `Insufficient data for ${gaps.join(", ")} — confidence was reduced rather than assumed, and these are the gaps to close next.`
      : "All seven factors had enough data to be evaluated.",
    "AI output is a lead, not a conclusion. An authorized investigator must record the verdict.",
  ].join(" ");

  return {
    caseAId: a.id,
    caseBId: b.id,
    score,
    classification: classify(score),
    explanation,
    factors,
  };
}

export function scoreCorpus(cases: CaseBundle[], minScore = 20): ScoredPair[] {
  const out: ScoredPair[] = [];
  for (let i = 0; i < cases.length; i += 1) {
    for (let j = i + 1; j < cases.length; j += 1) {
      const pair = scorePair(cases[i]!, cases[j]!);
      if (pair.score >= minScore) out.push(pair);
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
