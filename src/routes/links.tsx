import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, FolderSearch, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { CaseEvidencePanel } from "@/components/caselink/connections/CaseEvidencePanel";
import { ConnectionDetailsPanel } from "@/components/caselink/connections/ConnectionDetailsPanel";
import { InvestigationBoard } from "@/components/caselink/connections/InvestigationBoard";
import type { BoardConnection } from "@/components/caselink/connections/board.types";
import type { SelectedBoardNote } from "@/components/caselink/connections/evidence-notes";
import { Shell } from "@/components/caselink/Shell";
import { buildConnectionCluster, CONNECTION_BOARD_THRESHOLD } from "@/lib/caselink/connection-cluster";
import { getRequestedConnectionScore } from "@/lib/caselink/connection-board.functions";
import { getConnections } from "@/lib/caselink/engine.functions";
import { useCaseLink } from "@/lib/caselink/store";
import type { Investigation } from "@/lib/caselink/types";

const searchSchema = z.object({
  case: z.string().uuid().optional(),
  link: z.string().uuid().optional(),
});

type ClusterBoardConnection = BoardConnection & {
  caseAId: string;
  caseBId: string;
};

export const Route = createFileRoute("/links")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Focused Case Connections · CASELINK" },
      { name: "description", content: "A focused multiple-case investigation board built from stored database connections." },
      { property: "og:title", content: "Focused Case Connections · CASELINK" },
      { property: "og:description", content: "Review one meaningful connection cluster without drawing the entire database." },
    ],
  }),
  component: LinksPage,
});

function isInvestigation(value: Investigation | undefined): value is Investigation {
  return value != null;
}

function LinksPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const fetchConnections = useServerFn(getConnections);
  const fetchRequestedScore = useServerFn(getRequestedConnectionScore);
  const { cases, casesError, casesLoading, retryCases } = useCaseLink();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(search.link ?? null);
  const [selectedBoardCaseId, setSelectedBoardCaseId] = useState<string | null>(search.case ?? null);
  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<SelectedBoardNote | null>(null);

  const connectionQuery = useQuery({
    queryKey: ["focused-connection-board"],
    queryFn: () => fetchConnections(),
    enabled: Boolean(search.case),
  });
  const requestedScoreQuery = useQuery({
    queryKey: ["focused-connection-score", search.link],
    queryFn: () => fetchRequestedScore({ data: { connectionId: search.link! } }),
    enabled: Boolean(search.link),
  });
  const databaseCases = useMemo(() => cases.filter((investigation) => investigation.isDatabaseBacked), [cases]);
  const caseMap = useMemo(() => new Map(databaseCases.map((investigation) => [investigation.id, investigation])), [databaseCases]);
  const storedConnections = useMemo<ClusterBoardConnection[]>(
    () => ((connectionQuery.data ?? []) as BoardConnection[]).map((connection) => ({
      ...connection,
      caseAId: connection.case_a_id,
      caseBId: connection.case_b_id,
    })),
    [connectionQuery.data],
  );
  const cluster = useMemo(
    () => search.case ? buildConnectionCluster(search.case, storedConnections, CONNECTION_BOARD_THRESHOLD) : null,
    [search.case, storedConnections],
  );
  const clusterCases = useMemo(
    () => (cluster?.caseIds ?? []).map((caseId) => caseMap.get(caseId)).filter(isInvestigation),
    [caseMap, cluster?.caseIds],
  );
  const clusterConnections = cluster?.edges ?? [];
  const selectedConnection = clusterConnections.find((connection) => connection.id === selectedConnectionId) ?? null;
  const requestedBelowThreshold = requestedScoreQuery.data != null && requestedScoreQuery.data.score < CONNECTION_BOARD_THRESHOLD;
  const focusedCase = search.case ? caseMap.get(search.case) : undefined;

  useEffect(() => {
    setSelectedBoardCaseId(search.case ?? null);
  }, [search.case]);

  useEffect(() => {
    if (!search.case || connectionQuery.isLoading) return;
    const requested = search.link && clusterConnections.some((connection) => connection.id === search.link)
      ? search.link
      : clusterConnections[0]?.id ?? null;
    setSelectedConnectionId(requested);
  }, [clusterConnections, connectionQuery.isLoading, search.case, search.link]);

  const selectCase = (caseId: string) => {
    void navigate({ search: { case: caseId } });
  };

  const selectConnection = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    setSelectedFactorId(null);
    setSelectedNote(null);
    if (search.case) void navigate({ search: { case: search.case, link: connectionId }, replace: true });
  };

  const selectFactor = (connectionId: string, factorId: string) => {
    setSelectedConnectionId(connectionId);
    setSelectedFactorId(factorId);
    setSelectedNote(null);
    if (search.case) void navigate({ search: { case: search.case, link: connectionId }, replace: true });
  };

  const selectNote = (selection: SelectedBoardNote) => {
    setSelectedBoardCaseId(selection.caseId);
    setSelectedNote(selection);
    setSelectedFactorId(null);
  };

  if (casesLoading) {
    return <Shell title="Case Connections" subtitle="Loading database investigations"><p className="panel p-6 font-mono text-xs text-muted-foreground">Loading focused-board records…</p></Shell>;
  }

  if (casesError) {
    return (
      <Shell title="Case Connections" subtitle="Database register unavailable">
        <div className="panel flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="size-6 text-danger" />
          <p className="font-mono text-[11px] text-danger">{casesError}</p>
          <button type="button" onClick={retryCases} className="flex items-center gap-2 rounded-md border border-cyan/50 bg-cyan/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan"><RefreshCw className="size-3" /> Retry</button>
        </div>
      </Shell>
    );
  }

  if (!search.case) {
    return (
      <Shell title="Case Connections" subtitle="Select one investigation to build a focused board">
        <section className="panel mx-auto max-w-2xl p-6 text-center">
          <FolderSearch className="mx-auto size-7 text-cyan" />
          <h2 className="mt-3 text-sm font-medium text-foreground">Choose an investigation cluster</h2>
          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-muted-foreground">The board starts from one selected case and follows only stored database connections at or above 60%. It never draws the whole database automatically.</p>
          <label className="mx-auto mt-5 grid max-w-xl gap-1.5 text-left">
            <span className="label-xs">Database investigation</span>
            <select defaultValue="" onChange={(event) => { if (event.target.value) selectCase(event.target.value); }} className="rounded-md border border-input bg-background/70 px-3 py-2 text-[12px] outline-none focus:border-cyan/60">
              <option value="">Select a case…</option>
              {databaseCases.map((investigation) => <option key={investigation.id} value={investigation.id}>{investigation.code} — {investigation.title}</option>)}
            </select>
          </label>
          {databaseCases.length === 0 ? <p className="mt-4 text-[11px] text-muted-foreground">No database-backed investigations are available.</p> : null}
        </section>
      </Shell>
    );
  }

  if (!focusedCase) {
    return (
      <Shell title="Case Connections" subtitle="Focused investigation unavailable">
        <section className="panel p-8 text-center">
          <p className="text-sm text-foreground">Referenced record unavailable</p>
          <button type="button" onClick={() => void navigate({ search: {} })} className="mt-4 rounded-md border border-cyan/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan">Choose another case</button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell
      title="Focused Case Connections"
      subtitle={`${focusedCase.code} · stored connections at ${CONNECTION_BOARD_THRESHOLD}% or higher`}
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void navigate({ search: {} })} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"><ArrowLeft className="size-3" /> Choose Case</button>
          <Link to="/engine" search={{}} className="rounded-md border border-cyan/50 bg-cyan/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan hover:bg-cyan/20">Return to Connection Analysis</Link>
        </div>
      }
    >
      {connectionQuery.isLoading ? (
        <p className="panel p-6 font-mono text-xs text-muted-foreground">Loading stored connection factors…</p>
      ) : connectionQuery.isError ? (
        <div className="panel flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="size-6 text-danger" />
          <p className="text-sm text-danger">Could not load stored connections</p>
          <p className="font-mono text-[11px] text-muted-foreground">{connectionQuery.error instanceof Error ? connectionQuery.error.message : "Unknown request error"}</p>
          <button type="button" onClick={() => void connectionQuery.refetch()} className="rounded-md border border-cyan/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan">Retry</button>
        </div>
      ) : (
        <div className="space-y-3">
          {requestedBelowThreshold ? (
            <p className="panel border-danger/40 bg-danger/5 p-3 text-[12px] text-danger" role="status">
              The requested connection does not meet the current 60% threshold. It was not added to this board or used to expand the cluster.
            </p>
          ) : null}
          <InvestigationBoard cases={clusterCases} connections={clusterConnections} selectedCaseId={selectedBoardCaseId ?? focusedCase.id} selectedConnectionId={selectedConnectionId} selectedFactorId={selectedFactorId} selectedNote={selectedNote} onSelectCase={setSelectedBoardCaseId} onSelectConnection={selectConnection} onSelectFactor={selectFactor} onSelectNote={selectNote} />
          {clusterConnections.length === 0 ? <p className="panel p-4 text-[12px] text-muted-foreground">No stored connections from {focusedCase.code} reach the 60% board threshold. The selected investigation is shown alone and no relationship has been invented.</p> : null}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
            <CaseEvidencePanel cases={clusterCases} />
            <ConnectionDetailsPanel connection={selectedConnection} cases={clusterCases} selectedFactorId={selectedFactorId} selectedNote={selectedNote} />
          </div>
        </div>
      )}
    </Shell>
  );
}
