import { useEffect, useState } from "react";

import { createEvidencePreviewUrl } from "@/lib/caselink/evidence.repository";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EvidencePreviewDialogProps {
  evidence: { storagePath: string; title: string; originalFilename: string | null; mimeType: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EvidencePreviewDialog({ evidence, open, onOpenChange }: EvidencePreviewDialogProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl(null); setError(null); setVideoError(false);
    if (!open || !evidence) return () => { active = false; };
    createEvidencePreviewUrl(evidence.storagePath).then((nextUrl) => {
      if (active) setUrl(nextUrl);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Preview could not be loaded.");
    });
    return () => { active = false; };
  }, [open, evidence]);

  const type = evidence?.mimeType;
  const name = evidence?.originalFilename || evidence?.title || "evidence file";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Preview evidence</DialogTitle><DialogDescription>{name}</DialogDescription></DialogHeader>
        {!url && !error && <p role="status">Generating a private preview…</p>}
        {error && <p className="text-destructive" role="alert">{error}</p>}
        {url && (type?.startsWith("image/") ? <img src={url} alt={`Evidence preview: ${name}`} className="max-h-[65vh] w-full object-contain" />
          : type?.startsWith("video/") ? <div className="space-y-2"><video className="max-h-[65vh] w-full" controls preload="metadata" onError={() => setVideoError(true)}><source src={url} type={type} /></video>{videoError && <p className="rounded-md border border-amber-500/50 p-2 text-sm" role="alert">This video format cannot be previewed by this browser. Close this dialog and use Download instead.</p>}</div>
          : type === "application/pdf" ? <div className="space-y-2"><iframe className="h-[65vh] w-full" src={url} title={`Evidence preview: ${name}`} sandbox="" referrerPolicy="no-referrer" /><p className="text-sm text-muted-foreground">If the isolated PDF viewer cannot display this file, <a className="underline" href={url} target="_blank" rel="noopener noreferrer">open the PDF in a new tab</a>.</p></div>
          : <p>This file type is download-only for safety.</p>)}
      </DialogContent>
    </Dialog>
  );
}
