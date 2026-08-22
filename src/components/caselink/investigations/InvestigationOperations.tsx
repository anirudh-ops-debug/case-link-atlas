import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SectionTitle, fmtDateTime } from "@/components/caselink/bits";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { assignCaseInvestigator, changeInvestigationStatus, loadEligibleInvestigators, loadInvestigationWorkspace, type EligibleInvestigator, type InvestigationWorkspaceRecord } from "@/lib/caselink/investigations.repository";
import { useCaseLink } from "@/lib/caselink/store";

type DetailPanel = "status" | "investigator" | null;
type TargetStatus = "Active" | "Dormant" | "Closed";

function yearsSince(value: string | null): string {
  if (!value) return "Not recorded";
  const start = new Date(value); const now = new Date();
  if (Number.isNaN(start.getTime()) || start > now) return "Not recorded";
  let years = now.getFullYear() - start.getFullYear();
  if (now.getMonth() < start.getMonth() || (now.getMonth() === start.getMonth() && now.getDate() < start.getDate())) years -= 1;
  return `${years} year${years === 1 ? "" : "s"}`;
}

export function InvestigationOperations({ caseId }: { caseId: string }) {
  const { session, retryCases } = useCaseLink();
  const [workspace, setWorkspace] = useState<InvestigationWorkspaceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [panel, setPanel] = useState<DetailPanel>(null);
  const [eligible, setEligible] = useState<EligibleInvestigator[]>([]);
  const [selectedInvestigatorId, setSelectedInvestigatorId] = useState("");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const next = await loadInvestigationWorkspace(supabase, caseId);
      setWorkspace(next); setSelectedInvestigatorId(next.investigatorId ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The case progress could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [caseId]);
  useEffect(() => { if (panel === "investigator") void loadEligibleInvestigators(supabase).then(setEligible).catch((cause) => setActionError(cause instanceof Error ? cause.message : "Investigators could not be loaded.")); }, [panel]);

  const assignable = useMemo(() => eligible.filter((person) => {
    if (!workspace) return false;
    if ((workspace.priority === "High" || workspace.priority === "Critical") && !person.roles.includes("senior_investigator")) return false;
    if (session?.role === "INVESTIGATOR") return person.id === session.userId;
    return session?.role === "SUPERVISOR" || session?.role === "ADMIN";
  }), [eligible, session, workspace]);

  async function refresh() { await load(); retryCases(); }
  async function updateStatus(target: TargetStatus) {
    if (processing) return;
    if (target === "Closed" && !window.confirm("Close this investigation? Closing is an auditable status change and does not delete case data.")) return;
    setProcessing(true); setActionError(null);
    try { await changeInvestigationStatus(supabase, caseId, target); await refresh(); setPanel(null); toast.success(`Investigation status changed to ${target}.`); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "The status could not be changed."); }
    finally { setProcessing(false); }
  }
  async function reassign() {
    if (processing || !selectedInvestigatorId || selectedInvestigatorId === workspace?.investigatorId) return;
    const selected = assignable.find((person) => person.id === selectedInvestigatorId);
    if (!selected || !window.confirm(`Assign this investigation to ${selected.fullName}?`)) return;
    setProcessing(true); setActionError(null);
    try { await assignCaseInvestigator(supabase, caseId, selected.id); await refresh(); setPanel(null); toast.success(`Investigation assigned to ${selected.fullName}.`); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "The investigator could not be assigned."); }
    finally { setProcessing(false); }
  }

  if (loading) return <section className="panel mb-3 p-4 font-mono text-[11px] text-muted-foreground">Loading case progress…</section>;
  if (error) return <section className="panel mb-3 p-4"><p className="font-mono text-[11px] text-danger">{error}</p><button type="button" onClick={() => void load()} className="mt-2 font-mono text-[10px] uppercase text-cyan">Retry</button></section>;
  if (!workspace) return null;
  const investigator = workspace.investigator;
  const canWrite = session?.role === "INVESTIGATOR" || session?.role === "SUPERVISOR" || session?.role === "ADMIN";
  const canReactivateClosed = session?.role === "SUPERVISOR" || session?.role === "ADMIN";
  return <section className="panel mb-3 p-3">
    <SectionTitle>Case progress</SectionTitle>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <ProgressItem label="Current status" value={workspace.status} {...(canWrite ? { onClick: () => { setActionError(null); setPanel("status"); } } : {})} />
      <ProgressItem label="Assigned investigator" value={investigator?.fullName ?? "Name not recorded"} detail={investigator ? [investigator.rankDesignation, investigator.unit].filter(Boolean).join(" · ") || "Professional profile details not yet recorded" : "Investigator not assigned"} onClick={() => { setActionError(null); setPanel("investigator"); }} />
      <ProgressItem label="Last case update" value={fmtDateTime(workspace.updatedAt)} />
      <Link to="/evidence" search={{ case: caseId, upload: false }} aria-label="Open Evidence Management for this investigation" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"><ProgressItem label="Evidence" value={workspace.evidenceCount ? `${workspace.evidenceCount} record(s)` : "No evidence recorded"} detail={workspace.mostRecentEvidenceAt ? `Latest: ${fmtDateTime(workspace.mostRecentEvidenceAt)}` : "No recorded evidence date"} interactive /></Link>
      <ProgressItem label="Latest activity" value={workspace.latestActivity?.title ?? "No recent activity"} {...(workspace.latestActivity ? { detail: fmtDateTime(workspace.latestActivity.occurredAt) } : {})} />
      <ProgressItem label="Meaningful connections" value={workspace.meaningfulLeadCount ? String(workspace.meaningfulLeadCount) : "No meaningful connections"} detail="Stored case connections at or above 60%" />
      <ProgressItem label="Theories" value="No recorded theories" detail="Database persistence is not yet available." />
    </div>
    <Dialog open={panel !== null} onOpenChange={(open) => { if (!open && !processing) setPanel(null); }}><DialogContent>
      <DialogHeader><DialogTitle>{panel === "investigator" ? "Assigned investigator" : "Case status"}</DialogTitle><DialogDescription>{panel === "investigator" ? "Recorded professional profile and secure assignment controls." : "Database-authorized investigation workflow actions."}</DialogDescription></DialogHeader>
      {actionError ? <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{actionError}</p> : null}
      {panel === "investigator" ? <div className="space-y-4">
        {investigator ? <dl className="grid gap-3 text-sm sm:grid-cols-2">{[["Full name", investigator.fullName], ["Approved role", investigator.approvedRole], ["Contact number", investigator.contactNumber], ["Rank/designation", investigator.rankDesignation], ["Unit", investigator.unit], ["Agency/department", investigator.agency], ["Service start date", investigator.serviceStartDate], ["Experience", yearsSince(investigator.serviceStartDate)], ["Specialization", investigator.specialization], ["Awards", investigator.awards.length ? investigator.awards.join(", ") : null], ["Professional biography", investigator.professionalBio], ["Cases assigned", String(investigator.assignedCaseCount)]].map(([label, value]) => <div key={label}><dt className="label-xs">{label}</dt><dd className="mt-1">{value || "Not recorded"}</dd></div>)}</dl> : <p>Investigator not assigned.</p>}
        {canWrite ? <div className="border-t pt-4"><label className="label-xs" htmlFor="case-assignee">Change Assigned Investigator</label><select id="case-assignee" value={selectedInvestigatorId} onChange={(event) => setSelectedInvestigatorId(event.target.value)} className="mt-2 w-full rounded-md border bg-background p-2 text-sm"><option value="">Select an eligible investigator</option>{assignable.map((person) => <option key={person.id} value={person.id}>{person.fullName} — {person.roles.map((role) => role === "senior_investigator" ? "Senior Investigator" : "Investigator").join(", ")} · {[person.rankDesignation, person.unitOrAgency].filter(Boolean).join(" · ") || "Professional details not recorded"} · {person.activeCaseCount} active case{person.activeCaseCount === 1 ? "" : "s"}</option>)}</select><button type="button" disabled={processing || !selectedInvestigatorId || selectedInvestigatorId === workspace.investigatorId} onClick={() => void reassign()} className="mt-2 rounded-md border border-cyan/50 px-3 py-2 text-sm text-cyan disabled:opacity-50">{processing ? "Assigning…" : "Confirm reassignment"}</button></div> : null}
      </div> : null}
      {panel === "status" ? <div className="flex flex-wrap gap-2">{workspace.status === "Active" ? <><Action label="Mark Dormant" disabled={processing} onClick={() => void updateStatus("Dormant")} /><Action label="Close Case" disabled={processing} onClick={() => void updateStatus("Closed")} /></> : workspace.status === "Dormant" ? <><Action label="Reactivate Case" disabled={processing} onClick={() => void updateStatus("Active")} /><Action label="Close Case" disabled={processing} onClick={() => void updateStatus("Closed")} /></> : workspace.status === "Closed" && canReactivateClosed ? <Action label="Reactivate Case" disabled={processing} onClick={() => void updateStatus("Active")} /> : <p className="text-sm text-muted-foreground">No status actions are available for your assigned role and the current status.</p>}</div> : null}
      <DialogFooter><DialogClose asChild><button type="button" disabled={processing} className="rounded-md border px-3 py-2 text-sm">Close</button></DialogClose></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}

function Action({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className="rounded-md border border-cyan/50 px-3 py-2 text-sm text-cyan disabled:opacity-50">{disabled ? "Processing…" : label}</button>; }
function ProgressItem({ label, value, detail, onClick, interactive = false }: { label: string; value: string; detail?: string; onClick?: () => void; interactive?: boolean }) { const content = <><span className="label-xs">{label}</span><span className="mt-1 block text-sm font-medium">{value}</span>{detail ? <span className="mt-1 block text-[11px] text-muted-foreground">{detail}</span> : null}</>; return onClick ? <button type="button" title={`${label}: ${value}`} onClick={onClick} className="rounded-md border bg-background/40 p-3 text-left hover:border-cyan/40 focus-visible:ring-2 focus-visible:ring-cyan">{content}</button> : <div className={`rounded-md border bg-background/40 p-3 ${interactive ? "hover:border-cyan/40" : ""}`}>{content}</div>; }
