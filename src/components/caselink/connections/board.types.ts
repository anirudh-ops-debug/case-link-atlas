import type { Tables } from "@/integrations/supabase/types";

export interface BoardCaseReference {
  id: string;
  case_no: string;
  title: string;
}

export interface BoardConnection extends Tables<"case_connections"> {
  score: number;
  caseA: BoardCaseReference | null;
  caseB: BoardCaseReference | null;
  stale: boolean;
  factors: Array<
    Omit<Tables<"connection_factors">, "similarity" | "weight"> & {
      similarity: number | null;
      weight: number;
    }
  >;
}
