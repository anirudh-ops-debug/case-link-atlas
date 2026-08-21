import { useEffect, useState } from "react";

import { restoreEvidence, withdrawEvidence } from "@/lib/caselink/evidence.repository";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EvidenceWithdrawalDialogProps {
  evidence: { id: string; title: string; withdrawn: boolean } | null;
  open: boolean;
  canRestore: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}

export function EvidenceWithdrawalDialog({ evidence, open, canRestore, onOpenChange, onCompleted }: EvidenceWithdrawalDialogProps) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!open) { setReason(""); setError(null); setPending(false); } }, [open]);
  if (!evidence) return null;
  const evidenceId = evidence.id;
  const restoring = evidence.withdrawn;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const trimmedReason = reason.trim();
    if (!restoring && (trimmedReason.length < 1 || trimmedReason.length > 1_000)) {
      setError("Withdrawal reason must contain between 1 and 1,000 characters.");
      return;
    }
    setPending(true); setError(null);
    try {
      if (restoring) await restoreEvidence(evidenceId); else await withdrawEvidence(evidenceId, trimmedReason);
      onCompleted(); onOpenChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Evidence could not be updated."); }
    finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}><DialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>{restoring ? "Restore evidence" : "Withdraw evidence"}</DialogTitle>
      <DialogDescription>{restoring ? "Restoration returns this evidence to normal access. Only supervisors and administrators may restore evidence." : "Withdrawal hides evidence from normal access but does not delete the stored file."}</DialogDescription>
    </DialogHeader>
    {restoring && !canRestore ? <p className="text-destructive" role="alert">You are not authorized to restore this evidence.</p> : <form className="space-y-3" onSubmit={submit}>
      {!restoring && <label className="block text-sm font-medium">Withdrawal reason
        <textarea className="mt-1 min-h-24 w-full rounded-md border border-input bg-background p-2" value={reason} maxLength={1000} required disabled={pending} onChange={(event) => setReason(event.target.value)} />
        <span className="text-xs text-muted-foreground">{reason.trim().length}/1000 characters</span>
      </label>}
      {error && <p className="text-destructive" role="alert">{error}</p>}
      <DialogFooter><button type="button" className="rounded-md border px-3 py-2 text-sm" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={pending || (!restoring && (reason.trim().length < 1 || reason.trim().length > 1000))}>{pending ? "Saving…" : restoring ? "Restore" : "Withdraw"}</button>
      </DialogFooter>
    </form>}
  </DialogContent></Dialog>;
}
