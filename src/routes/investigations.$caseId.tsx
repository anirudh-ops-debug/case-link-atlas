import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Chip, PriorityDot, SectionTitle, fmtDay } from "@/components/caselink/bits";
import { InvestigationOperations } from "@/components/caselink/investigations/InvestigationOperations";
import { InvestigationTheories } from "@/components/caselink/investigations/InvestigationTheories";
import { InvestigationTimeline } from "@/components/caselink/investigations/InvestigationTimeline";
import { Shell } from "@/components/caselink/Shell";
import { useCaseLink } from "@/lib/caselink/store";

export const Route = createFileRoute("/investigations/$caseId")({
  head: () => ({ meta: [
    { title: "Investigation Workspace · CASELINK" },
    { name: "description", content: "Database-backed investigation workspace with case progress, assigned investigator information and recorded timeline." },
  ] }),
  component: InvestigationView,
});

function InvestigationView() {
  const { caseId } = Route.useParams();
  const { getCase, linksFor, cases, casesError, casesLoading, retryCases } = useCaseLink();
  const investigation = getCase(caseId);
  if (casesLoading) return <Shell title="Loading investigation" subtitle="Database register"><div className="panel p-6 text-center font-mono text-xs text-muted-foreground">Loading database case and related records…</div></Shell>;
  if (casesError) return <Shell title="Investigation unavailable" subtitle="Database register"><div className="panel flex flex-col items-center gap-3 p-8 text-center"><AlertTriangle className="size-6 text-danger" /><p className="font-mono text-[11px] text-danger">{casesError}</p><button type="button" onClick={retryCases} className="flex items-center gap-2 rounded-md border border-cyan/50 bg-cyan/10 px-3 py-2 font-mono text-[10px] uppercase text-cyan"><RefreshCw className="size-3" />Retry</button></div></Shell>;
  if (!investigation) return <Shell title="File not found" subtitle="Register"><div className="panel p-6 text-center"><p className="text-sm">The requested investigation is not present in the database register.</p><Link to="/investigations" className="mt-3 inline-block font-mono text-[10px] uppercase text-cyan hover:underline">Back to register</Link></div></Shell>;
  const meaningfulLinks = linksFor(investigation.id).filter((link) => link.confidence >= 60);
  const actualEvidence = investigation.evidence.filter((item) => item.recordKind !== "timeline");
  return (
    <Shell title={investigation.title} subtitle={`${investigation.code} · ${investigation.type} · ${investigation.status}`} actions={<div className="flex flex-wrap gap-2"><Link to="/links" search={{ case: investigation.id, link: undefined }} className="rounded-md border border-cyan/50 bg-cyan/10 px-3 py-1.5 font-mono text-[10px] uppercase text-cyan hover:bg-cyan/20">View Case Connections</Link><Link to="/evidence" search={{ case: investigation.id, upload: false }} className="rounded-md border border-border px-3 py-1.5 font-mono text-[10px] uppercase text-muted-foreground hover:border-cyan/50 hover:text-cyan">Manage Evidence</Link></div>}>
      <section className="panel mb-3 p-4"><div className="flex flex-wrap items-center gap-3"><PriorityDot priority={investigation.priority} /><span className="font-mono text-xs text-cyan">{investigation.code}</span><span className="text-sm text-muted-foreground">{investigation.type}</span></div><p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">{investigation.notes || "No case description recorded."}</p></section>
      <div className="panel mb-3 flex flex-wrap items-center gap-2 p-3"><Chip>{investigation.priority} priority</Chip><Chip tone="cyan">{investigation.subject.name || "Subject not recorded"}</Chip>{investigation.subject.vehicle ? <Chip tone="amber">{investigation.subject.vehicle}</Chip> : null}{investigation.subject.phone ? <Chip>{investigation.subject.phone}</Chip> : null}<Chip>{fmtDay(investigation.incidentDate)}</Chip><Chip>{investigation.lastKnownLocation || "Location not recorded"}</Chip><Chip tone={meaningfulLinks.length ? "amber" : "default"}>{meaningfulLinks.length} meaningful connections</Chip><Chip>{actualEvidence.length} evidence</Chip></div>
      <InvestigationOperations caseId={investigation.id} />
      <InvestigationTheories caseId={investigation.id} status={investigation.status} investigatorId={investigation.assignedInvestigatorId} />
      <section className="panel overflow-hidden"><SectionTitle right={<Chip>{investigation.evidence.length}</Chip>}>Recorded timeline</SectionTitle><div className="px-2 pb-3"><InvestigationTimeline evidence={investigation.evidence} /></div></section>
      <p className="mt-3 label-xs">Database record · {cases.length} investigations available · Evidence files are managed securely in Evidence Management</p>
    </Shell>
  );
}
