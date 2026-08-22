-- PROPOSED ONLY: secure database persistence for investigation theories.
BEGIN;

CREATE TABLE IF NOT EXISTS public.investigation_theories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  theory text NOT NULL CHECK (char_length(btrim(theory)) BETWEEN 1 AND 5000),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investigation_theories_case_created_at_idx
  ON public.investigation_theories (case_id, created_at DESC);
ALTER TABLE public.investigation_theories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investigation_theories FROM anon, authenticated;
GRANT SELECT ON public.investigation_theories TO authenticated;

DROP POLICY IF EXISTS "theories readable by approved users" ON public.investigation_theories;
CREATE POLICY "theories readable by approved users" ON public.investigation_theories
FOR SELECT TO authenticated USING (public.is_approved_user(auth.uid()));

CREATE OR REPLACE FUNCTION public.add_investigation_theory(_case_id uuid, _theory text)
RETURNS public.investigation_theories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  _actor_id uuid := auth.uid();
  _actor_name text;
  _row public.investigation_theories%ROWTYPE;
  _case public.cases%ROWTYPE;
BEGIN
  IF _actor_id IS NULL OR NOT public.is_approved_user(_actor_id) THEN RAISE EXCEPTION 'Authentication and approval are required'; END IF;
  IF _theory IS NULL OR char_length(btrim(_theory)) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Theory must contain 1 to 5000 characters'; END IF;
  SELECT * INTO _case FROM public.cases WHERE id = _case_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investigation not found'; END IF;
  IF _case.status NOT IN ('Active'::public.case_status, 'Dormant'::public.case_status) THEN RAISE EXCEPTION 'Reactivate this case before adding another theory'; END IF;
  IF NOT (public.has_role(_actor_id, 'administrator'::public.app_role) OR public.has_role(_actor_id, 'senior_investigator'::public.app_role) OR (public.has_role(_actor_id, 'investigator'::public.app_role) AND _case.investigator_id = _actor_id)) THEN RAISE EXCEPTION 'You are not authorized to add a theory'; END IF;
  SELECT full_name INTO _actor_name FROM public.profiles WHERE id = _actor_id;
  INSERT INTO public.investigation_theories(case_id, theory, author_id)
  VALUES (_case_id, btrim(_theory), _actor_id) RETURNING * INTO _row;
  INSERT INTO public.audit_logs(actor_id, actor_name, action_type, action, case_id, detail)
  VALUES (_actor_id, COALESCE(NULLIF(btrim(_actor_name), ''), 'Name not recorded'), 'investigation_theory', 'Added investigation theory', _case_id, 'Recorded an append-only investigation theory.');
  RETURN _row;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_investigation_theory(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_investigation_theory(uuid, text) TO authenticated;

COMMIT;
