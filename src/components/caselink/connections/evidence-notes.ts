import type { Evidence, Investigation } from "@/lib/caselink/types";

export const NOTE_CATEGORIES = [
  "Modus Operandi",
  "Vehicle",
  "Location",
  "Date and Time",
  "Weapon",
  "Person or Witness",
  "CCTV",
  "Other Evidence",
] as const;

export type EvidenceNoteCategory = (typeof NOTE_CATEGORIES)[number];

export interface CaseEvidenceNote {
  category: EvidenceNoteCategory;
  title: string;
  summary: string[];
  details: string[];
  recorded: boolean;
}

export interface SelectedBoardNote {
  caseId: string;
  note: CaseEvidenceNote;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function evidenceDetails(records: Evidence[]): string[] {
  return unique(records.flatMap((record) => [record.label, record.details, record.locationName]));
}

function note(category: EvidenceNoteCategory, values: string[], title: string = category): CaseEvidenceNote {
  const recorded = values.length > 0;
  return {
    category,
    title,
    summary: recorded ? values.slice(0, 2) : ["Not recorded"],
    details: recorded ? values : ["Not recorded"],
    recorded,
  };
}

export function buildCaseEvidenceNotes(investigation: Investigation): CaseEvidenceNote[] {
  const modusOperandi = unique(investigation.modusOperandi?.split(";") ?? []);
  const locations = unique([
    investigation.lastKnownLocation,
    ...investigation.evidence.map((record) => record.locationName),
  ]);
  const dateTime = Number.isNaN(Date.parse(investigation.incidentDate))
    ? []
    : [new Date(investigation.incidentDate).toLocaleString()];
  const people = unique([
    investigation.subject.name,
    ...investigation.subject.aliases.map((alias) => `Alias: ${alias}`),
    ...investigation.witnesses.map((witness) => `Witness: ${witness}`),
  ]);
  const cctv = investigation.evidence.filter((record) => record.recordKind === "cctv" || record.type === "CCTV");
  const other = investigation.evidence.filter((record) => record.recordKind !== "cctv" && record.type !== "CCTV");
  const otherTitle = other.length > 0 && other.every((record) => record.type === "Photo")
    ? "Photo Evidence"
    : "Other Evidence";

  return [
    note("Modus Operandi", modusOperandi),
    note("Vehicle", unique([investigation.subject.vehicle])),
    note("Location", locations),
    note("Date and Time", dateTime),
    note("Weapon", unique([investigation.weapon])),
    note("Person or Witness", people),
    note("CCTV", evidenceDetails(cctv)),
    note("Other Evidence", evidenceDetails(other), otherTitle),
  ];
}

export function factorNoteCategory(factorName: string): EvidenceNoteCategory | null {
  const normalized = factorName.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
  switch (normalized) {
    case "modus operandi": return "Modus Operandi";
    case "vehicle": return "Vehicle";
    case "location": return "Location";
    case "time":
    case "date and time": return "Date and Time";
    case "weapon": return "Weapon";
    case "witness":
    case "persons":
    case "witness / persons": return "Person or Witness";
    case "cctv": return "CCTV";
    case "other identifiers": return "Other Evidence";
    default: return null;
  }
}
