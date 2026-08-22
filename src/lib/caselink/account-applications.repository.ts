import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";

const ID_BUCKET = "application-identity-private";
const APPLICATION_AUTH_FLOW_KEY = "caselink.account-application-auth-flow";
const MAX_ID_BYTES = 10 * 1024 * 1024;
const ID_FILE_TYPES = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
} as const;

export type ApplicationRole = Database["public"]["Enums"]["application_role"];
export type ApplicationStatus = Database["public"]["Enums"]["application_status"];
export type AccountApplication = Tables<"account_applications">;

export const ACCOUNT_APPLICATION_SETUP_MESSAGE = "Account application review requires database setup.";

export class AccountApplicationSetupError extends Error {
  constructor() {
    super(ACCOUNT_APPLICATION_SETUP_MESSAGE);
    this.name = "AccountApplicationSetupError";
  }
}

export class AccountApplicationUploadError extends Error {
  constructor(message: string, public readonly cleanupWarning: string | null = null) {
    super(message);
    this.name = "AccountApplicationUploadError";
  }
}

export interface AdministratorAccess {
  userId: string;
  isAdministrator: boolean;
}

const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST205"]);

function isMissingApplicationSchema(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? "";
  return MISSING_SCHEMA_CODES.has(error.code ?? "") ||
    message.includes("account_applications") ||
    message.includes("approval_status") ||
    message.includes("review_account_application") ||
    message.includes("application-identity-private");
}

function repositoryError(error: { code?: string; message?: string }): Error {
  return isMissingApplicationSchema(error)
    ? new AccountApplicationSetupError()
    : new Error(error.message || "The account application request failed.");
}

export async function loadAdministratorAccess(): Promise<AdministratorAccess> {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) throw new Error(authError.message);
  const userId = authData.session?.user.id;
  if (!userId) return { userId: "", isAdministrator: false };

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "administrator")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { userId, isAdministrator: data?.role === "administrator" };
}

export async function listAccountApplications(): Promise<AccountApplication[]> {
  const { data, error } = await supabase
    .from("account_applications")
    .select("*")
    .order("submitted_at", { ascending: false });
  if (error) throw repositoryError(error);
  return data;
}

export async function createApplicationIdUrl(application: AccountApplication): Promise<string> {
  if (!application.official_id_path) throw new Error("No official ID document is attached to this application.");
  const { data, error } = await supabase.storage
    .from(ID_BUCKET)
    .createSignedUrl(application.official_id_path, 300);
  if (error) throw repositoryError(error);
  return data.signedUrl;
}

export type ReviewDecision = "PENDING_ADMIN_APPROVAL" | "VERIFIED_APPROVED" | "REJECTED" | "MORE_INFORMATION_REQUIRED";

export async function reviewAccountApplication(
  application: AccountApplication,
  decision: ReviewDecision,
  notes: string,
): Promise<AccountApplication> {
  const access = await loadAdministratorAccess();
  if (!access.isAdministrator) throw new Error("Administrator access is required.");
  if (application.user_id === access.userId) throw new Error("Administrators cannot review their own application.");
  const trimmedNotes = notes.trim();
  if ((decision === "REJECTED" || decision === "MORE_INFORMATION_REQUIRED") && !trimmedNotes) {
    throw new Error("A review note is required for this decision.");
  }
  const { data, error } = await supabase.rpc("review_account_application", {
    _application_id: application.id,
    _decision: decision,
    _notes: trimmedNotes || null,
  });
  if (error) throw repositoryError(error);
  return data;
}

export interface AccountApplicationInput {
  requestedRole: ApplicationRole;
  fullLegalName: string;
  agencyDepartment: string;
  employeeIdNumber: string;
  workEmail: string;
  contactNumber: string;
  password: string;
  rankDesignation: string;
  serviceStartDate: string;
  specialization: string;
  awards: string[];
  professionalBio: string | null;
  officialId: File;
}

export interface AccountApplicationResult {
  status: ApplicationStatus;
  requiresEmailConfirmation: boolean;
  documentPending: boolean;
}

type AllowedIdMimeType = keyof typeof ID_FILE_TYPES;

function extension(filename: string): string | null {
  const index = filename.lastIndexOf(".");
  return index > 0 && index < filename.length - 1 ? filename.slice(index + 1).toLowerCase() : null;
}

export function validateOfficialIdFile(file: File): { mimeType: AllowedIdMimeType; extension: string } {
  if (!file.size) throw new Error("The selected official ID file is empty.");
  if (file.size > MAX_ID_BYTES) throw new Error("The official ID file must be 10 MB or smaller.");
  if (!(file.type in ID_FILE_TYPES)) throw new Error("Official ID must be a JPEG, PNG, WebP or PDF file.");
  const mimeType = file.type as AllowedIdMimeType;
  const fileExtension = extension(file.name);
  if (!fileExtension || !(ID_FILE_TYPES[mimeType] as readonly string[]).includes(fileExtension)) {
    throw new Error("The official ID filename extension does not match its file type.");
  }
  return { mimeType, extension: fileExtension };
}

