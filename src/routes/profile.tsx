import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Chip, SectionTitle } from "@/components/caselink/bits";
import { Shell } from "@/components/caselink/Shell";
import { useCaseLink } from "@/lib/caselink/store";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Officer Profile · CASELINK" },
      {
        name: "description",
        content:
          "Authorised officer session details, clearance level, audit posture and workspace controls for the CASELINK investigative intelligence platform.",
      },
      { property: "og:title", content: "Officer Profile · CASELINK" },
      { property: "og:description", content: "Session, clearance and workspace controls." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session, cases, links, allEvidence, resetDemo } = useCaseLink();

  const rows: Array<[string, string]> = [
    ["Officer", session?.name ?? "—"],
    ["Badge ID", session?.investigatorId ?? "—"],
    ["Unit", session?.unit ?? "—"],
    ["Clearance", "TIER-3 RESTRICTED"],
    ["Session opened", session ? new Date(session.at).toLocaleString() : "—"],
    ["Files accessible", String(cases.length)],
    ["Evidence records", String(allEvidence.length)],
    ["Candidate links", String(links.length)],
  ];

  return (
    <Shell title="Officer Profile" subtitle="Session · clearance · audit">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <SectionTitle right={<Chip tone="success">Active session</Chip>}>Credentials</SectionTitle>
          <dl className="divide-y divide-border/60">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-3 py-2">
                <dt className="label-xs">{k}</dt>
                <dd className="font-mono text-[11px] text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel h-fit overflow-hidden">
          <SectionTitle>Governance</SectionTitle>
          <div className="space-y-2.5 p-3 text-[12px] leading-relaxed text-muted-foreground">
            <p>
              CASELINK is decision-support only. Every AI correlation is advisory, fully explained
              and requires a human verdict before it can influence a case file's status.
            </p>
            <p>
              All data in this environment is fictional and generated for demonstration. Actions are
              recorded locally against this session for audit continuity.
            </p>
            <button
              onClick={() => {
                resetDemo();
                toast.success("Database-backed synthetic corpus reloaded");
              }}
              className="w-full rounded-md border border-danger/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-danger hover:bg-danger/10"
            >
              Reload database corpus
            </button>
          </div>
        </section>
      </div>
    </Shell>
  );
}
