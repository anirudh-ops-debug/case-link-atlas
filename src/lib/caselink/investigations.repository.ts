import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/integrations/supabase/types";
import type { CaseLink, Evidence, EvidenceType, IntelligenceAlert, Investigation } from "./types";

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
type AlertRow = Tables<"alerts">;
type ProfileRow = Tables<"profiles">;

export interface EligibleInvestigator {
  id: string;
  fullName: string;
  roles: Array<"investigator" | "senior_investigator">;
  rankDesignation: string | null;
  unitOrAgency: string | null;
  activeCaseCount: number;
  totalCaseCount: number;
}

export interface InvestigatorProfileRecord {
  fullName: string;
  contactNumber: string | null;
  approvedRole: string | null;
  rankDesignation: string | null;
  unit: string | null;
  agency: string | null;
  serviceStartDate: string | null;
  specialization: string | null;
  awards: string[];
  professionalBio: string | null;
  assignedCaseCount: number;
}

export interface InvestigationWorkspaceRecord {
  status: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  investigatorId: string | null;
  updatedAt: string;
  evidenceCount: number;
  mostRecentEvidenceAt: string | null;
  latestActivity: { title: string; occurredAt: string } | null;
  meaningfulLeadCount: number;
  investigator: InvestigatorProfileRecord | null;
}

export interface InvestigationRepositoryResult {
  cases: Investigation[];
  links: CaseLink[];
}

export interface CreateInvestigationInput {
  caseNo: string;
  firNumber: string | null;
  title: string;
  crimeType: string;
  description: string | null;
  occurredAt: string;
  location: { name: string; latitude: number; longitude: number } | null;
  status: "Active" | "Under Review" | "Escalated" | "Closed";
  priority: "Critical" | "High" | "Medium" | "Low";
  tags: string[];
  modusOperandi: string[];
  notes: string | null;
  isSynthetic: boolean;
  subject: {
    fullName: string;
    aliases: string[];
    age: number | null;
    phone: string | null;
    description: string | null;
  };
  vehicle: string | null;
  witnessNames: string[];
  weapon: string | null;
  evidence: Array<{
    category: string;
    label: string;
    description: string | null;
    collectedAt: string;
    latitude: number | null;
    longitude: number | null;
  }>;
}

export interface CreateInvestigationActor {
  userId: string;
  name: string;
}

export interface CreateInvestigationResult {
  caseId: string;
  caseNo: string;
  childFailures: string[];
  auditError: string | null;
}

interface ChildWrite {
  label: string;
  run: () => Promise<{ error: { message: string } | null }>;
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
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    originalFilename: row.original_filename,
    checksumSha256: row.checksum_sha256,
    withdrawnAt: row.withdrawn_at,
    withdrawalReason: row.withdrawal_reason,
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
  profiles: Map<string, ProfileRow>,
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
    officer: row.investigator_id
      ? profiles.get(row.investigator_id)?.full_name?.trim() || "Name not recorded"
      : "",
    ...(row.investigator_id ? { assignedInvestigatorId: row.investigator_id } : {}),
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
    databaseVerdict: row.verdict,
    reasons: [],
    sharedAttributes: [],
    explanation: row.explanation ?? "",
    sharedEvidenceIds: [],
  };
}

function mapAlert(row: AlertRow): IntelligenceAlert {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    caseId: row.case_id,
    connectionId: row.connection_id,
    createdAt: row.created_at,
  };
}

