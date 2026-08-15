import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AIPanel } from "@/components/caselink/AIPanel";
import { Chip, PriorityDot, SectionTitle, fmtDay } from "@/components/caselink/bits";
import { DetailDrawer, type DrawerTarget } from "@/components/caselink/DetailDrawer";
import { Shell } from "@/components/caselink/Shell";
import { TacticalMap } from "@/components/caselink/TacticalMap";
import { Timeline } from "@/components/caselink/Timeline";
import { useCaseLink } from "@/lib/caselink/store";

export const Route = createFileRoute("/investigations/$caseId")({
  head: () => ({
    meta: [
      { title: "Investigation Workspace · CASELINK" },
      {
        name: "description",
        content:
          "Synchronised investigation workspace: interactive evidence timeline, dark tactical map with movement paths, and an explainable AI intelligence panel.",
      },
      { property: "og:title", content: "Investigation Workspace · CASELINK" },
      {
        property: "og:description",
        content: "Timeline, tactical map and AI correlation for a single investigation file.",
      },
    ],
  }),
  component: InvestigationView,
});

function InvestigationView() {
  const { caseId } = Route.useParams();
  const { getCase, linksFor, cases } = useCaseLink();
  const investigation = getCase(caseId);
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<DrawerTarget | null>(null);

  if (!investigation) {
    return (
      <Shell title="File not found" subtitle="Register">
        <div className="panel p-6 text-center">
          <p className="text-sm text-foreground">
            Investigation {caseId} is not present in the current corpus.
          </p>
          <Link
            to="/investigations"
            className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:underline"
          >
            Back to register
          </Link>
        </div>
      </Shell>
    );
  }

  const links = linksFor(investigation.id);
  const highlighted = links.flatMap((l) => l.sharedEvidenceIds);

  const pick = (id: string) => {
    setSelected(id);
    setTarget({ kind: "evidence", id });
  };

  return (
    <Shell
      title={investigation.title}
      subtitle={`${investigation.code} · ${investigation.type} · ${investigation.status}`}
      actions={
        <button
          onClick={() => setTarget({ kind: "case", id: investigation.id })}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
        >
          Case drawer
        </button>
      }
    >
      <div className="panel mb-3 flex flex-wrap items-center gap-3 p-3">
        <PriorityDot priority={investigation.priority} />
        <Chip tone="cyan">{investigation.subject.name}</Chip>
        {investigation.subject.vehicle ? <Chip tone="amber">{investigation.subject.vehicle}</Chip> : null}
        {investigation.subject.phone ? <Chip>{investigation.subject.phone}</Chip> : null}
        <Chip>{fmtDay(investigation.incidentDate)}</Chip>
        <Chip>{investigation.lastKnownLocation}</Chip>
        <Chip tone={links.length ? "amber" : "default"}>{links.length} candidate links</Chip>
        <Chip>{investigation.evidence.length} evidence</Chip>
        <Link
          to="/evidence"
          className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:underline"
        >
          Manage evidence
        </Link>
      </div>

      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <section className="panel flex max-h-[640px] min-h-0 flex-col overflow-hidden">
          <SectionTitle right={<Chip>{investigation.evidence.length}</Chip>}>Timeline</SectionTitle>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
            <Timeline
              evidence={investigation.evidence}
              selectedId={selected}
              onSelect={pick}
              highlighted={highlighted}
            />
          </div>
        </section>

        <TacticalMap
          evidence={investigation.evidence}
          selectedId={selected}
          onSelect={pick}
          highlighted={highlighted}
          className="min-h-[420px] xl:min-h-[640px]"
        />

        <AIPanel
          investigation={investigation}
          selectedEvidenceId={selected}
          onSelectEvidence={pick}
          className="max-h-[640px]"
        />
      </div>

      <p className="mt-3 label-xs">
        {cases.length} files in corpus · timeline and map are synchronised: selecting an event on
        either surface illuminates the other, the AI panel and the evidence drawer
      </p>

      <DetailDrawer
        target={target}
        onClose={() => setTarget(null)}
        onSelectEvidence={(id) => {
          setSelected(id);
          setTarget({ kind: "evidence", id });
        }}
      />
    </Shell>
  );
}
