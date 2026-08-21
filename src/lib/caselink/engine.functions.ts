import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const verdictSchema = z.object({
  connectionId: z.string().uuid(),
  verdict: z.enum(["pending", "confirmed", "rejected", "inconclusive"]),
  reason: z.string().max(1000).default(""),
});

export const getCorpus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCorpus } = await import("./engine.server");
    return loadCorpus(context.supabase as never);
  });

export const getConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadConnections } = await import("./engine.server");
    return loadConnections(context.supabase as never);
  });

export const runAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runCorrelation } = await import("./engine.server");
    const profile = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const name = (profile.data as { full_name?: string } | null)?.full_name ?? "Investigator";
    return runCorrelation(context.supabase as never, name, context.userId);
  });

/** Single-case run: candidate filtering + seven-factor scoring for one file only. */
export const findHiddenConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ caseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { runCorrelation } = await import("./engine.server");
    const profile = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const name = (profile.data as { full_name?: string } | null)?.full_name ?? "Investigator";
    return runCorrelation(context.supabase as never, name, context.userId, data.caseId);
  });


export const setConnectionVerdict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => verdictSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { recordVerdict } = await import("./engine.server");
    const profile = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const name = (profile.data as { full_name?: string } | null)?.full_name ?? "Investigator";
    return recordVerdict(context.supabase as never, data, context.userId, name);
  });

export const getAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
