import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getRequestedConnectionScore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ connectionId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const result = await context.supabase
      .from("case_connections")
      .select("id, score")
      .eq("id", data.connectionId)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return result.data ? { id: result.data.id, score: Number(result.data.score) } : null;
  });
