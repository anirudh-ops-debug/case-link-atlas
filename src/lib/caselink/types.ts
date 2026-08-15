export type CaseType =
  | "Missing Person"
  | "Burglary"
  | "Theft"
  | "Assault"
  | "Vehicle Crime";

export type Priority = "Critical" | "High" | "Medium" | "Low";

export type CaseStatus = "Active" | "Under Review" | "Escalated" | "Closed";

export type EvidenceType =
  | "CCTV"
  | "Witness"
  | "Phone"
  | "Photo"
  | "Transport"
  | "Location";

export type EvidenceStage = "PROCESSING" | "INDEXED" | "CORRELATED";

export interface Evidence {
  id: string;
  caseId: string;
  type: EvidenceType;
  label: string;
  source: string;
  timestamp: string; // ISO
  locationName: string;
  lat: number;
  lng: number;
  reliability: number; // 0-100
  details: string;
  interpretation: string;
  keywords: string[];
  stage: EvidenceStage;
}

export interface Subject {
  name: string;
  aliases: string[];
  age?: number;
  phone?: string;
  vehicle?: string;
  description?: string;
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
  modusOperandi?: string;
  weapon?: string;
  witnesses: string[];
  officer: string;
  createdAt: string;
  evidence: Evidence[];
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
  reasons: LinkReason[];
  sharedAttributes: string[];
  explanation: string;
  sharedEvidenceIds: string[];
}
