import type { SupabaseClient } from "@supabase/supabase-js";

import { analyseCorpus, type CaseBundle, type ScoredPair } from "./engine";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DB = SupabaseClient<any, any, any>;

export async function loadCorpus(db: DB): Promise<CaseBundle[]> {
  const [cases, persons, vehicles, weapons, witnesses, locations] = await Promise.all([
    db.from("cases").select("*").order("occurred_at", { ascending: false }),
    db.from("persons").select("case_id, full_name, aliases, phone, descriptors"),
    db.from("vehicles").select("case_id, make_model, color, plate, plate_partial, vehicle_type"),
    db.from("weapons").select("case_id, weapon_type, description"),
    db.from("witnesses").select("case_id, name, descriptors"),
    db.from("locations").select("case_id, name, latitude, longitude"),
  ]);

  const err = cases.error ?? persons.error ?? vehicles.error ?? weapons.error ?? witnesses.error ?? locations.error;
  if (err) throw new Error(err.message);

  const by = <T extends { case_id: string }>(rows: T[] | null, id: string) =>
    (rows ?? []).filter((r) => r.case_id === id);

  return (cases.data ?? []).map((c: any) => ({
    ...c,
    modus_operandi: c.modus_operandi ?? [],
    tags: c.tags ?? [],
    persons: by(persons.data as any[], c.id),
    vehicles: by(vehicles.data as any[], c.id),
    weapons: by(weapons.data as any[], c.id),
    witnesses: by(witnesses.data as any[], c.id),
    locations: by(locations.data as any[], c.id),
  })) as CaseBundle[];
}

export interface AnalysisRun {
  cases: number;
  pairsEvaluated: number;
  candidatePairs: number;
  skippedPairs: number;
  belowThreshold: number;
  stored: number;
  strong: number;
  high: number;
  moderate: number;
  weak: number;
  low: number;
  computedAt: string;
  leads: ScoredPair[];
}

