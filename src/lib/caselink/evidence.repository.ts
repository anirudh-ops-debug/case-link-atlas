import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";

const EVIDENCE_BUCKET = "evidence-private";
const PREVIEW_URL_LIFETIME_SECONDS = 5 * 60;
const DOWNLOAD_URL_LIFETIME_SECONDS = 60;
const MEGABYTE = 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_PATH_PATTERN = /^cases\/([0-9a-f-]{36})\/evidence\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.([a-z0-9]+)$/i;

type EvidenceRow = Tables<"evidence">;
type CaseRow = Tables<"cases">;
type PersonRow = Tables<"persons">;
type EvidenceCasePerson = Pick<
  PersonRow,
  "case_id" | "full_name" | "role_in_case"
>;
type AppRole = Database["public"]["Enums"]["app_role"];

type EvidenceFileCategory = "image" | "document" | "video";

export type AllowedEvidenceMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "video/mp4"
  | "video/webm"
  | "video/quicktime"
  | "application/pdf"
  | "text/plain"
  | "text/csv"
  | "application/msword"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface EvidenceFileRule {
  category: EvidenceFileCategory;
  extensions: readonly string[];
  storageExtension: string;
  maximumBytes: number;
}

const FILE_RULES: Readonly<Record<AllowedEvidenceMimeType, EvidenceFileRule>> = {
  "image/jpeg": { category: "image", extensions: ["jpg", "jpeg"], storageExtension: "jpg", maximumBytes: 15 * MEGABYTE },
  "image/png": { category: "image", extensions: ["png"], storageExtension: "png", maximumBytes: 15 * MEGABYTE },
  "image/webp": { category: "image", extensions: ["webp"], storageExtension: "webp", maximumBytes: 15 * MEGABYTE },
  "video/mp4": { category: "video", extensions: ["mp4"], storageExtension: "mp4", maximumBytes: 50 * MEGABYTE },
  "video/webm": { category: "video", extensions: ["webm"], storageExtension: "webm", maximumBytes: 50 * MEGABYTE },
  "video/quicktime": { category: "video", extensions: ["mov"], storageExtension: "mov", maximumBytes: 50 * MEGABYTE },
  "application/pdf": { category: "document", extensions: ["pdf"], storageExtension: "pdf", maximumBytes: 25 * MEGABYTE },
  "text/plain": { category: "document", extensions: ["txt"], storageExtension: "txt", maximumBytes: 25 * MEGABYTE },
  "text/csv": { category: "document", extensions: ["csv"], storageExtension: "csv", maximumBytes: 25 * MEGABYTE },
  "application/msword": { category: "document", extensions: ["doc"], storageExtension: "doc", maximumBytes: 25 * MEGABYTE },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    category: "document",
    extensions: ["docx"],
    storageExtension: "docx",
    maximumBytes: 25 * MEGABYTE,
  },
};

const VERIFIED_ROLES: readonly AppRole[] = ["investigator", "senior_investigator", "administrator"];

export interface ValidatedEvidenceFile {
  category: EvidenceFileCategory;
  extension: string;
  mimeType: AllowedEvidenceMimeType;
  maximumBytes: number;
}

export interface UploadEvidenceFileInput {
  caseId: string;
  category: string;
  displayLabel: string;
  description?: string | null;
  collectedAt?: string | null;
  file: File;
  onStage?: (stage: EvidenceUploadStage) => void;
  isCancelled?: () => boolean;
}

export interface UploadedEvidenceFile {
  evidence: EvidenceRow;
  auditWarning: string | null;
}

export type EvidenceUploadStage =
  | "Validating file"
  | "Calculating integrity checksum"
  | "Uploading private file"
  | "Saving evidence record"
  | "Complete";

export interface EvidenceCaseSummary {
  id: string;
  caseNumber: string;
  title: string;
  primarySubject: string | null;
  status: CaseRow["status"];
  investigatorName: string | null;
  evidence: EvidenceRow[];
}

export interface EvidenceAccess {
  userId: string;
  canUpload: boolean;
  canRestore: boolean;
}

export class EvidenceUploadError extends Error {
  readonly orphanCleanupWarning: string | null;

  constructor(message: string, orphanCleanupWarning: string | null = null) {
    super(message);
    this.name = "EvidenceUploadError";
    this.orphanCleanupWarning = orphanCleanupWarning;
  }
}

function isAllowedMimeType(mimeType: string): mimeType is AllowedEvidenceMimeType {
  return Object.prototype.hasOwnProperty.call(FILE_RULES, mimeType);
}

function fileExtension(filename: string): string | null {
  const separator = filename.lastIndexOf(".");
  if (separator <= 0 || separator === filename.length - 1) return null;
  return filename.slice(separator + 1).toLowerCase();
}

function formatMegabytes(bytes: number): string {
  return `${bytes / MEGABYTE} MB`;
}

