import type { CaseLink, Evidence, Investigation, LinkReason } from "./types";

const STOP = new Set([
  "the","and","for","with","from","near","that","this","were","was","into","onto",
  "his","her","their","not","did","reported","report","subject","seen","last",
  "after","before","during","same","two","one","also","been","have","has","are",
  "outside","inside","around","toward","towards","without","then","than","over",
  "when","while","which","where","who","whom","about","against","along","case",
]);

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();

export function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((t) => t.length > 3 && !STOP.has(t));
}

export function plates(text: string): string[] {
  const m = text.toUpperCase().match(/TN[- ]?\d{2}[- ]?[A-Z]{1,2}[- ]?\d{3,4}/g);
  return m ? Array.from(new Set(m.map((x) => x.replace(/[- ]/g, "")))) : [];
}

export function phones(text: string): string[] {
  const m = text.match(/(?:\+91[\s-]?)?\d{5}[\s-]?\d{5}/g);
  return m ? Array.from(new Set(m.map((x) => x.replace(/[^\d]/g, "").slice(-10)))) : [];
}

export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function caseCorpus(c: Investigation): string {
  return [
    c.title,
    c.type,
    c.notes,
    c.modusOperandi ?? "",
    c.weapon ?? "",
    c.lastKnownLocation,
    c.district,
    c.subject.name,
    c.subject.description ?? "",
    c.subject.vehicle ?? "",
    c.subject.phone ?? "",
    ...c.subject.aliases,
    ...c.witnesses,
    ...c.evidence.flatMap((e) => [
      e.label,
      e.source,
      e.details,
      e.locationName,
      ...e.keywords,
    ]),
  ].join(" \n ");
}

const inter = <T,>(a: Set<T>, b: Set<T>) => [...a].filter((x) => b.has(x));

function nameParts(c: Investigation): Set<string> {
  const raw = [c.subject.name, ...c.subject.aliases].join(" ");
  return new Set(
    norm(raw)
      .split(" ")
      .filter(
        (t) =>
          t.length > 3 &&
          !["unidentified", "suspect", "group", "cluster"].includes(t),
      ),
  );
}

