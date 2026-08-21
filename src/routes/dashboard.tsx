import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, Boxes, FolderSearch, Network, RefreshCw, UserSearch } from "lucide-react";
import { useMemo } from "react";

import { Chip, CountUp, SectionTitle, Skeletons, fmtDateTime } from "@/components/caselink/bits";
import { Shell } from "@/components/caselink/Shell";
import { useCaseLink } from "@/lib/caselink/store";
import type { CaseLink, IntelligenceAlert, Investigation } from "@/lib/caselink/types";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Command Center · CASELINK" },
      { name: "description", content: "CASELINK command centre: authenticated investigation database status, connection suggestions and intelligence alerts." },
      { property: "og:title", content: "Command Center · CASELINK" },
      { property: "og:description", content: "Monitor investigations, connection suggestions and intelligence alerts in one investigative command centre." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const {
    cases, casesLoaded, casesLoading, casesError, retryCases, links, allEvidence,
    alerts, alertsLoaded, alertsLoading, alertsError, retryAlerts,
  } = useCaseLink();

  const stats = useMemo(() => ({
    active: cases.filter((c) => c.status !== "Closed").length,
    missing: cases.filter((c) => c.type === "Missing Person").length,
    pending: links.filter((l) => l.databaseVerdict === "pending").length,
    evidence: allEvidence.length,
  }), [cases, links, allEvidence]);
  const resolvedAlerts = useMemo(() => alerts.map((alert) => resolveAlert(alert, cases, links)), [alerts, cases, links]);
  const databaseIsLoading = !casesLoaded || casesLoading;

  return (
    <Shell title="Command Center" subtitle="Authenticated investigation database">
      {databaseIsLoading ? (
        <div className="space-y-4">
          <Skeletons rows={4} />
          <section className="panel p-4 font-mono text-xs text-muted-foreground">Loading investigation database…</section>
        </div>
      ) : casesError ? (
        <DatabaseError message={casesError} onRetry={retryCases} />
      ) : cases.length === 0 ? (
        <div className="space-y-4">
          <section className="panel flex flex-col items-center gap-3 p-10 text-center">
            <FolderSearch className="size-6 text-cyan" />
            <p className="text-sm font-medium">No investigations in the database</p>
            <p className="max-w-md text-[12px] text-muted-foreground">The authenticated database query returned zero investigation records.</p>
          </section>
          <AlertsPanel alerts={resolvedAlerts} isLoading={!alertsLoaded || alertsLoading} error={alertsError} onRetry={retryAlerts} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={FolderSearch} label="Active cases" value={stats.active} hint={`${cases.length} files in investigation database`} />
            <Metric icon={UserSearch} label="Missing persons" value={stats.missing} hint="Vulnerable-subject protocol active" tone="danger" />
            <Metric icon={Network} label="Suggested connections" value={stats.pending} hint={`${links.length} meaningful connections`} tone="amber" />
            <Metric icon={Boxes} label="Evidence records" value={stats.evidence} hint="Indexed database records" tone="success" />
          </div>

          {links.length === 0 ? (
            <section className="panel flex flex-col items-center gap-2 p-6 text-center">
              <Network className="size-5 text-cyan" />
              <p className="text-sm font-medium">No meaningful connections</p>
              <p className="text-[12px] text-muted-foreground">No database connection records currently meet the reporting threshold.</p>
            </section>
          ) : null}

          <AlertsPanel alerts={resolvedAlerts} isLoading={!alertsLoaded || alertsLoading} error={alertsError} onRetry={retryAlerts} />
        </div>
      )}
    </Shell>
  );
}

function resolveAlert(alert: IntelligenceAlert, cases: Investigation[], links: CaseLink[]) {
  const connection = alert.connectionId ? links.find((link) => link.id === alert.connectionId) : undefined;
  const caseId = alert.caseId ?? connection?.aId ?? null;
  const investigation = caseId ? cases.find((item) => item.id === caseId) : undefined;
  return { alert, connection, investigation };
}

function AlertsPanel({ alerts, isLoading, error, onRetry }: { alerts: ReturnType<typeof resolveAlert>[]; isLoading: boolean; error: string | null; onRetry: () => void }) {
  return (
    <section className="panel overflow-hidden">
      <SectionTitle right={<Chip tone="danger">{isLoading || error ? "…" : alerts.length}</Chip>}>
        <span className="flex items-center gap-1.5"><AlertTriangle className="size-3.5 text-danger" /> Intelligence alerts</span>
      </SectionTitle>
      <div className="space-y-2 p-3">
        {isLoading ? <Skeletons rows={3} /> : error ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-danger/40 bg-danger/5 p-3">
            <p className="text-[12px] text-danger">Could not load intelligence alerts</p>
            <p className="font-mono text-[11px] text-muted-foreground">{error}</p>
            <button type="button" onClick={onRetry} className="flex items-center gap-1.5 rounded-md border border-cyan/50 bg-cyan/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:bg-cyan/20"><RefreshCw className="size-3" /> Retry</button>
          </div>
        ) : alerts.length === 0 ? <p className="text-[11px] text-muted-foreground">No intelligence alerts in the database.</p> : (
          alerts.map(({ alert, connection, investigation }) => (
            <article key={alert.id} className="rounded-md border border-border/70 bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[12px] font-medium text-foreground">{safeAlertText(alert.title)}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {formatAlertKind(alert.kind)} · {fmtDateTime(alert.createdAt)}{connection ? ` · ${connection.confidence}% connection` : ""}
                  </p>
                </div>
                {connection && investigation ? <Link to="/links" search={{ case: investigation.id, link: connection.id }} className="rounded-md border border-cyan/40 bg-cyan/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan hover:bg-cyan/20">Open connection</Link> : investigation ? <Link to="/investigations/$caseId" params={{ caseId: investigation.id }} className="rounded-md border border-cyan/40 bg-cyan/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan hover:bg-cyan/20">Open investigation</Link> : null}
              </div>
              <p className="mt-2 text-[12px] text-cyan">{investigation ? `${investigation.code} — ${investigation.title}` : "Case unavailable"}</p>
              {alert.body ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{safeAlertText(alert.body)}</p> : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function formatAlertKind(kind: string) {
  return kind.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeAlertText(value: string) {
  return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "Case unavailable");
}

function DatabaseError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel flex flex-col items-center gap-3 p-10 text-center">
      <AlertTriangle className="size-6 text-danger" />
      <p className="text-sm font-medium text-danger">Could not load the investigation database</p>
      <p className="max-w-lg font-mono text-[11px] text-muted-foreground">{message}</p>
      <button type="button" onClick={onRetry} className="flex items-center gap-2 rounded-md border border-cyan/50 bg-cyan/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/20"><RefreshCw className="size-3" /> Retry</button>
    </section>
  );
}

function Metric({ icon: Icon, label, value, hint, tone = "cyan" }: { icon: typeof Activity; label: string; value: number; hint: string; tone?: "cyan" | "amber" | "danger" | "success" }) {
  const color = tone === "amber" ? "var(--amber)" : tone === "danger" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--cyan)";
  return (
    <div className="panel relative overflow-hidden p-3">
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="flex items-start justify-between"><p className="label-xs">{label}</p><Icon className="size-4" style={{ color }} /></div>
      <p className="mt-2 font-mono text-4xl leading-none" style={{ color }}><CountUp value={value} /></p>
      <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