export function validateEvidenceFile(file: File): ValidatedEvidenceFile {
  if (file.size <= 0) throw new Error("The selected file is empty.");
  if (!file.name.trim()) throw new Error("The selected file must have a filename.");
  if (!isAllowedMimeType(file.type)) {
    throw new Error("This file type is not supported. Upload a JPEG, PNG, WebP, MP4, WebM, MOV, PDF, TXT, CSV, DOC or DOCX file.");
  }

  const rule = FILE_RULES[file.type];
  const extension = fileExtension(file.name);
  if (!extension || !rule.extensions.includes(extension)) {
    throw new Error(`The .${extension ?? "unknown"} filename extension does not match the reported ${file.type} file type.`);
  }
  if (file.size > rule.maximumBytes) {
    throw new Error(`This ${rule.category} file exceeds the ${formatMegabytes(rule.maximumBytes)} limit.`);
  }

  return {
    category: rule.category,
    extension: rule.storageExtension,
    mimeType: file.type,
    maximumBytes: rule.maximumBytes,
  };
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a valid UUID.`);
}

function assertStoragePath(storagePath: string): void {
  const match = STORAGE_PATH_PATTERN.exec(storagePath);
  if (!match || !match[1] || !match[2] || !match[3]) {
    throw new Error("The evidence storage path is invalid.");
  }
  assertUuid(match[1], "Storage case ID");
  assertUuid(match[2], "Storage evidence ID");
  assertUuid(match[3], "Storage object ID");
}

async function requireSession(): Promise<Session> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Unable to verify the authenticated session: ${error.message}`);
  if (!data.session) throw new Error("You must be signed in to manage evidence files.");
  return data.session;
}

async function requireVerifiedActor(): Promise<{ userId: string; name: string }> {
  const session = await requireSession();
  const userId = session.user.id;
  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (profileResult.error) throw new Error(`Unable to load your verified profile: ${profileResult.error.message}`);
  if (!profileResult.data) throw new Error("Your authenticated account does not have a CASELINK profile.");
  if (rolesResult.error) throw new Error(`Unable to verify your assigned role: ${rolesResult.error.message}`);
  if (!rolesResult.data.some(({ role }) => VERIFIED_ROLES.includes(role))) {
    throw new Error("Your account does not have a verified CASELINK role.");
  }

  return { userId, name: profileResult.data.full_name };
}

export async function getEvidenceAccess(): Promise<EvidenceAccess> {
  const session = await requireSession();
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
  if (error) throw new Error(`Unable to verify your assigned role: ${error.message}`);
  const roles = data?.map(({ role }) => role) ?? [];
  return {
    userId: session.user.id,
    canUpload: roles.some((role) => VERIFIED_ROLES.includes(role)),
    canRestore: roles.includes("senior_investigator") || roles.includes("administrator"),
  };
}

export async function loadEvidenceCaseSummaries(): Promise<EvidenceCaseSummary[]> {
  const [casesResult, personsResult, evidenceResult, profilesResult] = await Promise.all([
    supabase.from("cases").select("id, case_no, title, status, investigator_id").order("occurred_at", { ascending: false }),
    supabase.from("persons").select("case_id, full_name, role_in_case"),
    supabase.from("evidence").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const failed = [casesResult, personsResult, evidenceResult, profilesResult].find((result) => result.error)?.error;
  if (failed) throw new Error(failed.message);

  const personsByCase = new Map<string, EvidenceCasePerson[]>();
  for (const person of personsResult.data ?? []) {
    personsByCase.set(person.case_id, [...(personsByCase.get(person.case_id) ?? []), person]);
  }
  const evidenceByCase = new Map<string, EvidenceRow[]>();
  for (const evidence of evidenceResult.data ?? []) {
    evidenceByCase.set(evidence.case_id, [...(evidenceByCase.get(evidence.case_id) ?? []), evidence]);
  }
  const investigatorNames = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name.trim() || "Name not recorded"]));

  return (casesResult.data ?? []).map((caseRow) => {
    const persons = personsByCase.get(caseRow.id) ?? [];
    const subject = persons.find((person) => person.role_in_case?.toLowerCase() === "subject") ?? persons[0];
    return {
      id: caseRow.id,
      caseNumber: caseRow.case_no,
      title: caseRow.title,
      primarySubject: subject?.full_name ?? null,
      status: caseRow.status,
      investigatorName: caseRow.investigator_id ? investigatorNames.get(caseRow.investigator_id) ?? "Name not recorded" : null,
      evidence: evidenceByCase.get(caseRow.id) ?? [],
    };
  });
}