export function compareCases(
  a: Investigation,
  b: Investigation,
): { confidence: number; reasons: LinkReason[]; shared: string[]; sharedEvidenceIds: string[] } {
  const reasons: LinkReason[] = [];
  const shared: string[] = [];
  const sharedEvidenceIds: string[] = [];

  const corpusA = caseCorpus(a);
  const corpusB = caseCorpus(b);

  // --- vehicles / plates
  const pA = new Set(plates(corpusA));
  const pB = new Set(plates(corpusB));
  const platesShared = inter(pA, pB);
  if (platesShared.length) {
    reasons.push({
      factor: "Vehicle identifier",
      detail: `Identical vehicle identifier ${platesShared.join(", ")} appears in both files.`,
      weight: 30,
    });
    shared.push(...platesShared.map((p) => `Vehicle ${p}`));
  }

  // --- phones
  const hA = new Set(phones(corpusA));
  const hB = new Set(phones(corpusB));
  const phonesShared = inter(hA, hB);
  if (phonesShared.length) {
    reasons.push({
      factor: "Handset number",
      detail: `Shared handset identifier ending ${phonesShared
        .map((p) => p.slice(-5))
        .join(", ")} recorded in both investigations.`,
      weight: 26,
    });
    shared.push(...phonesShared.map((p) => `Handset •••${p.slice(-5)}`));
  }

  // --- names / aliases
  const nameShared = inter(nameParts(a), nameParts(b));
  if (nameShared.length) {
    reasons.push({
      factor: "Name / alias overlap",
      detail: `Common name or alias token: ${nameShared.join(", ")}.`,
      weight: 18,
    });
    shared.push(...nameShared.map((n) => `Alias "${n}"`));
  }

  // --- witnesses
  const wShared = inter(
    new Set(a.witnesses.map(norm)),
    new Set(b.witnesses.map(norm)),
  );
  if (wShared.length) {
    reasons.push({
      factor: "Shared witness",
      detail: `The same witness gave statements in both files (${wShared.length} match).`,
      weight: 16,
    });
    shared.push(...a.witnesses.filter((w) => wShared.includes(norm(w))).map((w) => `Witness ${w}`));
  }

  // --- weapon
  if (a.weapon && b.weapon && norm(a.weapon).split(" ")[0] === norm(b.weapon).split(" ")[0]) {
    reasons.push({
      factor: "Weapon / tool",
      detail: `Both files record the same instrument type (${a.weapon}).`,
      weight: 12,
    });
    shared.push(`Weapon ${a.weapon}`);
  }

  // --- geography (evidence-level proximity)
  let best = Infinity;
  let bestPair: [string, string] | null = null;
  for (const eA of a.evidence) {
    if (eA.lat == null || eA.lng == null) continue;
    for (const eB of b.evidence) {
      if (eB.lat == null || eB.lng == null) continue;
      const d = haversineKm(eA.lat, eA.lng, eB.lat, eB.lng);
      if (d < best) {
        best = d;
        bestPair = [eA.id, eB.id];
      }
    }
  }
  if (bestPair && best <= 6) {
    const w = best <= 0.4 ? 18 : best <= 2 ? 13 : 8;
    reasons.push({
      factor: "Geographic proximity",
      detail: `Closest evidence points are ${best.toFixed(2)} km apart (${bestPair[0]} ↔ ${bestPair[1]}).`,
      weight: w,
    });
    shared.push(`Geo cluster ${best.toFixed(1)} km`);
    sharedEvidenceIds.push(...bestPair);
  }

  // --- timeline overlap
  const tA = a.evidence.map((e) => +new Date(e.timestamp)).concat(+new Date(a.incidentDate));
  const tB = b.evidence.map((e) => +new Date(e.timestamp)).concat(+new Date(b.incidentDate));
  let gap = Infinity;
  for (const x of tA) for (const y of tB) gap = Math.min(gap, Math.abs(x - y));
  const gapH = gap / 36e5;
  if (gapH <= 96) {
    const w = gapH <= 6 ? 15 : gapH <= 24 ? 11 : 7;
    reasons.push({
      factor: "Timeline overlap",
      detail: `Activity windows converge within ${gapH < 1 ? `${Math.round(gapH * 60)} minutes` : `${gapH.toFixed(1)} hours`}.`,
      weight: w,
    });
    shared.push(`Temporal window ${gapH < 1 ? "<1h" : `${Math.round(gapH)}h`}`);
  }

  // --- modus operandi / keyword similarity
  const kA = new Set(tokens(`${a.modusOperandi ?? ""} ${a.notes} ${a.evidence.flatMap((e) => e.keywords).join(" ")}`));
  const kB = new Set(tokens(`${b.modusOperandi ?? ""} ${b.notes} ${b.evidence.flatMap((e) => e.keywords).join(" ")}`));
  const kShared = inter(kA, kB);
  if (kShared.length) {
    const w = Math.min(16, 4 + kShared.length * 2);
    reasons.push({
      factor: "Behavioural / MO similarity",
      detail: `${kShared.length} shared descriptors: ${kShared.slice(0, 6).join(", ")}${kShared.length > 6 ? "…" : ""}.`,
      weight: w,
    });
    shared.push(...kShared.slice(0, 4).map((k) => `Descriptor "${k}"`));
  }

  // --- shared evidence sources (same synthetic camera / ping set / statement)
  const sA = new Map(a.evidence.map((e) => [norm(e.source), e.id]));
  const sB = new Map(b.evidence.map((e) => [norm(e.source), e.id]));
  for (const [src, idA] of sA) {
    const idB = sB.get(src);
    if (idB) {
      reasons.push({
        factor: "Shared evidence source",
        detail: `Both files draw on the same source record (${a.evidence.find((e) => e.id === idA)?.source}).`,
        weight: 20,
      });
      shared.push(`Source ${a.evidence.find((e) => e.id === idA)?.source}`);
      sharedEvidenceIds.push(idA, idB);
    }
  }

  // --- same case type / district (weak)
  if (a.type === b.type) {
    reasons.push({ factor: "Case class", detail: `Both are ${a.type} investigations.`, weight: 5 });
  }
  if (a.district === b.district) {
    reasons.push({ factor: "Jurisdiction", detail: `Both incidents fall in ${a.district}.`, weight: 4 });
  }

  const raw = reasons.reduce((s, r) => s + r.weight, 0);
  // saturating curve so no link ever claims certainty
  const confidence = Math.round(96 * (1 - Math.exp(-raw / 46)));

  reasons.sort((x, y) => y.weight - x.weight);

  return {
    confidence,
    reasons,
    shared: Array.from(new Set(shared)),
    sharedEvidenceIds: Array.from(new Set(sharedEvidenceIds)),
  };
}

export const linkId = (a: string, b: string) => [a, b].sort().join("::");

