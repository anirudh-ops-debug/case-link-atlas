-- REVIEW-ONLY DEMO DATA SCRIPT. The ten case identities and severity decisions
-- below must be reviewed before execution. This script must not target real cases.
BEGIN;

CREATE TEMP TABLE _priority_plan (
  case_no text PRIMARY KEY,
  expected_title text NOT NULL,
  expected_crime_type text NOT NULL,
  target_priority public.case_priority NOT NULL,
  severity_rationale text NOT NULL
) ON COMMIT DROP;

INSERT INTO _priority_plan(case_no,expected_title,expected_crime_type,target_priority,severity_rationale) VALUES
 ('CASE-1042','Missing person — Priya Anand (synthetic)','Missing Person','Critical','Missing person with immediate safety indicators.'),
 ('CL-2026-0042','Disappearance of Arjun Kapoor','Missing Person','Critical','Disappearance requiring the highest reviewed response priority.'),
 ('CASE-1098','Assault — T. Nagar, Chennai','Assault','High','Recorded assault requiring urgent investigation.'),
 ('CASE-7781','Residential burglary — Velachery (synthetic)','Burglary','High','Residential burglary with deliberate surveillance disruption.'),
 ('CASE-8123','Residential burglary — Guindy (synthetic)','Burglary','High','Repeated burglary pattern with vehicle linkage.'),
 ('CASE-4410','Chain snatching — T. Nagar (synthetic)','Theft','Medium','Theft with no recorded physical injury.'),
 ('CASE-4478','Chain snatching — Saidapet (synthetic)','Theft','Medium','Related theft with no recorded physical injury.'),
 ('CASE-9002','Vehicle theft — Perungudi (synthetic)','Vehicle Crime','Medium','Vehicle theft retained as a reviewed medium-priority case.'),
 ('CASE-TEST-9201','Theft — Koyambedu Bus Terminus','Theft','Medium','Reviewed theft case requiring standard investigation priority.'),
 ('CASE-TEST-7001','Theft — Mylapore Tank Road','Theft','Low','Reviewed lower-severity theft case.' );

-- Preview occurs before any update and shows only the ten explicitly reviewed cases.
SELECT p.case_no,p.expected_title,p.expected_crime_type,
  c.priority AS current_priority,p.target_priority,p.severity_rationale,
  (c.case_no=p.case_no AND c.title=p.expected_title AND c.crime_type=p.expected_crime_type AND c.is_synthetic) AS identity_matches
FROM _priority_plan p
LEFT JOIN public.cases c ON c.case_no=p.case_no
ORDER BY p.case_no;

DO $check$
DECLARE _matching_rows integer;
BEGIN
  IF (SELECT count(*) FROM _priority_plan) <> 10 OR (SELECT count(DISTINCT case_no) FROM _priority_plan) <> 10 THEN
    RAISE EXCEPTION 'The reviewed priority plan must contain exactly ten unique cases';
  END IF;
  IF (SELECT count(*) FROM _priority_plan WHERE target_priority='Critical') <> 2
    OR (SELECT count(*) FROM _priority_plan WHERE target_priority='High') <> 3
    OR (SELECT count(*) FROM _priority_plan WHERE target_priority='Medium') <> 4
    OR (SELECT count(*) FROM _priority_plan WHERE target_priority='Low') <> 1 THEN
    RAISE EXCEPTION 'The reviewed plan must be Critical 2, High 3, Medium 4, Low 1';
  END IF;
  SELECT count(*) INTO _matching_rows
  FROM _priority_plan p JOIN public.cases c
    ON c.case_no=p.case_no AND c.title=p.expected_title AND c.crime_type=p.expected_crime_type AND c.is_synthetic;
  IF _matching_rows <> 10 THEN
    RAISE EXCEPTION 'Expected ten exact case_no/title/crime_type matches, found %', _matching_rows;
  END IF;
  IF EXISTS (SELECT 1 FROM _priority_plan p JOIN public.cases c ON c.case_no=p.case_no GROUP BY p.case_no HAVING count(c.id) <> 1) THEN
    RAISE EXCEPTION 'Every reviewed case number must occur exactly once';
  END IF;
END;
$check$;

UPDATE public.cases c
SET priority=p.target_priority,updated_at=now()
FROM _priority_plan p
WHERE c.case_no=p.case_no AND c.title=p.expected_title AND c.crime_type=p.expected_crime_type AND c.is_synthetic;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.cases c JOIN _priority_plan p ON c.case_no=p.case_no AND c.title=p.expected_title AND c.crime_type=p.expected_crime_type AND c.is_synthetic WHERE c.priority=p.target_priority) <> 10 THEN
    RAISE EXCEPTION 'Post-update verification failed';
  END IF;
END;
$verify$;

COMMIT;

-- Final aggregate verification for only the ten reviewed cases.
SELECT c.priority,count(*) AS reviewed_case_count
FROM public.cases c
JOIN (VALUES
 ('CASE-1042'),('CL-2026-0042'),('CASE-1098'),('CASE-7781'),('CASE-8123'),
 ('CASE-4410'),('CASE-4478'),('CASE-9002'),('CASE-TEST-9201'),('CASE-TEST-7001')
) AS reviewed(case_no) ON reviewed.case_no=c.case_no
GROUP BY c.priority ORDER BY c.priority;
