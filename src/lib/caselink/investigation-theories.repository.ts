import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/integrations/supabase/types";

type TheoryRow = Tables<"investigation_theories">;

export interface InvestigationTheoryRecord {
  id: string;
  caseId: string;
  content: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validCaseId(caseId: string): string {
  if (!UUID_PATTERN.test(caseId)) throw new Error("Case ID must be a valid UUID.");
  return caseId;
}

function validTheory(theoryText: string): string {
  const theory = theoryText.trim();
  if (theory.length < 1 || theory.length > 5000) throw new Error("Theory must contain 1 to 5,000 characters.");
  return theory;
}

async function mapTheoryAuthors(client: SupabaseClient<Database>, rows: TheoryRow[]): Promise<InvestigationTheoryRecord[]> {
  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const { data: profiles, error } = authorIds.length
    ? await client.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [], error: null };
  if (error) throw new Error(error.message);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name.trim() || "Name not recorded"]));
  return rows.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    content: row.theory,
    authorName: names.get(row.author_id) ?? "Name not recorded",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listInvestigationTheories(client: SupabaseClient<Database>, caseId: string): Promise<InvestigationTheoryRecord[]> {
  const { data, error } = await client.from("investigation_theories").select("*").eq("case_id", validCaseId(caseId)).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return mapTheoryAuthors(client, data ?? []);
}

export async function addInvestigationTheory(client: SupabaseClient<Database>, caseId: string, theoryText: string): Promise<InvestigationTheoryRecord> {
  const { data, error } = await client.rpc("add_investigation_theory", { _case_id: validCaseId(caseId), _theory: validTheory(theoryText) });
  if (error || !data) throw new Error(error?.message ?? "The theory could not be saved.");
  const [saved] = await mapTheoryAuthors(client, [data]);
  if (!saved) throw new Error("The saved theory could not be loaded.");
  return saved;
}