function secureUuid(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error("Secure document upload requires HTTPS or localhost. Insecure network HTTP addresses are not supported.");
  }
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error("Secure application identifiers are not supported by this browser.");
  if (typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("Secure application identifiers are not supported by this browser.");
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export async function completePendingApplicationId(file: File): Promise<AccountApplication> {
  const validatedFile = validateOfficialIdFile(file);
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) throw new Error(authError.message);
  const userId = authData.session?.user.id;
  if (!userId) throw new Error("Confirm your email and sign in before completing the ID upload.");

  const application = await loadOwnApplicationStatus();
  if (!application) throw new Error("No account application was found for this authenticated user.");
  if (application.user_id !== userId) throw new Error("The pending application does not belong to this user.");
  if (application.official_id_path && application.official_id_mime_type) return application;
  if (!(["PENDING_DOCUMENT_REVIEW", "MORE_INFORMATION_REQUIRED"] as ApplicationStatus[]).includes(application.status)) {
    throw new Error("This application is not currently accepting an ID document.");
  }

  const storagePath = `applications/${userId}/${secureUuid()}.${validatedFile.extension}`;
  const { error: uploadError } = await supabase.storage.from(ID_BUCKET).upload(storagePath, file, {
    contentType: validatedFile.mimeType,
    upsert: false,
  });
  if (uploadError) throw new Error(`The official ID could not be uploaded: ${uploadError.message}`);

  const { error: attachError } = await supabase.rpc("attach_application_document", {
    _storage_path: storagePath,
    _mime_type: validatedFile.mimeType,
    _original_filename: file.name,
  });
  if (attachError) {
    const { error: cleanupError } = await supabase.storage.from(ID_BUCKET).remove([storagePath]);
    throw new AccountApplicationUploadError(
      `The uploaded ID could not be attached to the application: ${attachError.message}.`,
      cleanupError ? `The newly uploaded unreferenced object could not be removed: ${cleanupError.message}` : null,
    );
  }

  const confirmed = await loadOwnApplicationStatus();
  if (!confirmed?.official_id_path || !confirmed.official_id_mime_type) {
    throw new Error("The document attachment could not be confirmed after upload.");
  }
  return confirmed;
}

export function isAccountApplicationAuthFlowActive(): boolean {
  return typeof window !== "undefined" && window.sessionStorage.getItem(APPLICATION_AUTH_FLOW_KEY) === "active";
}

function setApplicationAuthFlow(active: boolean): void {
  if (typeof window === "undefined") return;
  if (active) window.sessionStorage.setItem(APPLICATION_AUTH_FLOW_KEY, "active");
  else window.sessionStorage.removeItem(APPLICATION_AUTH_FLOW_KEY);
}

export async function submitAccountApplication(input: AccountApplicationInput): Promise<AccountApplicationResult> {
  const validatedFile = validateOfficialIdFile(input.officialId);
  setApplicationAuthFlow(true);
  try {
    const { data, error } = await supabase.auth.signUp({
    email: input.workEmail.trim(),
    password: input.password,
    options: {
      data: {
        caselink_application: true,
        requested_role: input.requestedRole,
        full_legal_name: input.fullLegalName.trim(),
        agency_department: input.agencyDepartment.trim(),
        employee_id_number: input.employeeIdNumber.trim(),
        contact_number: input.contactNumber.trim(),
        rank_designation: input.rankDesignation.trim(),
        service_start_date: input.serviceStartDate,
        specialization: input.specialization.trim(),
        awards: input.awards,
        professional_bio: input.professionalBio?.trim() || null,
      },
    },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("The account application could not be created.");

    if (!data.session) {
      return { status: "PENDING_DOCUMENT_REVIEW", requiresEmailConfirmation: true, documentPending: true };
    }

    const storagePath = `applications/${data.user.id}/${secureUuid()}.${validatedFile.extension}`;
    const { error: uploadError } = await supabase.storage.from(ID_BUCKET).upload(storagePath, input.officialId, { contentType: validatedFile.mimeType, upsert: false });
    if (uploadError) {
      await supabase.auth.signOut();
      throw new Error(`Your application was recorded, but the official ID could not be uploaded: ${uploadError.message}`);
    }

    const { error: attachError } = await supabase.rpc("attach_application_document", { _storage_path: storagePath, _mime_type: validatedFile.mimeType, _original_filename: input.officialId.name });
    if (attachError) {
      const { error: cleanupError } = await supabase.storage.from(ID_BUCKET).remove([storagePath]);
      await supabase.auth.signOut();
      throw new AccountApplicationUploadError(
        `Your application was recorded, but its official ID could not be attached: ${attachError.message}.`,
        cleanupError ? `The newly uploaded unreferenced object could not be removed: ${cleanupError.message}` : null,
      );
    }

    const confirmed = await loadOwnApplicationStatus();
    if (!confirmed?.official_id_path || !confirmed.official_id_mime_type) {
      await supabase.auth.signOut();
      throw new Error("The official ID attachment could not be confirmed. The application remains pending review.");
    }

    await supabase.auth.signOut();
    return { status: confirmed.status, requiresEmailConfirmation: false, documentPending: false };
  } finally {
    setApplicationAuthFlow(false);
  }
}

export async function loadOwnApplicationStatus(): Promise<AccountApplication | null> {
  const { data, error } = await supabase.from("account_applications").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export function applicationStatusMessage(status: ApplicationStatus): string {
  const messages: Record<ApplicationStatus, string> = {
    PENDING_DOCUMENT_REVIEW: "Your application is pending document review.",
    PENDING_ADMIN_APPROVAL: "Your identity document is awaiting administrator approval.",
    VERIFIED_APPROVED: "Your application is verified and approved. Sign in using the approved role.",
    FAILED: "Verification failed. CASELINK access has not been activated.",
    REJECTED: "Your application was rejected. CASELINK access has not been activated.",
    MORE_INFORMATION_REQUIRED: "More information is required before your application can be reviewed.",
  };
  return messages[status];
}
