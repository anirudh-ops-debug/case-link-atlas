-- PROPOSED ONLY: review and apply separately before enabling status actions in the UI.
-- PostgreSQL requires a newly added enum value to be committed before functions use it.
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'Dormant';

BEGIN;

CREATE OR REPLACE FUNCTION public.change_investigation_status(
  _case_id uuid,
  _new_status public.case_status
)
RETURNS public.cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  _actor_id uuid := auth.uid();
  _actor_name text;
  _case public.cases%ROWTYPE;
  _is_supervisor boolean;
BEGIN
  IF _actor_id IS NULL OR NOT public.is_approved_user(_actor_id) THEN
    RAISE EXCEPTION 'Authentication and approval are required';
  END IF;
  SELECT * INTO _case FROM public.cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investigation not found'; END IF;

  _is_supervisor := public.has_role(_actor_id, 'senior_investigator') OR public.has_role(_actor_id, 'administrator');
  IF public.has_role(_actor_id, 'authorized_user') AND NOT _is_supervisor THEN
    RAISE EXCEPTION 'Read-only accounts cannot change investigation status';
  END IF;
  IF NOT _is_supervisor AND (NOT public.has_role(_actor_id, 'investigator') OR _case.investigator_id IS DISTINCT FROM _actor_id) THEN
    RAISE EXCEPTION 'You are not authorized to manage this investigation';
  END IF;
  IF _case.status = _new_status THEN RETURN _case; END IF;
  IF NOT (
    (_case.status = 'Active' AND _new_status IN ('Dormant', 'Closed')) OR
    (_case.status = 'Dormant' AND _new_status IN ('Active', 'Closed')) OR
    (_case.status = 'Closed' AND _new_status = 'Active' AND _is_supervisor)
  ) THEN RAISE EXCEPTION 'Invalid investigation status transition'; END IF;

  SELECT full_name INTO _actor_name FROM public.profiles WHERE id = _actor_id;
  UPDATE public.cases SET status = _new_status, updated_at = now() WHERE id = _case_id RETURNING * INTO _case;
  INSERT INTO public.audit_logs(actor_id, actor_name, action_type, action, case_id, detail)
  VALUES (_actor_id, COALESCE(_actor_name, 'Approved user'), 'case_status_change', 'Changed investigation status', _case_id, 'Status changed to ' || _new_status::text);
  RETURN _case;
END;
$function$;

REVOKE ALL ON FUNCTION public.change_investigation_status(uuid, public.case_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_investigation_status(uuid, public.case_status) TO authenticated;

COMMIT;
