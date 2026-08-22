import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Check, Plus, Trash2,Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { uploadEvidenceFile, validateEvidenceFile } from "@/lib/caselink/evidence.repository";

import { Chip, EVIDENCE_COLOR, fmtDateTime } from "@/components/caselink/bits";
import { EvidenceUploadDialog } from "@/components/caselink/evidence/EvidenceUploadDialog";
import { Shell } from "@/components/caselink/Shell";
import { CASE_TYPES, EVIDENCE_TYPES, LOCATION_PRESETS, PRIORITIES } from "@/lib/caselink/data";
import { useCaseLink } from "@/lib/caselink/store";
import type { CreateInvestigationInput } from "@/lib/caselink/investigations.repository";
import type {
  CaseType,
  Evidence,
  EvidenceStage,
  EvidenceType,
  Priority,
} from "@/lib/caselink/types";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { loadEligibleInvestigators, type EligibleInvestigator } from "@/lib/caselink/investigations.repository";

export const Route = createFileRoute("/investigations/new")({
  head: () => ({
    meta: [
      { title: "New Investigation · CASELINK" },
      {
        name: "description",
        content:
          "Guided four-step intake wizard: subject details, incident context, evidence upload with processing pipeline, and review before correlation runs.",
      },
      { property: "og:title", content: "New Investigation · CASELINK" },
      {
        property: "og:description",
        content: "Register a new synthetic investigation and let CASELINK correlate it automatically.",
      },
    ],
  }),
  component: NewInvestigationPage,
});

const STEPS = ["Subject", "Incident", "Evidence", "Review"] as const;

interface Draft {
  caseNo: string;
  firNumber: string;
  name: string;
  aliases: string;
  age: string;
  phone: string;
  vehicle: string;
  type: CaseType;
  priority: Priority;
  date: string;
  location: string;
  witnesses: string;
  weapon: string;
  modus: string;
  notes: string;
}

const emptyDraft: Draft = {
  caseNo: "",
  firNumber: "",
  name: "",
  aliases: "",
  age: "",
  phone: "",
  vehicle: "",
  type: "Missing Person",
  priority: "High",
  date: new Date().toISOString().slice(0, 16),
  location: LOCATION_PRESETS[0]!.name,
  witnesses: "",
  weapon: "",
  modus: "",
  notes: "",
};

interface DraftEvidence extends Evidence {
  stage: EvidenceStage;
}

