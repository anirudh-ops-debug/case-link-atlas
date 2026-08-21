import { useEffect, useRef, useState } from "react";

import {
  type EvidenceUploadStage,
  EvidenceUploadError,
  uploadEvidenceFile,
  validateEvidenceFile,
} from "@/lib/caselink/evidence.repository";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EvidenceUploadDialogProps {
  caseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (notice: { auditWarning: string | null }) => void;
}

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function EvidenceUploadDialog({ caseId, open, onOpenChange, onUploaded }: EvidenceUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("Document");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [stage, setStage] = useState<EvidenceUploadStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleanupWarning, setCleanupWarning] = useState<string | null>(null);
  const cancelled = useRef(false);

  const pending = stage != null && stage !== "Complete";
  const canCancel = stage == null || stage === "Validating file" || stage === "Calculating integrity checksum";

  useEffect(() => {
    if (!open) {
      setFile(null); setCategory("Document"); setLabel(""); setDescription(""); setCollectedAt("");
      setStage(null); setError(null); setCleanupWarning(null);
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || pending) return;
    setError(null); setCleanupWarning(null);
    cancelled.current = false;
    try {
      setStage("Validating file");
      validateEvidenceFile(file);
      const result = await uploadEvidenceFile({
        caseId,
        category,
        displayLabel: label,
        description,
        collectedAt: collectedAt ? new Date(collectedAt).toISOString() : null,
        file,
        onStage: setStage,
        isCancelled: () => cancelled.current,
      });
      onUploaded({ auditWarning: result.auditWarning });
      onOpenChange(false);
    } catch (cause) {
      setStage(null);
      setError(cause instanceof Error ? cause.message : "Evidence could not be uploaded.");
      setCleanupWarning(cause instanceof EvidenceUploadError ? cause.orphanCleanupWarning : null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && pending && canCancel) cancelled.current = true; if (!pending || canCancel) onOpenChange(next); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload evidence</DialogTitle>
          <DialogDescription>Files are stored privately. File checks and permissions are verified before upload.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <label className="block text-sm font-medium">File
            <input className={`${inputClass} mt-1`} type="file" disabled={pending} required
              accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.doc,.docx,.mp4,.webm,.mov,image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected); setCleanupWarning(null); setError(null);
                if (selected) {
                  try { validateEvidenceFile(selected); }
                  catch (cause) { setError(cause instanceof Error ? cause.message : "This file is not eligible for upload."); }
                }
              }} />
          </label>
          {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || "Type unavailable"}</p>}
          <label className="block text-sm font-medium">Title / label
            <input className={`${inputClass} mt-1`} value={label} onChange={(event) => setLabel(event.target.value)} disabled={pending} required />
          </label>
          <label className="block text-sm font-medium">Category
            <input className={`${inputClass} mt-1`} value={category} onChange={(event) => setCategory(event.target.value)} disabled={pending} required />
          </label>
          <label className="block text-sm font-medium">Description
            <textarea className={`${inputClass} mt-1 min-h-20`} value={description} onChange={(event) => setDescription(event.target.value)} disabled={pending} />
          </label>
          <label className="block text-sm font-medium">Collected date and time (optional)
            <input className={`${inputClass} mt-1`} type="datetime-local" value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} disabled={pending} />
          </label>
          {stage && <p className="rounded-md bg-muted p-2 text-sm" role="status">{stage}</p>}
          {error && <p className="rounded-md border border-destructive/50 p-2 text-sm text-destructive" role="alert">{error}</p>}
          {cleanupWarning && <p className="rounded-md border border-amber-500/50 p-2 text-sm text-amber-700" role="alert">Upload failed. Cleanup warning: {cleanupWarning}</p>}
          <DialogFooter>
            <button type="button" className="rounded-md border px-3 py-2 text-sm" disabled={pending && !canCancel} onClick={() => { if (pending && canCancel) cancelled.current = true; onOpenChange(false); }}>Cancel</button>
            <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={!file || !label.trim() || !category.trim() || pending}>Upload</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
