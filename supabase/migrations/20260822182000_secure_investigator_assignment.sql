-- PROPOSED ONLY: review and apply before enabling cross-user assignment in the client.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_eligible_case_investigators()
RETURNS TABLE (
  id uuid,
  full_name text,
  roles public.app_role[],
  rank_designation text,
  unit_or_agency text,
  active_case_count bigint,
  total_case_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user(auth.uid()) THEN
    RAISE EXCEPTION 'Authentication and approval are required';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    COALESCE(NULLIF(btrim(p.full_name), ''), 'Name not recorded'),
    array_agg(DISTINCT ur.role ORDER BY ur.role),
    p.rank_designation,
    COALESCE(p.unit, a.name),
    count(c.id) FILTER (WHERE c.status = 'Active'),
    count(c.id)
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('investigator', 'senior_investigator')
  LEFT JOIN public.agencies a ON a.id = p.agency_id
  LEFT JOIN public.cases c ON c.investigator_id = p.id
  WHERE p.approval_status = 'VERIFIED_APPROVED'
  GROUP BY p.id, p.full_name, p.rank_designation, p.unit, a.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_eligible_case_investigators() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_eligible_case_investigators() TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_case_investigator(_case_id uuid, _investigator_id uuid)
RETURNS public.cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  _actor_id uuid := auth.uid();
  _actor_name text;
  _assignee_name text;
  _case public.cases%ROWTYPE;
  _target_is_investigator boolean;
  _target_is_senior boolean;
BEGIN
  IF _actor_id IS NULL OR NOT public.is_approved_user(_actor_id) THEN RAISE EXCEPTION 'Authentication and approval are required'; END IF;
  SELECT * INTO _case FROM public.cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investigation not found'; END IF;
  IF NOT (public.has_role(_actor_id, 'administrator') OR public.has_role(_actor_id, 'senior_investigator') OR (_actor_id = _investigator_id AND public.has_role(_actor_id, 'investigator'))) THEN
    RAISE EXCEPTION 'You are not authorized to make this assignment';
  END IF;
  IF NOT public.is_approved_user(_investigator_id) THEN RAISE EXCEPTION 'Assignee is not approved'; END IF;
  _target_is_investigator := public.has_role(_investigator_id, 'investigator');
  _target_is_senior := public.has_role(_investigator_id, 'senior_investigator');
  IF _case.priority IN ('High', 'Critical') AND NOT _target_is_senior THEN RAISE EXCEPTION 'High and Critical cases require a Senior Investigator'; END IF;
  IF _case.priority NOT IN ('High', 'Critical') AND NOT (_target_is_investigator OR _target_is_senior) THEN RAISE EXCEPTION 'Assignee does not hold an investigator role'; END IF;
  SELECT full_name INTO _assignee_name FROM public.profiles WHERE id = _investigator_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignee profile not found'; END IF;
  SELECT full_name INTO _actor_name FROM public.profiles WHERE id = _actor_id;
  UPDATE public.cases SET investigator_id = _investigator_id, investigator_name = COALESCE(NULLIF(btrim(_assignee_name), ''), 'Name not recorded'), updated_at = now() WHERE id = _case_id RETURNING * INTO _case;
  INSERT INTO public.audit_logs(actor_id, actor_name, action_type, action, case_id, detail)
  VALUES (_actor_id, COALESCE(NULLIF(btrim(_actor_name), ''), 'Approved user'), 'investigator_assignment', 'Assigned investigation', _case_id, 'Assigned to an approved investigator profile.');
  RETURN _case;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_case_investigator(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_case_investigator(uuid, uuid) TO authenticated;

COMMIT;
