import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, ShieldX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApplicationDetails } from "@/components/caselink/account-applications/ApplicationDetails";
import { Chip, EmptyState, Skeletons } from "@/components/caselink/bits";
import { Shell } from "@/components/caselink/Shell";
import {
  ACCOUNT_APPLICATION_SETUP_MESSAGE,
  AccountApplicationSetupError,
  listAccountApplications,
  loadAdministratorAccess,
  type AccountApplication,
  type ApplicationStatus,
} from "@/lib/caselink/account-applications.repository";

export const Route = createFileRoute("/admin/applications")({
  head: () => ({ meta: [
    { title: "Account Applications · CASELINK" },
    { name: "description", content: "Administrator review of CASELINK account and identity applications." },
  ] }),
  component: AccountApplicationsPage,
});

const GROUPS: Array<{ status: ApplicationStatus; label: string }> = [
  { status: "PENDING_DOCUMENT_REVIEW", label: "Pending document review" },
  { status: "PENDING_ADMIN_APPROVAL", label: "Pending administrator approval" },
  { status: "MORE_INFORMATION_REQUIRED", label: "More information required" },
  { status: "VERIFIED_APPROVED", label: "Approved" },
  { status: "REJECTED", label: "Rejected" },
  { status: "FAILED", label: "Failed" },
];
const DEFAULT_STATUSES: ApplicationStatus[] = ["PENDING_DOCUMENT_REVIEW", "PENDING_ADMIN_APPROVAL"];

type PageState = "loading" | "ready" | "denied" | "setup" | "error";

function AccountApplicationsPage() {
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [applications, setApplications] = useState<AccountApplication[]>([]);
  const [selected, setSelected] = useState<AccountApplication | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [filter, setFilter] = useState<ApplicationStatus[] | null>(DEFAULT_STATUSES);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const access = await loadAdministratorAccess();
      if (!access.isAdministrator) { setState("denied"); return; }
      setCurrentUserId(access.userId);
      const rows = await listAccountApplications();
      setApplications(rows);
      setSelected((current) => current ? rows.find((row) => row.id === current.id) ?? null : null);
      setState("ready");
    } catch (cause) {
      if (cause instanceof AccountApplicationSetupError) setState("setup");
      else { setError(cause instanceof Error ? cause.message : "Account applications could not be loaded."); setState("error"); }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => filter ? applications.filter((item) => filter.includes(item.status)) : applications, [applications, filter]);

  return <Shell title="Account Applications" subtitle="Administrator identity and role review">
    {state === "loading" ? <section className="panel"><Skeletons rows={5} /></section> : null}
    {state === "denied" ? <section className="panel"><EmptyState title="Access Denied" hint="A current administrator role in the CASELINK database is required." action={<ShieldX className="size-6 text-danger" />} /></section> : null}
    {state === "setup" ? <section className="panel"><EmptyState title={ACCOUNT_APPLICATION_SETUP_MESSAGE} hint="Apply and verify the reviewed account-application schema before using this page." /></section> : null}
    {state === "error" ? <section className="panel"><EmptyState title="Applications could not be loaded" hint={error ?? "The database request failed."} action={<button type="button" onClick={() => void load()} className="rounded border border-cyan/50 px-3 py-2 text-sm text-cyan"><RefreshCw className="mr-1 inline size-4" />Retry</button>} /></section> : null}
    {state === "ready" ? <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
      <section className="panel h-fit overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <button type="button" onClick={() => setFilter(DEFAULT_STATUSES)} className={`rounded border px-2 py-1 text-xs ${filter === DEFAULT_STATUSES ? "border-cyan text-cyan" : "border-border"}`}>Pending</button>
          <button type="button" onClick={() => setFilter(null)} className={`rounded border px-2 py-1 text-xs ${filter === null ? "border-cyan text-cyan" : "border-border"}`}>All</button>
          {GROUPS.map((group) => <button key={group.status} type="button" onClick={() => setFilter([group.status])} className={`rounded border px-2 py-1 text-xs ${filter?.length === 1 && filter[0] === group.status ? "border-cyan text-cyan" : "border-border"}`}>{group.label} ({applications.filter((item) => item.status === group.status).length})</button>)}
        </div>
        {visible.length === 0 ? <EmptyState title={filter === DEFAULT_STATUSES ? "No pending applications" : "No applications in this status"} hint="No real database applications match the selected view." /> : <div className="divide-y divide-border/70">{visible.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item)} className={`w-full p-3 text-left hover:bg-surface-2/50 ${selected?.id === item.id ? "bg-cyan/10" : ""}`}><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{item.full_legal_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.agency_department} · {item.rank_designation}</p></div><Chip tone="amber">{item.status.replaceAll("_", " ")}</Chip></div><p className="mt-2 text-xs capitalize">Requested role: {item.requested_role.replaceAll("_", " ")}</p><p className="mt-1 text-[11px] text-muted-foreground">Submitted {new Date(item.submitted_at).toLocaleString()}</p></button>)}</div>}
      </section>
      {selected ? <ApplicationDetails application={selected} currentUserId={currentUserId} onUpdated={load} /> : <section className="panel"><EmptyState title="Select an application" hint="Open a real application to review its recorded details and identity document." /></section>}
    </div> : null}
  </Shell>;
}
