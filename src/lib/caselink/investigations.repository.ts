import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/integrations/supabase/types";
import type { CaseLink, Evidence, EvidenceType, Investigation } from "./types";

type CaseRow = Tables<"cases">;
type EvidenceRow = Tables<"evidence">;
type PersonRow = Tables<"persons">;
type VehicleRow = Tables<"vehicles">;
type WeaponRow = Tables<"weapons">;
type LocationRow = Tables<"locations">;
type WitnessRow = Tables<"witnesses">;
type CctvRow = Tables<"cctv">;
type TimelineRow = Tables<"timeline_events">;
type ConnectionRow = Tables<"case_connections">;

export interface InvestigationRepositoryResult {
  cases: Investigation[];
  links: CaseLink[];
}

function groupByCase<T extends { case_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) grouped.set(row.case_id, [...(grouped.get(row.case_id) ?? []), row]);
  return grouped;
}

function evidenceType(category: string): EvidenceType {
  const value = category.toLowerCase();
  if (value.includes("cctv") || value.includes("camera")) return "CCTV";
  if (value.includes("witness") || value.includes("statement")) return "Witness";
  if (value.includes("phone") || value.includes("mobile") || value.includes("device")) return "Phone";
  if (value.includes("transport") || value.includes("vehicle")) return "Transport";
  if (value.includes("location") || value.includes("geo")) return "Location";
  if (value.includes("photo") || value.includes("image")) return "Photo";
  return "Other";
}

function locationName(
  latitude: number | null,
  longitude: number | null,
  locations: LocationRow[],
): string {
  if (latitude == null || longitude == null) return "";
  return locations.find((row) => row.latitude === latitude && row.longitude === longitude)?.name ?? "";
}

function mapEvidence(row: EvidenceRow, locations: LocationRow[]): Evidence {
  return {
    id: row.id,
    caseId: row.case_id,
    type: evidenceType(row.category),
    label: row.filename || row.category,
    source: row.uploaded_by_name || row.mime_type || "",
    timestamp: row.collected_at ?? row.created_at,
    locationName: locationName(row.latitude, row.longitude, locations),
    lat: row.latitude,
    lng: row.longitude,
    reliability: null,
    details: row.description ?? "",
    interpretation: "",
    keywords: [row.category, row.filename].filter((value): value is string => Boolean(value)),
    stage: row.status,
    recordKind: "evidence",
  };
}

function mapCctv(row: CctvRow, locations: LocationRow[]): Evidence {
  return {
    id: row.id,
    caseId: row.case_id,
    type: "CCTV",
    label: row.name,
    source: row.owner ?? "",
    timestamp: row.captured_at ?? row.created_at,
    locationName: locationName(row.latitude, row.longitude, locations),
    lat: row.latitude,
    lng: row.longitude,
    reliability: null,
    details: row.notes ?? "",
    interpretation: "",
    keywords: [row.name, row.owner].filter((value): value is string => Boolean(value)),
    stage: row.status,
    recordKind: "cctv",
  };
}

function mapTimeline(row: TimelineRow, locations: LocationRow[]): Evidence {
  return {
    id: row.id,
    caseId: row.case_id,
    type: evidenceType(row.kind),
    label: row.title,
    source: "",
    timestamp: row.occurred_at,
    locationName: locationName(row.latitude, row.longitude, locations),
    lat: row.latitude,
    lng: row.longitude,
    reliability: null,
    details: row.detail ?? "",
    interpretation: "",
    keywords: [row.kind],
    stage: "Timeline event",
    recordKind: "timeline",
    relatedEvidenceId: row.evidence_id,
  };
}

function vehicleLabel(row: VehicleRow | undefined): string | undefined {
  if (!row) return undefined;
  const identity = row.plate || row.plate_partial;
  const value = [row.color, row.make_model || row.vehicle_type, identity].filter(Boolean).join(" ");
  return value || undefined;
}