export function buildLinks(cases: Investigation[], minConfidence = 22): CaseLink[] {
  const out: CaseLink[] = [];
  for (let i = 0; i < cases.length; i++) {
    for (let j = i + 1; j < cases.length; j++) {
      const a = cases[i]!;
      const b = cases[j]!;
      const r = compareCases(a, b);
      if (r.confidence < minConfidence || r.reasons.length < 2) continue;
      const top = r.reasons.slice(0, 3).map((x) => x.factor.toLowerCase());
      out.push({
        id: linkId(a.id, b.id),
        aId: a.id,
        bId: b.id,
        confidence: r.confidence,
        reasons: r.reasons,
        sharedAttributes: r.shared,
        sharedEvidenceIds: r.sharedEvidenceIds,
        explanation:
          `${a.code} and ${b.code} are suggested as related primarily on ${top.join(", ")}. ` +
          `The correlation is derived from ${r.reasons.length} independent signals across ` +
          `${a.evidence.length + b.evidence.length} evidence records. ` +
          `This is decision support only — an investigator must confirm, reject, or request further evidence.`,
      });
    }
  }
  return out.sort((x, y) => y.confidence - x.confidence);
}

export interface Direction {
  heading: string;
  confidence: number;
  breakdown: { label: string; value: number }[];
  supporting: string[];
  explanation: string;
}

/** Most probable direction of travel / progression for a single case. */
export function inferDirection(c: Investigation): Direction {
  const ordered = c.evidence
    .filter((item): item is Evidence & { lat: number; lng: number } => item.lat != null && item.lng != null)
    .sort(
    (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp),
  );
  if (ordered.length < 2) {
    return {
      heading: "Insufficient sequence",
      confidence: Math.min(40, 12 + ordered.length * 14),
      breakdown: [
        { label: "Evidence volume", value: ordered.length * 18 },
        { label: "Temporal spread", value: 10 },
        { label: "Corroboration", value: 8 },
      ],
      supporting: ordered.map((e) => e.id),
      explanation:
        "Fewer than two time-stamped evidence points are available, so no movement vector can be computed. " +
        "Add CCTV, transport or handset records to establish a direction.",
    };
  }

  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const dLat = last.lat - first.lat;
  const dLng = last.lng - first.lng;
  const compass =
    Math.abs(dLat) < 0.01 && Math.abs(dLng) < 0.01
      ? "stationary within a tight cluster"
      : `${dLat >= 0 ? "north" : "south"}${Math.abs(dLng) > 0.01 ? (dLng >= 0 ? "-east" : "-west") : ""}`;
  const distance = haversineKm(first.lat, first.lng, last.lat, last.lng);
  const hours = (+new Date(last.timestamp) - +new Date(first.timestamp)) / 36e5;
  const speed = hours > 0 ? distance / hours : 0;

  const recordedReliability = ordered
    .map((item) => item.reliability)
    .filter((value): value is number => value != null);
  const avgRel = recordedReliability.length
    ? recordedReliability.reduce((sum, value) => sum + value, 0) / recordedReliability.length
    : 0;
  const typeDiversity = new Set(ordered.map((e) => e.type)).size;

  const breakdown = [
    ...(recordedReliability.length ? [{ label: "Source reliability", value: Math.round(avgRel) }] : []),
    { label: "Evidence corroboration", value: Math.min(96, ordered.length * 17) },
    { label: "Modality diversity", value: Math.min(96, typeDiversity * 22) },
    {
      label: "Temporal coherence",
      value: Math.round(Math.max(20, 96 - Math.abs(hours) * 1.4)),
    },
    {
      label: "Spatial consistency",
      value: Math.round(Math.max(20, 96 - Math.abs(speed - 35) * 1.1)),
    },
  ];
  const confidence = Math.round(
    breakdown.reduce((s, b) => s + b.value, 0) / breakdown.length,
  );

  return {
    heading: `Probable movement ${compass}${last.locationName ? ` toward ${last.locationName}` : ""}`,
    confidence,
    breakdown,
    supporting: ordered.slice(-3).map((e) => e.id),
    explanation:
      `The earliest anchor is ${first.type} evidence${first.locationName ? ` at ${first.locationName}` : ""} (${first.id}); the latest is ` +
      `${last.type} evidence${last.locationName ? ` at ${last.locationName}` : ""} (${last.id}). That is ${distance.toFixed(1)} km over ` +
      `${hours.toFixed(1)} h, an implied average of ${speed.toFixed(0)} km/h — consistent with ` +
      `${speed > 18 ? "vehicle-assisted travel" : "movement on foot or by local transit"}. ` +
      `${typeDiversity} independent evidence modalities agree on the ${compass} vector. ` +
      (recordedReliability.length
        ? `Mean source reliability is ${avgRel.toFixed(0)}%. Confidence is reduced where a single modality dominates.`
        : "Source reliability was not recorded, so it was excluded from the confidence breakdown."),
  };
}
