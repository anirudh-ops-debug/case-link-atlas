import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtDateTime } from "@/components/caselink/bits";
import { Shell } from "@/components/caselink/Shell";
import { LOCATION_PRESETS, PRIORITIES } from "@/lib/caselink/data";
import { useCaseLink } from "@/lib/caselink/store";
import type { CreateInvestigationInput } from "@/lib/caselink/investigations.repository";
import type { Priority } from "@/lib/caselink/types";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { loadEligibleInvestigators, type EligibleInvestigator } from "@/lib/caselink/investigations.repository";
import { INTAKE_CASE_TYPES, rankEligibleInvestigators, type IntakeCaseType } from "@/lib/caselink/investigator-recommendations";

export const Route = createFileRoute("/investigations/new")({
  head: () => ({
    meta: [
      { title: "New Investigation · CASELINK" },
      {
        name: "description",
        content:
          "Guided case-information intake with subject details, incident context and secure investigator assignment.",
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

const STEPS = ["Subject", "Incident", "Review"] as const;

interface Draft {
  caseNo: string;
  firNumber: string;
  title: string;
  name: string;
  aliases: string;
  age: string;
  phone: string;
  vehicle: string;
  type: IntakeCaseType;
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
  title: "",
  name: "",
  aliases: "",
  age: "",
  phone: "",
  vehicle: "",
  type: "Missing",
  priority: "High",
  date: new Date().toISOString().slice(0, 16),
  location: LOCATION_PRESETS[0]!.name,
  witnesses: "",
  weapon: "",
  modus: "",
  notes: "",
};

export default function NewInvestigationPage() {
  const { cases, createInvestigation, session } = useCaseLink();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdCase, setCreatedCase] = useState<{ id: string; caseNo: string; assignmentError: string | null } | null>(null);
  const [investigators, setInvestigators] = useState<EligibleInvestigator[]>([]);
  const [investigatorsLoading, setInvestigatorsLoading] = useState(true);
  const [investigatorsError, setInvestigatorsError] = useState<string | null>(null);
  const [investigatorId, setInvestigatorId] = useState("");

  useEffect(() => {
    let active = true;
    setInvestigatorsLoading(true);
    void loadEligibleInvestigators(supabase)
      .then((rows) => { if (active) { setInvestigators(rows); setInvestigatorsError(null); } })
      .catch((cause) => { if (active) setInvestigatorsError(cause instanceof Error ? cause.message : "Investigators could not be loaded."); })
      .finally(() => { if (active) setInvestigatorsLoading(false); });
    return () => { active = false; };
  }, []);

  const priorityEligible = useMemo(() => rankEligibleInvestigators({ people: investigators, caseType: draft.type, priority: draft.priority, actorRole: session?.role, actorUserId: session?.userId, recordedContext: `${draft.notes} ${draft.modus} ${draft.weapon} ${draft.vehicle}` }), [draft, investigators, session]);
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
    if (target >= 1 && draft.title.trim().length < 3)
      errs.push("Case title must be at least 3 characters.");
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

  const buildInput = (): CreateInvestigationInput => {
    const incidentLocation = LOCATION_PRESETS.find((preset) => preset.name === draft.location) ?? null;
    return {
      caseNo: draft.caseNo.trim(),
      firNumber: draft.firNumber.trim() || null,
      title: draft.title.trim(),
      crimeType: draft.type,
      description: draft.notes.trim() || null,
      occurredAt: new Date(draft.date).toISOString(),
      location: incidentLocation
        ? { name: incidentLocation.name, latitude: incidentLocation.lat, longitude: incidentLocation.lng }
        : null,
      status: "Active",
      priority: draft.priority,
      tags: [draft.type],
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
      evidence: [],
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

      const manageEvidence = {
        label: "Manage Evidence",
        onClick: () => void router.navigate({ to: "/evidence", search: { case: result.caseId, upload: false } }),
      };
      if (result.childFailures.length) {
        toast.warning(`${result.caseNo} created with incomplete related data`, {
          description: result.childFailures.join(" · "),
          action: manageEvidence,
        });
      } else {
        toast.success(`${result.caseNo} created in Supabase`, {
          description: "Open the investigation now, or manage its evidence securely.",
          action: manageEvidence,
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
      setCreatedCase({ id: result.caseId, caseNo: result.caseNo, assignmentError: result.assignmentError });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Investigation creation failed.";
      setErrors([message]);
      toast.error("Investigation was not created", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  if (createdCase) { const actual = cases.find((item) => item.id === createdCase.id); return <Shell title="Investigation created" subtitle={`${createdCase.caseNo} · database record`}><section className="panel space-y-4 p-6"><p className="text-sm text-foreground">The case information was stored. Evidence files are managed separately in Evidence Management.</p>{createdCase.assignmentError ? <div role="alert" className="rounded-md border border-amber/50 bg-amber/10 p-3 text-sm"><strong>Assignment failed after case creation.</strong><p className="mt-1 text-muted-foreground">{createdCase.assignmentError}</p><p className="mt-1">Actual recorded assignment: {actual?.officer || "Name not recorded"}. Open the investigation to retry through Change Assigned Investigator.</p></div> : <p className="text-sm">Assigned investigator: {actual?.officer || selectedInvestigator?.fullName || "Name not recorded"}</p>}<div className="flex flex-wrap gap-2"><button type="button" onClick={() => void router.navigate({ to: "/investigations/$caseId", params: { caseId: createdCase.id } })} className="rounded-md border border-cyan/50 bg-cyan/10 px-4 py-2 text-sm text-cyan">Open Investigation</button><button type="button" onClick={() => void router.navigate({ to: "/evidence", search: { case: createdCase.id, upload: false } })} className="rounded-md border px-4 py-2 text-sm">Manage Evidence</button></div></section></Shell>; }

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
            <Field label="Case title *"><input className={input} value={draft.title} onChange={(event) => set("title", event.target.value)} /></Field>
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
              <select className={input} value={draft.type} onChange={(e) => set("type", e.target.value as IntakeCaseType)}>
                {INTAKE_CASE_TYPES.map((t) => (
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
          <div className="grid gap-3 md:grid-cols-2">
            <Review label="Subject" value={draft.name || "—"} />
            <Review label="Case title" value={draft.title || "—"} />
            <Review label="Aliases" value={draft.aliases || "none recorded"} />
            <Review label="Case type" value={draft.type} />
            <Review label="Priority" value={draft.priority} />
            <Review label="Incident" value={draft.date ? fmtDateTime(new Date(draft.date).toISOString()) : "—"} />
            <Review label="Last known location" value={draft.location} />
            <Review label="Vehicle" value={draft.vehicle || "none"} />
            <Review label="Handset" value={draft.phone || "none"} />
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
              {priorityEligible.map((person) => <option key={person.id} value={person.id}>{person.recommended ? "Recommended — " : ""}{person.fullName} — {person.roles.map((role) => role === "senior_investigator" ? "Senior Investigator" : "Investigator").join(", ")} · {person.rankDesignation || "Rank not recorded"} · {person.specialization || "Specialization not recorded"} · {person.unitOrAgency || "Unit not recorded"} · {person.yearsExperience == null ? "Experience not recorded" : `${person.yearsExperience} years recorded service`} · {person.activeCaseCount} active case{person.activeCaseCount === 1 ? "" : "s"}</option>)}
            </select>
            {investigatorsError ? <span className="block text-[11px] text-danger">{investigatorsError}</span> : null}
            <span className="block text-[11px] text-muted-foreground">{priorityEligible.length ? priorityEligible[0]?.explanations.join(" · ") : "No approved investigator is eligible for this case priority."} Assignment requires manual confirmation and remains database-authorized.</span>
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
          {step < 2 ? (
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