export default function NewInvestigationPage() {
  const { cases, createInvestigation, session } = useCaseLink();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [evidence, setEvidence] = useState<DraftEvidence[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [evType, setEvType] = useState<EvidenceType>("CCTV");
  const [evLabel, setEvLabel] = useState("");
  const [evLocation, setEvLocation] = useState(LOCATION_PRESETS[0]!.name);
  const [evWhen, setEvWhen] = useState(new Date().toISOString().slice(0, 16));
  const [evDetails, setEvDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [investigators, setInvestigators] = useState<EligibleInvestigator[]>([]);
  const [investigatorsLoading, setInvestigatorsLoading] = useState(true);
  const [investigatorsError, setInvestigatorsError] = useState<string | null>(null);
  const [investigatorId, setInvestigatorId] = useState(session?.userId ?? "");

  useEffect(() => {
    let active = true;
    setInvestigatorsLoading(true);
    void loadEligibleInvestigators(supabase)
      .then((rows) => { if (active) { setInvestigators(rows); setInvestigatorsError(null); } })
      .catch((cause) => { if (active) setInvestigatorsError(cause instanceof Error ? cause.message : "Investigators could not be loaded."); })
      .finally(() => { if (active) setInvestigatorsLoading(false); });
    return () => { active = false; };
  }, []);

  const priorityEligible = useMemo(() => investigators.filter((person) =>
    draft.priority === "High" || draft.priority === "Critical"
      ? person.roles.includes("senior_investigator")
      : person.roles.some((role) => role === "investigator" || role === "senior_investigator"),
  ), [draft.priority, investigators]);
  const selectedInvestigator = investigators.find((person) => person.id === investigatorId);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const input =
    "w-full rounded-md border border-input bg-background/70 px-2.5 py-1.5 text-[12px] outline-none focus:border-cyan/60";

  const validate = (target: number) => {
    const errs: string[] = [];
    if (target >= 1 && draft.caseNo.trim().length < 3)
      errs.push("Case number must be at least 3 characters.");
    if (target >= 1 && draft.name.trim().length < 3)
      errs.push("Subject name must be at least 3 characters.");
    if (target >= 2) {
      if (!draft.date) errs.push("Incident date and time is required.");
      else if (Number.isNaN(+new Date(draft.date))) errs.push("Incident date is invalid.");
      if (!draft.location.trim()) errs.push("Last known location is required.");
      if (!investigatorId || !priorityEligible.some((person) => person.id === investigatorId)) {
        errs.push("Select an approved investigator who is eligible for this case priority.");
      }
    }
    setErrors(errs);
    return errs.length === 0;
  };

  const draftLabel = draft.caseNo.trim() || "Unnumbered draft";

  const addEvidenceRow = () => {
    if (evLabel.trim().length < 3) {
      toast.error("Evidence label must be at least 3 characters.");
      return;
    }
    const preset =
      LOCATION_PRESETS.find((p) => p.name === evLocation) ?? LOCATION_PRESETS[0]!;
    const id = `DRAFT-E${String(evidence.length + 1).padStart(2, "0")}`;
    const row: DraftEvidence = {
      id,
      caseId: "pending-database-case",
      type: evType,
      label: evLabel.trim(),
      source: "Metadata intake; file storage not configured",
      timestamp: new Date(evWhen).toISOString(),
      locationName: preset.name,
      lat: preset.lat,
      lng: preset.lng,
      reliability: null,
      details: evDetails.trim() || `${evType} record submitted during intake.`,
      interpretation: "Metadata only. No evidence file has been uploaded or stored.",
      keywords: [
        ...(draft.vehicle ? [draft.vehicle] : []),
        ...(draft.phone ? [draft.phone] : []),
        evType.toLowerCase(),
        preset.name.split(",")[0]!.toLowerCase(),
      ],
      stage: "INDEXED",
    };
    setEvidence((prev) => [...prev, row]);
    setEvLabel("");
    setEvDetails("");
  };

  const buildInput = (): CreateInvestigationInput => {
    const incidentLocation = LOCATION_PRESETS.find((preset) => preset.name === draft.location) ?? null;
    return {
      caseNo: draft.caseNo.trim(),
      firNumber: draft.firNumber.trim() || null,
      title:
        draft.type === "Missing Person"
          ? `Disappearance of ${draft.name.trim()}`
          : `${draft.type} — ${draft.location}`,
      crimeType: draft.type,
      description: draft.notes.trim() || null,
      occurredAt: new Date(draft.date).toISOString(),
      location: incidentLocation
        ? { name: incidentLocation.name, latitude: incidentLocation.lat, longitude: incidentLocation.lng }
        : null,
      status: "Active",
      priority: draft.priority,
      tags: Array.from(new Set([draft.type, ...evidence.flatMap((item) => item.keywords)])),
      modusOperandi: draft.modus.trim() ? [draft.modus.trim()] : [],
      notes: draft.notes.trim() || null,
      isSynthetic: true,
      subject: {
        fullName: draft.name.trim(),
        aliases: draft.aliases
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        age: draft.age ? Number(draft.age) : null,
        phone: draft.phone.trim() || null,
        description: null,
      },
      vehicle: draft.vehicle.trim() || null,
      witnessNames: draft.witnesses
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
      weapon: draft.weapon.trim() || null,
      evidence: evidence.map((item) => ({
        category: item.type,
        label: item.label,
        description: item.details || null,
        collectedAt: item.timestamp,
        latitude: item.lat,
        longitude: item.lng,
      })),
    };
  };

  const submit = async () => {
    if (submitting) return;
    if (!validate(2)) {
      setStep(0);
      return;
    }
    setSubmitting(true);
    setErrors([]);
    try {
      if (!session) throw new Error("An authenticated session is required.");
      const result = await createInvestigation(buildInput(), investigatorId);

      if (uploadFile) {
  await uploadEvidenceFile({
    caseId: result.caseId,
    category: "Document",
    displayLabel: uploadFile.name,
    description: `Evidence uploaded during investigation intake.`,
    collectedAt: new Date().toISOString(),
    file: uploadFile,
  });
}
      const runMatching = {
        label: "Run matching",
        onClick: () => void router.navigate({ to: "/engine", search: {} }),
      };
      if (result.childFailures.length) {
        toast.warning(`${result.caseNo} created with incomplete related data`, {
          description: result.childFailures.join(" · "),
          action: runMatching,
        });
      } else {
        toast.success(`${result.caseNo} created in Supabase`, {
          description: "Run Intelligent Matching to evaluate the new database case.",
          action: runMatching,
        });
      }
      if (result.auditError) {
        toast.warning("Case created, but its audit record failed", { description: result.auditError });
      }
      if (result.assignmentError) {
        toast.warning("Case created, but investigator assignment failed", {
          description: `${result.assignmentError} The database register was refreshed to show the actual stored assignment.`,
        });
      }
      if (result.reloadError) {
        toast.warning("Case created, but the database register could not be reloaded", {
          description: result.reloadError,
        });
      }
      void router.navigate({ to: "/investigations/$caseId", params: { caseId: result.caseId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Investigation creation failed.";
      setErrors([message]);
      toast.error("Investigation was not created", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell title="New Investigation" subtitle={`Database intake · ${draftLabel}`}>
      <div className="panel mb-3 flex items-center gap-2 overflow-x-auto p-2.5">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => (i <= step || validate(i) ? setStep(i) : null)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
              i === step
                ? "border-cyan/50 bg-cyan/15 text-cyan"
                : i < step
                  ? "border-success/40 text-success"
                  : "border-border text-muted-foreground",
            )}
          >
            {i < step ? <Check className="size-3" /> : <span>{i + 1}</span>} {s}
          </button>
        ))}
      </div>

      {errors.length ? (
        <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-2.5">
          {errors.map((e) => (
            <p key={e} className="font-mono text-[11px] text-danger">
              · {e}
            </p>
          ))}
        </div>
      ) : null}

      <div className="panel space-y-4 p-4">
        {step === 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Case number *">
              <input className={input} value={draft.caseNo} onChange={(e) => set("caseNo", e.target.value)} />
            </Field>
            <Field label="FIR number">
              <input className={input} value={draft.firNumber} onChange={(e) => set("firNumber", e.target.value)} />
            </Field>
            <Field label="Subject name *">
              <input className={input} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Known aliases (comma separated)">
              <input className={input} value={draft.aliases} onChange={(e) => set("aliases", e.target.value)} />
            </Field>
            <Field label="Age">
              <input
                className={input}
                inputMode="numeric"
                value={draft.age}
                onChange={(e) => set("age", e.target.value.replace(/[^\d]/g, ""))}
              />
            </Field>
            <Field label="Contact number">
              <input className={input} value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Associated vehicle">
              <input
                className={input}
                placeholder="TN-09-BX-4471 (white hatchback)"
                value={draft.vehicle}
                onChange={(e) => set("vehicle", e.target.value)}
              />
            </Field>
            <Field label="Witnesses (comma separated)">
              <input className={input} value={draft.witnesses} onChange={(e) => set("witnesses", e.target.value)} />
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Case type">
              <select className={input} value={draft.type} onChange={(e) => set("type", e.target.value as CaseType)}>
                {CASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                className={input}
                value={draft.priority}
                onChange={(e) => set("priority", e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Incident date & time *">
              <input
                type="datetime-local"
                className={input}
                value={draft.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field label="Last known location *">
              <select className={input} value={draft.location} onChange={(e) => set("location", e.target.value)}>
                {LOCATION_PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Weapon / tool (if any)">
              <input className={input} value={draft.weapon} onChange={(e) => set("weapon", e.target.value)} />
            </Field>
            <Field label="Modus operandi">
              <input className={input} value={draft.modus} onChange={(e) => set("modus", e.target.value)} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Case notes">
                <textarea
                  rows={4}
                  className={input}
                  value={draft.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Evidence type">
                <select className={input} value={evType} onChange={(e) => setEvType(e.target.value as EvidenceType)}>
                  {EVIDENCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Label">
                <input className={input} value={evLabel} onChange={(e) => setEvLabel(e.target.value)} />
              </Field>
              <Field label="Location">
                <select className={input} value={evLocation} onChange={(e) => setEvLocation(e.target.value)}>
                  {LOCATION_PRESETS.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Recorded at">
                <input
                  type="datetime-local"
                  className={input}
                  value={evWhen}
                  onChange={(e) => setEvWhen(e.target.value)}
                />
              </Field>
              <Field label="Source reliability">
                <p className="rounded-md border border-border bg-background/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  Not recorded by the current database schema
                </p>
              </Field>
              <Field label="Detail">
                <input className={input} value={evDetails} onChange={(e) => setEvDetails(e.target.value)} />
              </Field>
            </div>
            <button
              onClick={addEvidenceRow}
              className="flex items-center gap-1.5 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:bg-cyan/25"
            >
              <Plus className="size-3" /> Add evidence metadata
            </button>

            <button
  type="button"
  onClick={() => document.getElementById("new-investigation-evidence-file")?.click()}
  className="flex items-center gap-1.5 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:bg-cyan/25"
>
  <Upload className="size-3" /> Upload evidence file
</button>
<input
  id="new-investigation-evidence-file"
  type="file"
  className="hidden"
  accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.doc,.docx,.mp4,.webm,.mov"
  onChange={(event) => {
    const selected = event.target.files?.[0] ?? null;
    setUploadFile(selected);
  }}
/>
{uploadFile ? (
  <p className="text-[11px] text-muted-foreground">
    Selected file: <span className="text-foreground">{uploadFile.name}</span>
  </p>
) : null}

            <div className="space-y-2">
              {evidence.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No evidence metadata added. Evidence file storage is not configured in this phase.
                </p>
              ) : (
                evidence.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 rounded-md border border-border/70 bg-surface-2/40 p-2.5"
                  >
                    <span
                      className="size-2 rounded-full animate-trace-pulse"
                      style={{ backgroundColor: EVIDENCE_COLOR[e.type] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-foreground">{e.label}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {e.id} · {e.type} · {e.locationName} · {fmtDateTime(e.timestamp)}
                      </span>
                    </span>
                    <Chip
                      tone={
                        e.stage === "CORRELATED" ? "success" : e.stage === "INDEXED" ? "cyan" : "amber"
                      }
                    >
                      {e.stage}
                    </Chip>
                    <button
                      onClick={() => setEvidence((prev) => prev.filter((x) => x.id !== e.id))}
                      className="text-muted-foreground hover:text-danger"
                      aria-label={`Remove ${e.id}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Review label="Subject" value={draft.name || "—"} />
            <Review label="Aliases" value={draft.aliases || "none recorded"} />
            <Review label="Case type" value={draft.type} />
            <Review label="Priority" value={draft.priority} />
            <Review label="Incident" value={draft.date ? fmtDateTime(new Date(draft.date).toISOString()) : "—"} />
            <Review label="Last known location" value={draft.location} />
            <Review label="Vehicle" value={draft.vehicle || "none"} />
            <Review label="Handset" value={draft.phone || "none"} />
            <Review label="Evidence attached" value={`${evidence.length} record(s)`} />
            <Review label="Witnesses" value={draft.witnesses || "none"} />
            <Review label="Assigned investigator" value={selectedInvestigator?.fullName ?? "Name not recorded"} />
            <div className="md:col-span-2 rounded-md border border-cyan/25 bg-cyan/[0.06] p-3 text-[12px] leading-relaxed text-muted-foreground">
              Submission writes this investigation to Supabase. It does not generate or claim a
              connection score. After creation, run Intelligent Matching to evaluate it against the
              {` ${cases.length}`} existing database files.
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <Field label="Assigned investigator *">
            <select className={input} value={investigatorId} disabled={investigatorsLoading} onChange={(event) => setInvestigatorId(event.target.value)}>
              <option value="">{investigatorsLoading ? "Loading approved investigators…" : "Select an approved investigator"}</option>
              {priorityEligible.map((person) => <option key={person.id} value={person.id}>{person.fullName} — {person.roles.map((role) => role === "senior_investigator" ? "Senior Investigator" : "Investigator").join(", ")} · {[person.rankDesignation, person.unitOrAgency].filter(Boolean).join(" · ") || "Professional details not recorded"} · {person.activeCaseCount} active case{person.activeCaseCount === 1 ? "" : "s"}</option>)}
            </select>
            {investigatorsError ? <span className="block text-[11px] text-danger">{investigatorsError}</span> : null}
            <span className="block text-[11px] text-muted-foreground">High and Critical cases list approved Senior Investigators. Cross-user assignment remains unavailable until the proposed secure assignment RPC is applied.</span>
          </Field>
        ) : null}

        <div className="flex items-center justify-between border-t border-border/70 pt-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-md border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground disabled:opacity-40"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              onClick={() => {
                if (validate(step + 1)) setStep((s) => s + 1);
              }}
              className="rounded-md border border-cyan/50 bg-cyan/15 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:bg-cyan/25"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-md border border-success/50 bg-success/15 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-success hover:bg-success/25 disabled:opacity-60"
            >
              {submitting ? "Saving to Supabase…" : "Create investigation"}
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label-xs">{label}</span>
      {children}
    </label>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-surface-2/40 p-2.5">
      <p className="label-xs">{label}</p>
      <p className="mt-0.5 text-[12px] text-foreground">{value}</p>
    </div>
  );
}
