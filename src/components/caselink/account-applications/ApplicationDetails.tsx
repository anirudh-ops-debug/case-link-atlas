import { useMemo, useState } from "react";
import { toast } from "sonner";

import { OfficialIdViewer } from "@/components/caselink/account-applications/OfficialIdViewer";
import { Chip, SectionTitle } from "@/components/caselink/bits";
import { reviewAccountApplication, type AccountApplication, type ReviewDecision } from "@/lib/caselink/account-applications.repository";

function yearsSince(date: string): string {
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime()) || start > new Date()) return "Not available";
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  if (now < new Date(now.getFullYear(), start.getMonth(), start.getDate())) years -= 1;
  return `${Math.max(0, years)} year${years === 1 ? "" : "s"}`;
}

function maskedEmployeeId(value: string): string {
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

export function ApplicationDetails({ application, currentUserId, onUpdated }: { application: AccountApplication; currentUserId: string; onUpdated: () => Promise<void> }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<ReviewDecision | null>(null);
  const selfReview = application.user_id === currentUserId;
  const documentReview = application.status === "PENDING_DOCUMENT_REVIEW";
  const roleReview = application.status === "PENDING_ADMIN_APPROVAL";
  const reviewable = documentReview || roleReview || application.status === "MORE_INFORMATION_REQUIRED";
  const fields = useMemo(() => [
    ["Full legal name", application.full_legal_name], ["Work email", application.work_email],
    ["Contact number", application.contact_number], ["Requested role", application.requested_role.replaceAll("_", " ")],
    ["Agency/department", application.agency_department], ["Employee/work ID", maskedEmployeeId(application.employee_id_number)],
    ["Rank/designation", application.rank_designation], ["Service start date", new Date(`${application.service_start_date}T00:00:00`).toLocaleDateString()],
    ["Calculated experience", yearsSince(application.service_start_date)], ["Specialization", application.specialization],
    ["Awards/recognitions", application.awards.length ? application.awards.join(", ") : "Not recorded"],
    ["Submitted", new Date(application.submitted_at).toLocaleString()], ["Verification status", application.status.replaceAll("_", " ")],
  ], [application]);

  async function submit(decision: ReviewDecision) {
    if (decision === "VERIFIED_APPROVED" && !window.confirm(`Approve ${application.full_legal_name} for the stored ${application.requested_role.replaceAll("_", " ")} role?`)) return;
    if ((decision === "REJECTED" || decision === "MORE_INFORMATION_REQUIRED") && !notes.trim()) { toast.error("Enter a review note first."); return; }
    if (decision === "REJECTED" && !window.confirm(`Reject ${application.full_legal_name}'s account application? Existing roles, if any, will be preserved.`)) return;
    setPending(decision);
    try {
      await reviewAccountApplication(application, decision, notes);
      toast.success(decision === "PENDING_ADMIN_APPROVAL" ? "Document accepted for role review." : decision === "VERIFIED_APPROVED" ? "Application approved." : decision === "REJECTED" ? "Application rejected." : "More information requested.");
      setNotes("");
      await onUpdated();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Review action failed."); }
    finally { setPending(null); }
  }

  return <section className="panel overflow-hidden">
    <SectionTitle right={<Chip tone={application.status === "VERIFIED_APPROVED" ? "success" : "amber"}>{application.status.replaceAll("_", " ")}</Chip>}>Application details</SectionTitle>
    <dl className="grid gap-px bg-border/50 sm:grid-cols-2">
      {fields.map(([label, value]) => <div key={label} className="bg-background/90 p-3"><dt className="label-xs">{label}</dt><dd className="mt-1 text-sm capitalize">{value}</dd></div>)}
      <div className="bg-background/90 p-3 sm:col-span-2"><dt className="label-xs">Professional biography</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{application.professional_bio || "Not recorded"}</dd></div>
      <div className="bg-background/90 p-3 sm:col-span-2"><dt className="label-xs">Safe review history</dt><dd className="mt-1 text-sm">{application.reviewed_at ? `${new Date(application.reviewed_at).toLocaleString()} · ${application.review_notes || "No review note recorded"}` : "No completed review recorded."}</dd></div>
    </dl>
    <div className="space-y-3 border-t border-border p-3">
      <button type="button" disabled={!application.official_id_path} onClick={() => setViewerOpen(true)} className="rounded border border-cyan/50 px-3 py-2 text-sm text-cyan disabled:opacity-40">View ID</button>
      <label className="block space-y-1"><span className="label-xs">Review note</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} className="w-full rounded border border-input bg-background p-2 text-sm" /></label>
      {selfReview ? <p className="text-sm text-danger">Administrators cannot review their own application.</p> : null}
      <div className="flex flex-wrap gap-2">
        {documentReview ? <button type="button" disabled={selfReview || pending !== null || !application.official_id_path || !application.official_id_mime_type} onClick={() => void submit("PENDING_ADMIN_APPROVAL")} className="rounded border border-cyan/50 bg-cyan/10 px-3 py-2 text-sm text-cyan disabled:opacity-40">Accept document for role review</button> : null}
        {roleReview ? <button type="button" disabled={selfReview || pending !== null} onClick={() => void submit("VERIFIED_APPROVED")} className="rounded border border-success/50 bg-success/10 px-3 py-2 text-sm text-success disabled:opacity-40">Approve requested role</button> : null}
        <button type="button" disabled={!reviewable || selfReview || pending !== null || !notes.trim()} onClick={() => void submit("REJECTED")} className="rounded border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger disabled:opacity-40">Reject</button>
        <button type="button" disabled={!reviewable || selfReview || pending !== null || !notes.trim()} onClick={() => void submit("MORE_INFORMATION_REQUIRED")} className="rounded border border-amber/50 bg-amber/10 px-3 py-2 text-sm text-amber disabled:opacity-40">Request more information</button>
      </div>
      <p className="text-[11px] text-muted-foreground">Approval, rejection and information requests are database-authoritative. The corrected RPC preserves existing roles and records every decision in the audit log.</p>
    </div>
    <OfficialIdViewer application={application} open={viewerOpen} onOpenChange={setViewerOpen} />
  </section>;
}