function mapCase(
  row: CaseRow,
  persons: PersonRow[],
  vehicles: VehicleRow[],
  weapons: WeaponRow[],
  locations: LocationRow[],
  witnesses: WitnessRow[],
  evidence: EvidenceRow[],
  cctv: CctvRow[],
  timeline: TimelineRow[],
): Investigation {
  const subject = persons.find((person) => person.role_in_case?.toLowerCase() === "subject") ?? persons[0];
  return {
    id: row.id,
    code: row.case_no,
    title: row.title,
    type: row.crime_type,
    priority: row.priority,
    status: row.status,
    subject: {
      name: subject?.full_name ?? "",
      aliases: subject?.aliases ?? [],
      ...(subject?.age != null ? { age: subject.age } : {}),
      ...(subject?.phone ? { phone: subject.phone } : {}),
      ...(vehicleLabel(vehicles[0]) ? { vehicle: vehicleLabel(vehicles[0]) } : {}),
      ...(subject?.description ? { description: subject.description } : {}),
    },
    incidentDate: row.occurred_at,
    lastKnownLocation: row.location_name ?? locations[0]?.name ?? "",
    district: "",
    notes: row.notes ?? row.description ?? "",
    ...(row.modus_operandi.length ? { modusOperandi: row.modus_operandi.join("; ") } : {}),
    ...(weapons[0] ? { weapon: [weapons[0].weapon_type, weapons[0].description].filter(Boolean).join(": ") } : {}),
    witnesses: witnesses.map((witness) => witness.name),
    officer: row.investigator_name ?? "",
    createdAt: row.created_at,
    evidence: [
      ...evidence.map((item) => mapEvidence(item, locations)),
      ...cctv.map((item) => mapCctv(item, locations)),
      ...timeline.map((item) => mapTimeline(item, locations)),
    ],
    isDatabaseBacked: true,
  };
}

function mapConnection(row: ConnectionRow): CaseLink {
  return {
    id: row.id,
    aId: row.case_a_id,
    bId: row.case_b_id,
    confidence: Number(row.score),
    reasons: [],
    sharedAttributes: [],
    explanation: row.explanation ?? "",
    sharedEvidenceIds: [],
  };
}

export async function loadInvestigations(
  client: SupabaseClient<Database>,
): Promise<InvestigationRepositoryResult> {
  const [cases, evidence, persons, vehicles, weapons, locations, witnesses, cctv, timeline, connections] =
    await Promise.all([
      client.from("cases").select("*").order("occurred_at", { ascending: false }),
      client.from("evidence").select("*"),
      client.from("persons").select("*"),
      client.from("vehicles").select("*"),
      client.from("weapons").select("*"),
      client.from("locations").select("*"),
      client.from("witnesses").select("*"),
      client.from("cctv").select("*"),
      client.from("timeline_events").select("*").order("occurred_at", { ascending: true }),
      client.from("case_connections").select("*").order("score", { ascending: false }),
    ]);

  const failed = [cases, evidence, persons, vehicles, weapons, locations, witnesses, cctv, timeline, connections]
    .map((result) => result.error)
    .find((error) => error != null);
  if (failed) throw new Error(failed.message);

  const personsByCase = groupByCase(persons.data ?? []);
  const vehiclesByCase = groupByCase(vehicles.data ?? []);
  const weaponsByCase = groupByCase(weapons.data ?? []);
  const locationsByCase = groupByCase(locations.data ?? []);
  const witnessesByCase = groupByCase(witnesses.data ?? []);
  const evidenceByCase = groupByCase(evidence.data ?? []);
  const cctvByCase = groupByCase(cctv.data ?? []);
  const timelineByCase = groupByCase(timeline.data ?? []);

  return {
    cases: (cases.data ?? []).map((row) =>
      mapCase(
        row,
        personsByCase.get(row.id) ?? [],
        vehiclesByCase.get(row.id) ?? [],
        weaponsByCase.get(row.id) ?? [],
        locationsByCase.get(row.id) ?? [],
        witnessesByCase.get(row.id) ?? [],
        evidenceByCase.get(row.id) ?? [],
        cctvByCase.get(row.id) ?? [],
        timelineByCase.get(row.id) ?? [],
      ),
    ),
    links: (connections.data ?? []).map(mapConnection),
  };
}