/** Recomputes the complete correlation layer, preserving human verdicts. */
export async function runCorrelation(
  db: DB,
  actorName: string,
  actorId: string,
): Promise<AnalysisRun> {
  const corpus = await loadCorpus(db);
  const analysis = analyseCorpus(corpus, { minScore: 50 });
  const pairs: ScoredPair[] = analysis.pairs;

  const existing = await db.from("case_connections").select("id, case_a_id, case_b_id, verdict");
  if (existing.error) throw new Error(existing.error.message);

  const keyOf = (a: string, b: string) => [a, b].sort().join("::");
  const prior = new Map<string, { id: string; verdict: string }>();
  for (const row of (existing.data ?? []) as any[]) {
    prior.set(keyOf(row.case_a_id, row.case_b_id), { id: row.id, verdict: row.verdict });
  }

  // Drop stale pending rows; recorded verdicts and their ai_score_at_verdict are never touched.
  const keepKeys = new Set(pairs.map((p) => keyOf(p.caseAId, p.caseBId)));
  const staleIds = [...prior.entries()]
    .filter(([k, v]) => v.verdict === "pending" && !keepKeys.has(k))
    .map(([, v]) => v.id);
  if (staleIds.length) await db.from("case_connections").delete().in("id", staleIds);

  const caseNoById = new Map(corpus.map((c) => [c.id, c.case_no]));


  let stored = 0;
  for (const p of pairs) {
    const existingRow = prior.get(keyOf(p.caseAId, p.caseBId));
    let connectionId: string;

    if (existingRow) {
      connectionId = existingRow.id;
      const { error } = await db
        .from("case_connections")
        .update({
          score: p.score,
          classification: p.classification,
          explanation: p.explanation,
          computed_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      if (error) continue;
      await db.from("connection_factors").delete().eq("connection_id", connectionId);
    } else {
      const { data, error } = await db
        .from("case_connections")
        .insert({
          case_a_id: p.caseAId,
          case_b_id: p.caseBId,
          score: p.score,
          classification: p.classification,
          explanation: p.explanation,
        })
        .select("id")
        .single();
      if (error || !data) continue;
      connectionId = (data as any).id;

      if (p.score >= 85) {
        await db.from("alerts").insert({
          kind: "strong_link",
          title: `Strong correlation detected (${p.score.toFixed(1)}%)`,
          body: p.explanation.slice(0, 400),
          connection_id: connectionId,
        });
      }
    }

    await db.from("connection_factors").insert(
      p.factors.map((f) => ({
        connection_id: connectionId,
        factor: f.factor,
        similarity: f.similarity,
        weight: f.weight,
        insufficient_data: f.insufficientData,
        detail: f.detail,
        // Real matched values, plus the two case references the factor drew on.
        sources:
          !f.insufficientData && (f.similarity ?? 0) >= 0.45
            ? [
                ...f.sources,
                `case:${caseNoById.get(p.caseAId) ?? p.caseAId}`,
                `case:${caseNoById.get(p.caseBId) ?? p.caseBId}`,
              ]
            : f.sources,
      })),
    );
    stored += 1;
  }

  const count = (lo: number, hi: number) => pairs.filter((p) => p.score >= lo && p.score < hi).length;
  const computedAt = new Date().toISOString();

  await db.from("audit_logs").insert({
    actor_id: actorId,
    actor_name: actorName,
    action_type: "analysis",
    action: "Ran cross-case correlation engine",
    detail: `${corpus.length} files considered, ${analysis.candidatePairs} candidate pairs examined, ${analysis.skippedPairs} skipped as irrelevant, ${stored} meaningful connections stored, ${analysis.belowThreshold} low-relevance pairs excluded (weighted 7-factor model).`,
  });

  return {
    cases: corpus.length,
    pairsEvaluated: analysis.pairsPossible,
    candidatePairs: analysis.candidatePairs,
    skippedPairs: analysis.skippedPairs,
    belowThreshold: analysis.belowThreshold,
    stored,
    strong: pairs.filter((p) => p.score >= 85).length,
    high: pairs.filter((p) => p.score >= 85).length,
    moderate: count(70, 85),
    weak: count(50, 70),
    low: analysis.belowThreshold,
    computedAt,
    leads: pairs,
  };

}

export async function loadConnections(db: DB) {
  const [conns, factors, cases] = await Promise.all([
    db.from("case_connections").select("*").gte("score", 50).order("score", { ascending: false }),
    db.from("connection_factors").select("*"),
    db
      .from("cases")
      .select("id, case_no, title, crime_type, location_name, occurred_at, priority, status, updated_at"),
  ]);
  const err = conns.error ?? factors.error ?? cases.error;
  if (err) throw new Error(err.message);

  const caseMap = new Map((cases.data ?? []).map((c: any) => [c.id, c]));
  return (conns.data ?? []).map((c: any) => {
    const a = caseMap.get(c.case_a_id) ?? null;
    const b = caseMap.get(c.case_b_id) ?? null;
    const computed = new Date(c.computed_at).getTime();
    // Freshness: either file edited after the score was computed ⇒ needs recalculation.
    const newest = Math.max(
      a?.updated_at ? new Date(a.updated_at).getTime() : 0,
      b?.updated_at ? new Date(b.updated_at).getTime() : 0,
    );
    return {
      ...c,
      score: Number(c.score),
      caseA: a,
      caseB: b,
      stale: Number.isFinite(computed) && newest > computed,
      factors: ((factors.data ?? []) as any[])
        .filter((f) => f.connection_id === c.id)
        .map((f) => ({
          ...f,
          similarity: f.similarity == null ? null : Number(f.similarity),
          weight: Number(f.weight),
          sources: (f.sources ?? []) as string[],
        }))
        .sort((x, y) => y.weight - x.weight),
    };
  });
}


export async function recordVerdict(
  db: DB,
  input: { connectionId: string; verdict: "pending" | "confirmed" | "rejected" | "inconclusive"; reason: string },
  actorId: string,
  actorName: string,
) {
  const current = await db.from("case_connections").select("score").eq("id", input.connectionId).single();
  const { error } = await db
    .from("case_connections")
    .update({
      verdict: input.verdict,
      verdict_reason: input.reason || null,
      verified_by: actorId,
      verified_by_name: actorName,
      verified_at: new Date().toISOString(),
      ai_score_at_verdict: (current.data as any)?.score ?? null,
    })
    .eq("id", input.connectionId);
  if (error) throw new Error(error.message);

  await db.from("audit_logs").insert({
    actor_id: actorId,
    actor_name: actorName,
    action_type: "verification",
    action: `Recorded human verdict: ${input.verdict.toUpperCase()}`,
    detail: input.reason || "No reason supplied.",
  });

  return { ok: true };
}
