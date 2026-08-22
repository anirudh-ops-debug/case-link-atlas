import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionTitle, fmtDateTime } from "@/components/caselink/bits";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { addInvestigationTheory, listInvestigationTheories, type InvestigationTheoryRecord } from "@/lib/caselink/investigation-theories.repository";
import { useCaseLink } from "@/lib/caselink/store";

interface InvestigationTheoriesProps {
  caseId: string;
  status: string;
  investigatorId: string | undefined;
}

export function InvestigationTheories({ caseId, status, investigatorId }: InvestigationTheoriesProps) {
  const { session } = useCaseLink();
  const [theories, setTheories] = useState<InvestigationTheoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [theoryText, setTheoryText] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTheories(await listInvestigationTheories(supabase, caseId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Theories could not be loaded."); }
    finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  const trimmedLength = theoryText.trim().length;
  const activeOrDormant = status === "Active" || status === "Dormant";
  const supervisor = session?.role === "SUPERVISOR" || session?.role === "ADMIN";
  const assignedInvestigator = session?.role === "INVESTIGATOR" && session.userId === investigatorId;
  const canAdd = activeOrDormant && (supervisor || assignedInvestigator);

  async function saveTheory() {
    if (saving || trimmedLength < 1 || trimmedLength > 5000) return;
    setSaving(true); setSaveError(null);
    try {
      await addInvestigationTheory(supabase, caseId, theoryText);
      await load();
      window.dispatchEvent(new CustomEvent("caselink:theories-updated", { detail: { caseId } }));
      setTheoryText(""); setOpen(false); toast.success("Investigation theory saved.");
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "The theory could not be saved."); }
    finally { setSaving(false); }
  }

  return <section id="investigation-theories" tabIndex={-1} className="panel mt-3 scroll-mt-4 p-4 focus:outline-none" aria-labelledby="investigation-theories-heading">
    <SectionTitle right={<span className="font-mono text-[10px] text-muted-foreground">{theories.length} recorded</span>}><span id="investigation-theories-heading">Investigation Theories</span></SectionTitle>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">Investigative theories are hypotheses and are not verified evidence.{status === "Dormant" ? " This case is Dormant." : ""}</p>
      {canAdd ? <button type="button" onClick={() => { setSaveError(null); setOpen(true); }} className="rounded-md border border-cyan/50 bg-cyan/10 px-3 py-2 text-sm text-cyan">Add Theory</button> : null}
    </div>
    {status === "Closed" ? <p className="mb-4 rounded-md border p-3 text-sm text-muted-foreground">Reactivate this case before adding another theory.</p> : null}
    {loading ? <p className="text-sm text-muted-foreground">Loading theories…</p> : error ? <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3"><p className="text-sm text-danger">{error}</p><button type="button" onClick={() => void load()} className="mt-2 text-sm text-cyan">Retry</button></div> : theories.length === 0 ? <p className="text-sm text-muted-foreground">No recorded theories</p> : <div className="space-y-3">{theories.map((theory) => <article key={theory.id} className="rounded-md border bg-background/40 p-4"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{theory.content}</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{theory.authorName}</span><time dateTime={theory.createdAt}>{fmtDateTime(theory.createdAt)}</time><span>Investigative theory — not verified evidence</span></div></article>)}</div>}
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { setOpen(next); if (!next) setSaveError(null); } }}><DialogContent onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onPointerDownOutside={(event) => { if (saving) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>Add Theory</DialogTitle><DialogDescription>Record an investigative hypothesis. It will not be treated as verified evidence and will remain part of the case history.</DialogDescription></DialogHeader>
      <div><label htmlFor="investigation-theory-text" className="text-sm font-medium">Theory</label><Textarea id="investigation-theory-text" value={theoryText} onChange={(event) => setTheoryText(event.target.value)} rows={8} maxLength={5000} disabled={saving} className="mt-2" aria-describedby="theory-character-count theory-guidance" /><div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground"><span id="theory-guidance">Enter 1–5,000 non-whitespace characters.</span><span id="theory-character-count">{trimmedLength}/5,000</span></div></div>
      {saveError ? <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{saveError}</p> : null}
      <DialogFooter><DialogClose asChild><button type="button" disabled={saving} className="rounded-md border px-3 py-2 text-sm">Cancel</button></DialogClose><button type="button" disabled={saving || trimmedLength < 1 || trimmedLength > 5000} onClick={() => void saveTheory()} className="rounded-md border border-cyan/50 bg-cyan/10 px-3 py-2 text-sm text-cyan disabled:opacity-50">{saving ? "Saving…" : "Save Theory"}</button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
