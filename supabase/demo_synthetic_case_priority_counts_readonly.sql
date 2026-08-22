-- Read-only verification: returns aggregate synthetic-case counts only.
SELECT priority,count(*) AS synthetic_case_count
FROM public.cases WHERE is_synthetic=true GROUP BY priority ORDER BY priority;
