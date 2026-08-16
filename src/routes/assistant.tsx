/**
 * INVESTIGATOR ASSISTANT / "WHAT IF?" MODE (modules 7 & 13)
 *
 * Purpose: let an investigator interrogate the authorized corpus in plain
 * language and receive structured, cited answers.
 * Data flow: question -> askAssistant() over the store corpus -> answer rows,
 * each citing the case and evidence IDs used, openable in the detail drawer.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Send, Sparkles } from "lucide-react";
import { useState } from "react";

import { Chip, SectionTitle } from "@/components/caselink/bits";
import { DetailDrawer, type DrawerTarget } from "@/components/caselink/DetailDrawer";
import { Shell } from "@/components/caselink/Shell";
import { askAssistant, PRESET_QUERIES, type Answer } from "@/lib/caselink/assistant";
import { useCaseLink } from "@/lib/caselink/store";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Investigator Assistant · CASELINK" },
      {
        name: "description",
        content:
          "Ask CASELINK in plain language: similar modus operandi, cases within a radius, converging time windows, recurring vehicles or shared evidence — every answer cites its source records.",
      },
      { property: "og:title", content: "Investigator Assistant · CASELINK" },
      {
        property: "og:description",
        content: "Plain-language investigative queries with cited, explainable results.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssistantPage,
});

interface Turn {
  q: string;
  a: Answer;
}

function AssistantPage() {
  const { cases, links, allEvidence, logAudit } = useCaseLink();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [target, setTarget] = useState<DrawerTarget | null>(null);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    const a = askAssistant(text, cases, links);
    setTurns((t) => [{ q: text, a }, ...t]);
    setQ("");
    logAudit("AI analysis requested", a.intent, `Query: "${text}" · ${a.rows.length} result(s)`);
  };

  const openCite = (id: string) => {
    if (allEvidence.some((e) => e.id === id)) setTarget({ kind: "evidence", id });
    else if (cases.some((c) => c.id === id)) setTarget({ kind: "case", id });
  };

  return (
    <Shell
      title="Investigator Assistant"
      subtitle="What-if exploration over the authorized corpus"
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <section className="panel p-3">
            <div className="flex items-center gap-2 rounded-md border border-input bg-background/70 px-3 py-2 focus-within:border-cyan/60">
              <Sparkles className="size-4 shrink-0 text-cyan" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") ask(q);
                }}
                placeholder="e.g. Why is CASE-1024 related to CASE-1847?"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
              />
              <button
                onClick={() => ask(q)}
                className="rounded-sm border border-cyan/50 bg-cyan/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:bg-cyan/25"
              >
                <Send className="size-3.5" />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Answers are computed deterministically over the synthetic corpus loaded in this
              session and always cite the records used. The assistant proposes leads; it does not
              draw conclusions about people.
            </p>
          </section>

          {turns.length === 0 ? (
            <section className="panel p-6 text-center">
              <p className="text-[13px] text-muted-foreground">
                No queries yet. Pick a preset on the right, or ask about modus operandi, distance,
                timing, recurring vehicles or shared evidence.
              </p>
            </section>
          ) : null}

          {turns.map((t, i) => (
            <section key={`${t.q}-${i}`} className="panel overflow-hidden animate-rise">
              <SectionTitle right={<Chip tone="cyan">{t.a.rows.length} results</Chip>}>
                {t.q}
              </SectionTitle>
              <div className="space-y-2.5 p-3">
                <p className="text-[13px] font-medium text-foreground">{t.a.headline}</p>
                <p className="rounded-md border border-border/70 bg-surface-2/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan">
                    method ·{" "}
                  </span>
                  {t.a.reasoning}
                </p>
                <ul className="space-y-1.5">
                  {t.a.rows.map((r, ri) => (
                    <li
                      key={`${r.title}-${ri}`}
                      className="rounded-md border border-border/70 bg-surface-2/30 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-[11px] text-foreground">{r.title}</p>
                        {typeof r.score === "number" ? (
                          <span className="font-mono text-[11px] text-amber">{r.score}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        {r.detail}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {Array.from(new Set(r.cites)).map((c) => (
                          <button
                            key={c}
                            onClick={() => openCite(c)}
                            className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>

        <div className="space-y-3">
          <section className="panel overflow-hidden">
            <SectionTitle>What-if presets</SectionTitle>
            <div className="divide-y divide-border/60">
              {PRESET_QUERIES.map((p) => (
                <button
                  key={p}
                  onClick={() => ask(p)}
                  className="block w-full px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-cyan/[0.05] hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </section>
          <section className="panel p-3">
            <p className="label-xs">Corpus in scope</p>
            <p className="mt-1 font-mono text-[11px] text-foreground">
              {cases.length} files · {allEvidence.length} evidence records · {links.length}{" "}
              candidate links
            </p>
          </section>
        </div>
      </div>

      <DetailDrawer target={target} onClose={() => setTarget(null)} />
    </Shell>
  );
}