export async function loadInvestigations(
  client: SupabaseClient<Database>,
): Promise<InvestigationRepositoryResult> {
  const [cases, evidence, persons, vehicles, weapons, locations, witnesses, cctv, timeline, connections, profiles] =
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
      client.from("case_connections").select("*").gte("score", 50).order("score", { ascending: false }),
      client.from("profiles").select("*"),
    ]);

  const failed = [cases, evidence, persons, vehicles, weapons, locations, witnesses, cctv, timeline, connections, profiles]
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
  const profilesById = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));

  return {
    cases: (cases.data ?? []).map((row) =>
      mapCase(
        row,
        profilesById,
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

export async function loadIntelligenceAlerts(
  client: SupabaseClient<Database>,
): Promise<IntelligenceAlert[]> {
  const { data, error } = await client
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapAlert);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a valid UUID.`);
  return value;
}

export async function changeInvestigationStatus(
  client: SupabaseClient<Database>,
  caseId: string,
  targetStatus: "Active" | "Dormant" | "Closed",
): Promise<CaseRow> {
  const { data, error } = await client.rpc("change_investigation_status", {
    _case_id: requireUuid(caseId, "Case ID"),
    _new_status: targetStatus,
  });
  if (error || !data) throw new Error(error?.message ?? "The investigation status could not be changed.");
  return data;
}

export async function assignCaseInvestigator(
  client: SupabaseClient<Database>,
  caseId: string,
  investigatorId: string,
): Promise<CaseRow> {
  const { data, error } = await client.rpc("assign_case_investigator", {
    _case_id: requireUuid(caseId, "Case ID"),
    _investigator_id: requireUuid(investigatorId, "Investigator ID"),
  });
  if (error || !data) throw new Error(error?.message ?? "The investigator could not be assigned.");
  return data;
}

export async function loadEligibleInvestigators(
  client: SupabaseClient<Database>,
): Promise<EligibleInvestigator[]> {
  const { data, error } = await client.rpc("list_eligible_case_investigators");
  if (error) throw new Error(`Eligible investigators could not be loaded: ${error.message}`);
  return (data ?? []).map((person) => ({
    id: person.id,
    fullName: person.full_name,
    roles: person.roles.filter((role): role is "investigator" | "senior_investigator" => role === "investigator" || role === "senior_investigator"),
    rankDesignation: person.rank_designation,
    unitOrAgency: person.unit_or_agency,
    activeCaseCount: person.active_case_count,
    totalCaseCount: person.total_case_count,
  }));
}

export async function loadInvestigationWorkspace(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<InvestigationWorkspaceRecord> {
  const { data: caseRow, error: caseError } = await client
    .from("cases")
    .select("id, status, priority, updated_at, investigator_id")
    .eq("id", caseId)
    .single();
  if (caseError) throw new Error(caseError.message);

  const [evidence, activity, connections] = await Promise.all([
    client.from("evidence").select("created_at, collected_at").eq("case_id", caseId),
    client
      .from("timeline_events")
      .select("title, occurred_at")
      .eq("case_id", caseId)
      .order("occurred_at", { ascending: false })
      .limit(1),
    client
      .from("case_connections")
      .select("id")
      .or(`case_a_id.eq.${caseId},case_b_id.eq.${caseId}`)
      .gte("score", 60),
  ]);
  const relatedError = evidence.error ?? activity.error ?? connections.error;
  if (relatedError) throw new Error(relatedError.message);

  let investigator: InvestigatorProfileRecord | null = null;
  if (caseRow.investigator_id) {
    const [profile, roles, assignedCases] = await Promise.all([
      client
        .from("profiles")
        .select("full_name, contact_number, rank_designation, unit, agency_id, service_start_date, specialization, awards, professional_bio")
        .eq("id", caseRow.investigator_id)
        .maybeSingle(),
      client.from("user_roles").select("role").eq("user_id", caseRow.investigator_id),
      client.from("cases").select("id", { count: "exact", head: true }).eq("investigator_id", caseRow.investigator_id),
    ]);
    if (profile.error) throw new Error(profile.error.message);
    if (assignedCases.error) throw new Error(assignedCases.error.message);
    let agency: string | null = null;
    if (profile.data?.agency_id) {
      const agencyResult = await client.from("agencies").select("name").eq("id", profile.data.agency_id).maybeSingle();
      if (agencyResult.error) throw new Error(agencyResult.error.message);
      agency = agencyResult.data?.name ?? null;
    }
    if (profile.data) {
      investigator = {
        fullName: profile.data.full_name.trim() || "Name not recorded",
        contactNumber: profile.data.contact_number,
        approvedRole: roles.error ? null : (roles.data?.map((item) => item.role).join(", ") || null),
        rankDesignation: profile.data.rank_designation,
        unit: profile.data.unit,
        agency,
        serviceStartDate: profile.data.service_start_date,
        specialization: profile.data.specialization,
        awards: profile.data.awards,
        professionalBio: profile.data.professional_bio,
        assignedCaseCount: assignedCases.count ?? 0,
      };
    }
  }

  const evidenceDates = (evidence.data ?? []).map((row) => row.collected_at ?? row.created_at);
  evidenceDates.sort((a, b) => +new Date(b) - +new Date(a));
  const latest = activity.data?.[0];
  return {
    status: caseRow.status,
    priority: caseRow.priority,
    investigatorId: caseRow.investigator_id,
    updatedAt: caseRow.updated_at,
    evidenceCount: evidence.data?.length ?? 0,
    mostRecentEvidenceAt: evidenceDates[0] ?? null,
    latestActivity: latest ? { title: latest.title, occurredAt: latest.occurred_at } : null,
    meaningfulLeadCount: connections.data?.length ?? 0,
    investigator,
  };
}

export async function createInvestigation(
  client: SupabaseClient<Database>,
  input: CreateInvestigationInput,
  actor: CreateInvestigationActor,
): Promise<CreateInvestigationResult> {
  const { data: createdCase, error: caseError } = await client
    .from("cases")
    .insert({
      case_no: input.caseNo,
      fir_number: input.firNumber,
      title: input.title,
      crime_type: input.crimeType,
      description: input.description,
      occurred_at: input.occurredAt,
      location_name: input.location?.name ?? null,
      latitude: input.location?.latitude ?? null,
      longitude: input.location?.longitude ?? null,
      investigator_id: actor.userId,
      investigator_name: actor.name,
      status: input.status,
      priority: input.priority,
      tags: input.tags,
      modus_operandi: input.modusOperandi,
      notes: input.notes,
      is_synthetic: input.isSynthetic,
    })
    .select("id, case_no")
    .single();

  if (caseError || !createdCase) {
    throw new Error(caseError?.message ?? "The investigation could not be created.");
  }

  const caseId = createdCase.id;
  const childWrites: ChildWrite[] = [
    {
      label: "primary subject",
      run: async () => {
        const { error } = await client.from("persons").insert({
          case_id: caseId,
          full_name: input.subject.fullName,
          aliases: input.subject.aliases,
          role_in_case: "subject",
          age: input.subject.age,
          phone: input.subject.phone,
          description: input.subject.description,
          descriptors: [],
        });
        return { error };
      },
    },
    {
      label: "initial timeline event",
      run: async () => {
        const { error } = await client.from("timeline_events").insert({
          case_id: caseId,
          kind: "Incident",
          occurred_at: input.occurredAt,
          title: "Investigation incident recorded",
          detail: input.description,
          latitude: input.location?.latitude ?? null,
          longitude: input.location?.longitude ?? null,
        });
        return { error };
      },
    },
  ];

  if (input.vehicle) {
    childWrites.push({
      label: "vehicle",
      run: async () => {
        const { error } = await client.from("vehicles").insert({
          case_id: caseId,
          make_model: input.vehicle,
          notes: "Vehicle description supplied during investigation intake.",
        });
        return { error };
      },
    });
  }

  if (input.location) {
    const location = input.location;
    childWrites.push({
      label: "incident location",
      run: async () => {
        const { error } = await client.from("locations").insert({
          case_id: caseId,
          name: location.name,
          kind: "Incident location",
          latitude: location.latitude,
          longitude: location.longitude,
        });
        return { error };
      },
    });
  }

  if (input.evidence.length) {
    childWrites.push({
      label: "evidence metadata",
      run: async () => {
        const { error } = await client.from("evidence").insert(
          input.evidence.map((item) => ({
            case_id: caseId,
            category: item.category,
            filename: item.label,
            description: [item.description, "Metadata-only record; evidence file storage is not configured."]
              .filter(Boolean)
              .join(" "),
            status: "Indexed",
            storage_path: null,
            mime_type: null,
            latitude: item.latitude,
            longitude: item.longitude,
            collected_at: item.collectedAt,
            uploaded_by: actor.userId,
            uploaded_by_name: actor.name,
          })),
        );
        return { error };
      },
    });
  }

  if (input.witnessNames.length) {
    childWrites.push({
      label: "witnesses",
      run: async () => {
        const { error } = await client.from("witnesses").insert(
          input.witnessNames.map((name) => ({ case_id: caseId, name, descriptors: [] })),
        );
        return { error };
      },
    });
  }

  if (input.weapon) {
    const weapon = input.weapon;
    childWrites.push({
      label: "weapon",
      run: async () => {
        const { error } = await client.from("weapons").insert({
          case_id: caseId,
          weapon_type: weapon,
          description: "Weapon or tool description supplied during investigation intake.",
        });
        return { error };
      },
    });
  }

  const childResults = await Promise.all(
    childWrites.map(async (write) => {
      try {
        return { label: write.label, result: await write.run() };
      } catch (error) {
        return {
          label: write.label,
          result: { error: { message: error instanceof Error ? error.message : "request failed" } },
        };
      }
    }),
  );
  const childFailures = childResults
    .filter(({ result }) => result.error != null)
    .map(({ label, result }) => `${label}: ${result.error?.message ?? "unknown error"}`);

  let auditError: string | null = null;
  try {
    const { error: auditFailure } = await client.from("audit_logs").insert({
      actor_id: actor.userId,
      actor_name: actor.name,
      action_type: "case_creation",
      action: "Created investigation",
      case_id: caseId,
      detail: `Created synthetic investigation ${createdCase.case_no} through authenticated intake.`,
    });
    auditError = auditFailure?.message ?? null;
  } catch (error) {
    auditError = error instanceof Error ? error.message : "Audit request failed.";
  }

  return {
    caseId,
    caseNo: createdCase.case_no,
    childFailures,
    auditError,
  };
}
