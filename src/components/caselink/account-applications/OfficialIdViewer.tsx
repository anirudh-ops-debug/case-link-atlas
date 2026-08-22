import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createApplicationIdUrl, type AccountApplication } from "@/lib/caselink/account-applications.repository";

export function OfficialIdViewer({ application, open, onOpenChange }: { application: AccountApplication | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !application) {
      setUrl(null);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void createApplicationIdUrl(application)
      .then((signedUrl) => { if (active) setUrl(signedUrl); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to open the official ID."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; setUrl(null); };
  }, [application, open]);

  const mime = application?.official_id_mime_type ?? "";
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Official ID review</DialogTitle>
        <DialogDescription>Private document · signed access expires after five minutes.</DialogDescription>
      </DialogHeader>
      <p className="rounded border border-amber/40 bg-amber/10 p-3 text-xs text-amber">OCR or file validation does not prove that this document is genuine. Administrator authorization is required.</p>
      {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Requesting secure preview…</p> : null}
      {error ? <p role="alert" className="rounded border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
      {url && mime.startsWith("image/") ? <img src={url} alt="Official identity document submitted for manual review" className="max-h-[65vh] w-full rounded border border-border object-contain" /> : null}
      {url && mime === "application/pdf" ? <iframe src={url} sandbox="" title="Official identity PDF submitted for manual review" className="h-[65vh] w-full rounded border border-border" /> : null}
      {url && !mime.startsWith("image/") && mime !== "application/pdf" ? <p className="p-8 text-center text-sm text-muted-foreground">This document type cannot be previewed safely.</p> : null}
    </DialogContent>
  </Dialog>;
}
