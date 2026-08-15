import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Chip, EVIDENCE_COLOR, SectionTitle, fmtDateTime } from "@/components/caselink/bits";
import { DetailDrawer, type DrawerTarget } from "@/components/caselink/DetailDrawer";
import { Shell } from "@/components/caselink/Shell";
import { EVIDENCE_TYPES, LOCATION_PRESETS } from "@/lib/caselink/data";
import { useCaseLink } from "@/lib/caselink/store";
import type { EvidenceType } from "@/lib/caselink/types";

export const Route = createFileRoute("/evidence")({
  head: () => ({
    meta: [
      { title: "Evidence Management · CASELINK" },
      {
        name: "description",
        content:
          "Central evidence register: intake with processing pipeline, reliability weighting, keyword attributes and one-click access to connected evidence threads.",
      },
      { property: "og:title", content: "Evidence Management · CASELINK" },
      {
        property: "og:description",
        content: "Add, search and withdraw evidence records; correlations update immediately.",
      },
    ],
  }),
  component: EvidencePage,
});

function EvidencePage() {
  const { cases, allEvidence, addEvidence, updateEvidence, deleteEvidence } = useCaseLink();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [target, setTarget] = useState<DrawerTarget | null>(null);

  const [caseId, setCaseId] = useState(cases[0]?.id ?? "");
  const [evType, setEvType] = useState<EvidenceType>("CCTV");
  const [label, setLabel] = useState("");
  const [location, setLocation] = useState(LOCATION_PRESETS[0]!.name);
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 16));
  const [reliability, setReliability] = useState(78);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...allEvidence]
      .filter((e) => (type === "all" ? true : e.type === type))
      .filter((e) =>
        needle
          ? `${e.id} ${e.caseId} ${e.label} ${e.source} ${e.locationName} ${e.keywords.join(" ")} ${e.details}`
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  }, [allEvidence, q, type, ]);

  const input =
    "rounded-md border border-input bg-background/70 px-2.5 py-1.5 text-[12px] outline-none focus:border-cyan/60";

  const submit = () => {
    const parent = cases.find((c) => c.id === caseId);
    if (!parent) {
      toast.error("Select a valid case file first.");
      return;
    }
    if (label.trim().length < 3) {
      toast.error("Evidence label must be at least 3 characters.");
      return;
    }
    const preset = LOCATION_PRESETS.find((p) => p.name === location) ?? LOCATION_PRESETS[0]!;
    const id = `${parent.id}-E${String(parent.evidence.length + 1).padStart(2, "0")}`;
    if (parent.evidence.some((e) => e.label.trim().toLowerCase() === label.trim().toLowerCase())) {
      toast.warning("Duplicate label detected — record stored with a distinct evidence ID.");
    }
    addEvidence(parent.id, {
      id,
      caseId: parent.id,
      type: evType,
      label: label.trim(),
      source: `Synthetic intake ${evType.toUpperCase()}-${id}`,
      timestamp: new Date(when).toISOString(),
      locationName: preset.name,
      lat: preset.lat,
      lng: preset.lng,
      reliability,
      details: `${evType} record submitted from the evidence register.`,
      interpretation: `Places activity at ${preset.name} at ${fmtDateTime(new Date(when).toISOString())}; weighted at ${reliability}% source reliability.`,
      keywords: [evType.toLowerCase(), preset.name.split(",")[0]!.toLowerCase()],
      stage: "PROCESSING",
    });
    setLabel("");
    window.setTimeout(() => updateEvidence(parent.id, id, { stage: "INDEXED" }), 800);
    window.setTimeout(() => {
      updateEvidence(parent.id, id, { stage: "CORRELATED" });
      toast.success(`${id} correlated`, {
        description: "Timeline, map, AI panel and cross-case graph updated.",
      });
    }, 1700);
  };

  return (
    <Shell title="Evidence Management" subtitle={`${allEvidence.length} records indexed`}>
      <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
        <section className="panel overflow-hidden">
          <SectionTitle right={<Chip tone="cyan">{filtered.length} shown</Chip>}>
            Evidence register
          </SectionTitle>
          <div className="flex flex-wrap gap-2 border-b border-border/60 p-2.5">
            <span className="flex min-w-[200px] flex-1 items-center gap-2 rounded-md border border-input bg-background/70 px-2.5 py-1.5">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search evidence, sources, keywords…"
                className="w-full bg-transparent text-[12px] outline-none"
              />
            </span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={input}>
              <option value="all">All types</option>
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="divide-y divide-border/60">
            {filtered.length === 0 ? (
              <p className="p-6 text-center label-xs">No evidence matches this query</p>
            ) : (
              filtered.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: EVIDENCE_COLOR[e.type] }}
                  />
                  <button
                    onClick={() => setTarget({ kind: "evidence", id: e.id })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[12px] text-foreground">{e.label}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {e.caseId} · {e.id} · {e.locationName} · {fmtDateTime(e.timestamp)} ·{" "}
                      {e.reliability}%
                    </p>
                  </button>
                  <Chip tone={e.stage === "CORRELATED" ? "success" : e.stage === "INDEXED" ? "cyan" : "amber"}>
                    {e.stage}
                  </Chip>
                  <button
                    onClick={() => {
                      deleteEvidence(e.caseId, e.id);
                      toast.success(`${e.id} withdrawn`);
                    }}
                    className="text-muted-foreground hover:text-danger"
                    aria-label={`Withdraw ${e.id}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel h-fit overflow-hidden">
          <SectionTitle>Add evidence</SectionTitle>
          <div className="space-y-2.5 p-3">
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className={`${input} w-full`}>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.title}
                </option>
              ))}
            </select>
            <select
              value={evType}
              onChange={(e) => setEvType(e.target.value as EvidenceType)}
              className={`${input} w-full`}
            >
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Evidence label"
              className={`${input} w-full`}
            />
            <select value={location} onChange={(e) => setLocation(e.target.value)} className={`${input} w-full`}>
              {LOCATION_PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className={`${input} w-full`}
            />
            <label className="block space-y-1">
              <span className="label-xs">Source reliability · {reliability}%</span>
              <input
                type="range"
                min={10}
                max={99}
                value={reliability}
                onChange={(e) => setReliability(Number(e.target.value))}
                className="w-full accent-[var(--cyan)]"
              />
            </label>
            <button
              onClick={submit}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:bg-cyan/25"
            >
              <Plus className="size-3" /> Process & correlate
            </button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Every intake runs PROCESSING → INDEXED → CORRELATED, then recomputes dashboard
              metrics, the timeline, the map, AI inference and the cross-case graph.
            </p>
          </div>
        </section>
      </div>

      <DetailDrawer
        target={target}
        onClose={() => setTarget(null)}
        onSelectEvidence={(id) => setTarget({ kind: "evidence", id })}
      />
    </Shell>
  );
}
