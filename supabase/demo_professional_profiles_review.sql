-- ONE-TIME DEMO DATA FOR EXPLICIT REVIEW ONLY. DO NOT PRESENT THESE FICTIONAL
-- PROFESSIONAL DETAILS AS REAL EMPLOYMENT CREDENTIALS. DO NOT RUN WITHOUT REVIEW.
BEGIN;
CREATE TEMP TABLE _demo_profiles (expected_name text PRIMARY KEY, user_id uuid UNIQUE) ON COMMIT DROP;

DO $check$
DECLARE _name text; _count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typnamespace='public'::regnamespace AND t.typname='app_role' AND e.enumlabel='senior_investigator') THEN RAISE EXCEPTION 'app_role lacks senior_investigator'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_roles'::regclass AND contype='u' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.user_roles'::regclass AND attname='user_id'),(SELECT attnum FROM pg_attribute WHERE attrelid='public.user_roles'::regclass AND attname='role')]) THEN RAISE EXCEPTION 'Expected user_roles(user_id, role) uniqueness is missing'; END IF;
  FOREACH _name IN ARRAY ARRAY['Anshula Raman','Shreenithi','Preethi','Keerthana','Anirudh','Jayanthi'] LOOP
    SELECT count(*) INTO _count FROM public.profiles WHERE full_name=_name AND approval_status='VERIFIED_APPROVED';
    IF _count <> 1 THEN RAISE EXCEPTION 'Expected exactly one VERIFIED_APPROVED profile named %, found %', _name, _count; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE full_name=_name AND approval_status<>'VERIFIED_APPROVED') THEN RAISE EXCEPTION 'An unapproved duplicate profile exists for %', _name; END IF;
    INSERT INTO _demo_profiles SELECT _name,id FROM public.profiles WHERE full_name=_name AND approval_status='VERIFIED_APPROVED';
  END LOOP;

  SELECT count(*) INTO _count
  FROM public.profiles
  WHERE approval_status='VERIFIED_APPROVED'
    AND lower(btrim(full_name)) IN ('yoyohoneysingh010606','priya');
  IF _count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one VERIFIED_APPROVED profile named yoyohoneysingh010606 or Priya, found %', _count;
  END IF;
  INSERT INTO _demo_profiles(expected_name,user_id)
  SELECT 'yoyohoneysingh010606',id
  FROM public.profiles
  WHERE approval_status='VERIFIED_APPROVED'
    AND lower(btrim(full_name)) IN ('yoyohoneysingh010606','priya');
END;
$check$;

UPDATE public.profiles p SET
  full_name = CASE d.expected_name WHEN 'yoyohoneysingh010606' THEN 'Priya' ELSE p.full_name END,
  rank_designation = CASE d.expected_name WHEN 'Shreenithi' THEN 'Senior Investigator' WHEN 'Anirudh' THEN 'Senior Investigator' WHEN 'Jayanthi' THEN 'Administrator' ELSE 'Investigator' END,
  service_start_date = CASE d.expected_name WHEN 'Anshula Raman' THEN DATE '2023-05-21' WHEN 'Shreenithi' THEN DATE '2019-07-15' WHEN 'Preethi' THEN DATE '2022-06-10' WHEN 'Keerthana' THEN DATE '2021-09-01' WHEN 'Anirudh' THEN DATE '2018-04-12' WHEN 'Jayanthi' THEN DATE '2015-01-20' ELSE DATE '2020-11-05' END,
  specialization = CASE d.expected_name WHEN 'Anshula Raman' THEN 'Property crime and burglary' WHEN 'Shreenithi' THEN 'Digital evidence and cross-case analysis' WHEN 'Preethi' THEN 'Missing-person investigations' WHEN 'Keerthana' THEN 'Vehicle crime and assault investigations' WHEN 'Anirudh' THEN 'Cybercrime and digital forensics' WHEN 'Jayanthi' THEN 'Investigation administration' ELSE 'Financial investigation' END,
  professional_bio = CASE d.expected_name WHEN 'Anshula Raman' THEN 'Investigator specializing in property crime, evidence review and burglary-pattern analysis.' WHEN 'Shreenithi' THEN 'Senior investigator experienced in digital evidence, case coordination and identifying patterns across investigations.' WHEN 'Preethi' THEN 'Investigator specializing in witness coordination, missing-person investigations and timeline reconstruction.' WHEN 'Keerthana' THEN 'Investigator experienced in vehicle identification, CCTV review, vehicle-related theft and assault investigations.' WHEN 'Anirudh' THEN 'Senior investigator specializing in cybercrime, digital forensics and electronic-evidence analysis.' WHEN 'Jayanthi' THEN 'Administrator responsible for authorization review, investigation oversight, audit compliance and case coordination.' ELSE 'Investigator specializing in financial records, fraud indicators and evidence documentation.' END
FROM _demo_profiles d WHERE p.id=d.user_id;

INSERT INTO public.user_roles(user_id,role)
SELECT user_id,'senior_investigator'::public.app_role FROM _demo_profiles WHERE expected_name IN ('Shreenithi','Anirudh')
ON CONFLICT (user_id,role) DO NOTHING;
INSERT INTO public.user_roles(user_id,role)
SELECT user_id,'investigator'::public.app_role FROM _demo_profiles WHERE expected_name IN ('Anshula Raman','Shreenithi','Preethi','Keerthana','Anirudh','yoyohoneysingh010606')
ON CONFLICT (user_id,role) DO NOTHING;
INSERT INTO public.user_roles(user_id,role)
SELECT user_id,'administrator'::public.app_role FROM _demo_profiles WHERE expected_name='Jayanthi'
ON CONFLICT (user_id,role) DO NOTHING;
COMMIT;

SELECT p.full_name,p.rank_designation,p.service_start_date,p.specialization,
  array_agg(ur.role ORDER BY ur.role) AS assigned_roles
FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id
WHERE p.full_name IN ('Anirudh','Anshula Raman','Jayanthi','Keerthana','Preethi','Priya','Shreenithi')
GROUP BY p.id,p.full_name,p.rank_designation,p.service_start_date,p.specialization
ORDER BY p.full_name;
