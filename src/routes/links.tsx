import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { VerdictControls } from "@/components/caselink/AIPanel";
import { Chip, ConfidenceBar, SectionTitle, VerdictBadge } from "@/components/caselink/bits";
import { DetailDrawer, type DrawerTarget } from "@/components/caselink/DetailDrawer";
import { NetworkGraph } from "@/components/caselink/NetworkGraph";
import { Shell } from "@/components/caselink/Shell";
import { useCaseLink } from "@/lib/caselink/store";

export const Route = createFileRoute("/links")({
  validateSearch: z.object({ link: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Cross-Case Link Finder · CASELINK" },
      {
        name: "description",
        content:
          "Interactive network graph of investigation files: shared evidence forms animated edges with explainable confidence and human confirm, reject or more-evidence verdicts.",
      },
      { property: "og:title", content: "Cross-Case Link Finder · CASELINK" },
      {
        property: "og:description",
        content: "Discover and verify hidden relationships between investigation files.",
      },
    ],
  }),
  component: LinksPage,
});

function LinksPage() {
  const search = Route.useSearch();
  const { cases, links, verdicts, setVerdict, getCase } = useCaseLink();
  const [selectedLink, setSelectedLink] = useState<string | null>(search.link ?? null);
  const [target, setTarget] = useState<DrawerTarget | null>(null);

  const link = links.find((l) => l.id === (selectedLink ?? "")) ?? links[0] ?? null;
  const a = link ? getCase(link.aId) : undefined;
  const b = link ? getCase(link.bId) : undefined;
  const verdict = link ? (verdicts[link.id] ?? "pending") : "pending";

  return (
    <Shell
      title="Cross-Case Link Finder"
      subtitle={`${links.length} candidate correlations across ${cases.length} files`}
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <NetworkGraph
          cases={cases}
          links={links}
          verdicts={verdicts}
          selectedLinkId={link?.id ?? null}
          onSelectLink={(id) => setSelectedLink(id)}
          selectedCaseId={null}
          onSelectCase={(id) => setTarget({ kind: "case", id })}
          className="min-h-[420px] xl:min-h-[600px]"
        />

        <div className="space-y-3">
          <section className="panel overflow-hidden">
            <SectionTitle right={<VerdictBadge verdict={verdict} />}>Connection detail</SectionTitle>
            {!link ? (
              <p className="p-4 text-[12px] text-muted-foreground">
                No correlations above threshold. Add vehicle, handset, witness or location evidence
                to widen the comparison surface.
              </p>
            ) : (
              <div className="space-y-3 p-3">
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    {a?.code} ↔ {b?.code}
                  </p>
                  <p className="label-xs mt-0.5">
                    {a?.title} · {b?.title}
                  </p>
                </div>
                <ConfidenceBar label="Correlation confidence" value={link.confidence} />
                <div>
                  <p className="label-xs">Shared attributes</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {link.sharedAttributes.map((s) => (
                      <Chip key={s} tone="amber">
                        {s}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="label-xs">Signal breakdown</p>
                  <ul className="mt-1.5 space-y-1">
                    {link.reasons.map((r) => (
                      <li key={r.factor} className="text-[11px] leading-snug text-muted-foreground">
                        <span className="text-foreground/85">
                          {r.factor} (+{r.weight}):
                        </span>{" "}
                        {r.detail}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-border/70 bg-surface-2/40 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  {link.explanation}
                </div>
                <VerdictControls
                  linkId={link.id}
                  verdict={verdict}
                  onChange={(id, v) => {
                    setVerdict(id, v);
                    toast.success(
                      v === "confirmed"
                        ? "Link confirmed — investigation status escalated for joint review"
                        : v === "rejected"
                          ? "Link rejected — edge retained as audit history"
                          : v === "more-evidence"
                            ? "Flagged: more evidence required"
                            : "Verdict reset to pending",
                    );
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => a && setTarget({ kind: "case", id: a.id })}
                    className="flex-1 rounded-sm border border-border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-cyan"
                  >
                    {a?.code} drawer
                  </button>
                  <button
                    onClick={() => b && setTarget({ kind: "case", id: b.id })}
                    className="flex-1 rounded-sm border border-border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-cyan"
                  >
                    {b?.code} drawer
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="panel overflow-hidden">
            <SectionTitle right={<Chip>{links.length}</Chip>}>All candidates</SectionTitle>
            <div className="max-h-[300px] divide-y divide-border/60 overflow-y-auto">
              {links.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLink(l.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-cyan/[0.05]"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                    {l.aId} ↔ {l.bId}
                  </span>
                  <VerdictBadge verdict={verdicts[l.id] ?? "pending"} />
                  <span className="font-mono text-[11px] text-amber">{l.confidence}%</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <DetailDrawer
        target={target}
        onClose={() => setTarget(null)}
        onSelectEvidence={(id) => setTarget({ kind: "evidence", id })}
      />
    </Shell>
  );
}
