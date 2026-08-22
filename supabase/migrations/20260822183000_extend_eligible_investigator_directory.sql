-- Follow-up only: extends the already-applied eligible-investigator directory with
-- the minimum recorded fields required for explainable deterministic ranking.
BEGIN;
DROP FUNCTION IF EXISTS public.list_eligible_case_investigators();
CREATE FUNCTION public.list_eligible_case_investigators()
RETURNS TABLE (
  id uuid, full_name text, roles public.app_role[], rank_designation text,
  specialization text, service_start_date date, unit_or_agency text,
  active_case_count bigint, total_case_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user(auth.uid()) THEN
    RAISE EXCEPTION 'Authentication and approval are required';
  END IF;
  RETURN QUERY
  SELECT p.id, COALESCE(NULLIF(btrim(p.full_name), ''), 'Name not recorded'),
    array_agg(DISTINCT ur.role ORDER BY ur.role), p.rank_designation,
    p.specialization, p.service_start_date, COALESCE(p.unit, a.name),
    count(c.id) FILTER (WHERE c.status = 'Active'), count(c.id)
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('investigator', 'senior_investigator')
  LEFT JOIN public.agencies a ON a.id = p.agency_id
  LEFT JOIN public.cases c ON c.investigator_id = p.id
  WHERE p.approval_status = 'VERIFIED_APPROVED'
  GROUP BY p.id, p.full_name, p.rank_designation, p.specialization,
    p.service_start_date, p.unit, a.name;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_eligible_case_investigators() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_eligible_case_investigators() TO authenticated;
COMMIT;