export async function loadEvidenceForCase(caseId: string): Promise<EvidenceRow[]> {
  assertUuid(caseId, "Case ID");
  const { data, error } = await supabase
    .from("evidence")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function sha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure file checksums are not supported by this browser.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function attemptOrphanCleanup(storagePath: string): Promise<string | null> {
  try {
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove([storagePath]);
    return error ? `The uploaded object could not be cleaned up automatically: ${error.message}` : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cleanup error";
    return `The uploaded object could not be cleaned up automatically: ${message}`;
  }
}

export async function uploadEvidenceFile(input: UploadEvidenceFileInput): Promise<UploadedEvidenceFile> {
  assertUuid(input.caseId, "Case ID");
  input.onStage?.("Validating file");
  const validated = validateEvidenceFile(input.file);
  const category = requiredText(input.category, "Evidence category");
  const displayLabel = requiredText(input.displayLabel, "Evidence display label");
  const actor = await requireVerifiedActor();

  if (!globalThis.crypto?.randomUUID) throw new Error("Secure evidence identifiers are not supported by this browser.");
  const evidenceId = globalThis.crypto.randomUUID();
  const objectUuid = globalThis.crypto.randomUUID();
  const storagePath = `cases/${input.caseId}/evidence/${evidenceId}/${objectUuid}.${validated.extension}`;
  input.onStage?.("Calculating integrity checksum");
  const checksum = await sha256(input.file);
  if (input.isCancelled?.()) throw new Error("Evidence upload canceled.");

  input.onStage?.("Uploading private file");
  const { error: uploadError } = await supabase.storage.from(EVIDENCE_BUCKET).upload(storagePath, input.file, {
    contentType: validated.mimeType,
    upsert: false,
  });
  if (uploadError) throw new EvidenceUploadError(`Evidence file upload failed: ${uploadError.message}`);

  const metadata: TablesInsert<"evidence"> = {
    id: evidenceId,
    case_id: input.caseId,
    category,
    filename: displayLabel,
    description: optionalText(input.description),
    storage_path: storagePath,
    mime_type: validated.mimeType,
    file_size_bytes: input.file.size,
    original_filename: input.file.name,
    checksum_sha256: checksum,
    uploaded_by: actor.userId,
    uploaded_by_name: actor.name,
    status: "Indexed",
    collected_at: input.collectedAt ?? null,
  };
  input.onStage?.("Saving evidence record");
  const { data, error: metadataError } = await supabase.from("evidence").insert(metadata).select("*").single();
  if (metadataError) {
    const cleanupWarning = await attemptOrphanCleanup(storagePath);
    throw new EvidenceUploadError(`Evidence metadata could not be saved: ${metadataError.message}`, cleanupWarning);
  }

  let auditWarning: string | null = null;
  try {
    const { error } = await supabase.from("audit_logs").insert({
      actor_id: actor.userId,
      actor_name: actor.name,
      action_type: "evidence_upload",
      action: "Uploaded evidence",
      case_id: input.caseId,
      detail: `Uploaded evidence record ${data.id}.`,
    });
    auditWarning = error?.message ?? null;
  } catch (error) {
    auditWarning = error instanceof Error ? error.message : "Audit request failed.";
  }
  input.onStage?.("Complete");
  return { evidence: data, auditWarning };
}

async function createSignedEvidenceUrl(storagePath: string, expiresIn: number, download?: string): Promise<string> {
  await requireSession();
  assertStoragePath(storagePath);
  const options = download ? { download } : undefined;
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(storagePath, expiresIn, options);
  if (error) throw new Error(`Unable to create a private evidence link: ${error.message}`);
  return data.signedUrl;
}

export function createEvidencePreviewUrl(storagePath: string): Promise<string> {
  return createSignedEvidenceUrl(storagePath, PREVIEW_URL_LIFETIME_SECONDS);
}

export function createEvidenceDownloadUrl(storagePath: string, originalFilename: string): Promise<string> {
  const safeFilename = originalFilename.trim().replace(/[\\/\r\n\0]/g, "_");
  if (!safeFilename) throw new Error("The original evidence filename is unavailable.");
  return createSignedEvidenceUrl(storagePath, DOWNLOAD_URL_LIFETIME_SECONDS, safeFilename);
}

export async function withdrawEvidence(evidenceId: string, reason: string): Promise<EvidenceRow> {
  assertUuid(evidenceId, "Evidence ID");
  const trimmedReason = reason.trim();
  if (!trimmedReason || trimmedReason.length > 1_000) {
    throw new Error("Withdrawal reason must contain between 1 and 1,000 characters.");
  }
  await requireSession();
  const { data, error } = await supabase.rpc("withdraw_evidence", {
    _evidence_id: evidenceId,
    _reason: trimmedReason,
  });
  if (error) throw new Error(`Evidence could not be withdrawn: ${error.message}`);
  return data;
}

export async function restoreEvidence(evidenceId: string): Promise<EvidenceRow> {
  assertUuid(evidenceId, "Evidence ID");
  await requireSession();
  const { data, error } = await supabase.rpc("restore_evidence", { _evidence_id: evidenceId });
  if (error) throw new Error(`Evidence could not be restored: ${error.message}`);
  return data;
}
