export type CaseType = string;

export type Priority = "Critical" | "High" | "Medium" | "Low";

export type CaseStatus = "Active" | "Under Review" | "Escalated" | "Dormant" | "Closed";

export type EvidenceType =
  | "CCTV"
  | "Witness"
  | "Phone"
  | "Photo"
  | "Transport"
  | "Location"
  | "Other";

export type EvidenceStage = "PROCESSING" | "INDEXED" | "CORRELATED";

export interface Evidence {
  id: string;
  caseId: string;
  type: EvidenceType;
  label: string;
  source: string;
  timestamp: string; // ISO
  locationName: string;
  lat: number | null;
  lng: number | null;
  reliability: number | null; // 0-100 when recorded
  details: string;
  interpretation: string;
  keywords: string[];
  stage: EvidenceStage | string;
  recordKind?: "evidence" | "cctv" | "timeline";
  relatedEvidenceId?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  originalFilename?: string | null;
  checksumSha256?: string | null;
  withdrawnAt?: string | null;
  withdrawalReason?: string | null;
}

export interface Subject {
  name: string;
  aliases: string[];
  age?: number | undefined;
  phone?: string | undefined;
  vehicle?: string | undefined;
  description?: string | undefined;
}

export interface Investigation {
  id: string;
  code: string;
  title: string;
  type: CaseType;
  priority: Priority;
  status: CaseStatus;
  subject: Subject;
  incidentDate: string; // ISO
  lastKnownLocation: string;
  district: string;
  notes: string;
  modusOperandi?: string | undefined;
  weapon?: string | undefined;
  witnesses: string[];
  officer: string;
  assignedInvestigatorId?: string | undefined;
  createdAt: string;
  evidence: Evidence[];
  isDatabaseBacked?: boolean;
}

export type Verdict = "pending" | "confirmed" | "rejected" | "more-evidence";

export interface LinkReason {
  factor: string;
  detail: string;
  weight: number;
}

export interface CaseLink {
  id: string;
  aId: string;
  bId: string;
  confidence: number;
  databaseVerdict?: "pending" | "confirmed" | "rejected" | "inconclusive";
  reasons: LinkReason[];
  sharedAttributes: string[];
  explanation: string;
  sharedEvidenceIds: string[];
}

export interface IntelligenceAlert {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  caseId: string | null;
  connectionId: string | null;
  createdAt: string;
}

/* ---------------------------------------------------------------
 * Access control (module 14)
 * Roles are coarse; permissions are what the UI actually checks.
 * ------------------------------------------------------------- */
export type Role = "ADMIN" | "SUPERVISOR" | "INVESTIGATOR" | "ANALYST" | "VIEWER";

export type Permission =
  | "case.read"
  | "case.write"
  | "evidence.write"
  | "link.verify"
  | "audit.read"
  | "admin";

/* Audit trail (module 15) — append-only in the UI. */
export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  role: Role;
  action: string;
  subject: string;
  detail: string;
}

/* Double Verify (module 8) — an independent second pass over a link. */
export type EvidenceLayer = "AI INFERENCE" | "DIRECT EVIDENCE" | "INVESTIGATOR CONFIRMED";

export interface VerifyCheck {
  id: string;
  label: string;
  layer: EvidenceLayer;
  status: "SUPPORTED" | "PARTIAL" | "UNSUPPORTED";
  strength: "Weak" | "Moderate" | "Stronger" | "Strong";
  detail: string;
  sources: string[];
}
