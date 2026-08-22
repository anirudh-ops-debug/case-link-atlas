-- Proposed CASELINK account-application and professional-profile verification schema.
-- Review against live policies, Auth email-confirmation settings, and Storage limits before applying.
-- This migration intentionally creates no bootstrap administrator and never promotes an applicant automatically.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'authorized_user';

-- PostgreSQL requires a newly added enum value to be committed before it can be used safely.
-- Run this statement separately during preflight if the migration runner wraps whole files in one transaction.
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.application_role AS ENUM ('investigator', 'senior_investigator', 'administrator', 'authorized_user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.application_status AS ENUM (
    'PENDING_DOCUMENT_REVIEW',
    'PENDING_ADMIN_APPROVAL',
    'VERIFIED_APPROVED',
    'FAILED',
    'REJECTED',
    'MORE_INFORMATION_REQUIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_number text,
  ADD COLUMN IF NOT EXISTS rank_designation text,
  ADD COLUMN IF NOT EXISTS service_start_date date,
  ADD COLUMN IF NOT EXISTS specialization text,
  ADD COLUMN IF NOT EXISTS awards text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS professional_bio text,
  ADD COLUMN IF NOT EXISTS approval_status public.application_status NOT NULL DEFAULT 'PENDING_DOCUMENT_REVIEW';

-- Preserve access for accounts that were explicitly assigned roles before this migration.
UPDATE public.profiles p
SET approval_status = 'VERIFIED_APPROVED'
WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id);

CREATE TABLE IF NOT EXISTS public.account_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_role public.application_role NOT NULL,
  full_legal_name text NOT NULL CHECK (length(btrim(full_legal_name)) BETWEEN 2 AND 200),
  agency_department text NOT NULL CHECK (length(btrim(agency_department)) BETWEEN 2 AND 200),
  employee_id_number text NOT NULL CHECK (length(btrim(employee_id_number)) BETWEEN 2 AND 100),
  work_email text NOT NULL,
  contact_number text NOT NULL CHECK (length(btrim(contact_number)) BETWEEN 5 AND 40),
  rank_designation text NOT NULL CHECK (length(btrim(rank_designation)) BETWEEN 2 AND 150),
  service_start_date date NOT NULL CHECK (service_start_date <= current_date),
  specialization text NOT NULL CHECK (length(btrim(specialization)) BETWEEN 2 AND 200),
  awards text[] NOT NULL DEFAULT '{}',
  professional_bio text,
  official_id_path text,
  official_id_mime_type text,
  official_id_original_filename text,
  status public.application_status NOT NULL DEFAULT 'PENDING_DOCUMENT_REVIEW',
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (professional_bio IS NULL OR length(professional_bio) <= 4000),
  CHECK (official_id_path IS NULL OR official_id_path ~ ('^applications/' || user_id::text || '/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp|pdf)$')),
  CHECK (reviewer_id IS NULL OR reviewer_id <> user_id)
);

ALTER TABLE public.account_applications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.account_applications TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.account_applications FROM authenticated;

CREATE OR REPLACE FUNCTION public.is_approved_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = _user_id AND p.approval_status = 'VERIFIED_APPROVED'
  )
$$;
REVOKE ALL ON FUNCTION public.is_approved_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_case_writer(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_approved_user(_user_id) AND (
    public.has_role(_user_id, 'investigator') OR
    public.has_role(_user_id, 'senior_investigator') OR
    public.has_role(_user_id, 'administrator')
  )
$$;
REVOKE ALL ON FUNCTION public.is_case_writer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_case_writer(uuid) TO authenticated;

DROP POLICY IF EXISTS "applications readable by applicant or administrator" ON public.account_applications;
CREATE POLICY "applications readable by applicant or administrator"
ON public.account_applications FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

-- New Auth users receive a profile and an application request, never an approved role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _requested_role public.application_role;
  _service_start date;
  _awards text[];
BEGIN
  INSERT INTO public.profiles (id, full_name, badge_no, unit, contact_number, rank_designation, service_start_date, specialization, awards, professional_bio, approval_status)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_legal_name'), ''), split_part(COALESCE(NEW.email, 'applicant'), '@', 1)),
    NULLIF(btrim(NEW.raw_user_meta_data->>'employee_id_number'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'agency_department'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'contact_number'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'rank_designation'), ''),
    NULLIF(NEW.raw_user_meta_data->>'service_start_date', '')::date,
    NULLIF(btrim(NEW.raw_user_meta_data->>'specialization'), ''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'awards', '[]'::jsonb))),
    NULLIF(btrim(NEW.raw_user_meta_data->>'professional_bio'), ''),
    'PENDING_DOCUMENT_REVIEW'
  ) ON CONFLICT (id) DO NOTHING;

  IF COALESCE((NEW.raw_user_meta_data->>'caselink_application')::boolean, false) THEN
    _requested_role := (NEW.raw_user_meta_data->>'requested_role')::public.application_role;
    _service_start := (NEW.raw_user_meta_data->>'service_start_date')::date;
    _awards := ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'awards', '[]'::jsonb)));
    INSERT INTO public.account_applications (
      user_id, requested_role, full_legal_name, agency_department, employee_id_number,
      work_email, contact_number, rank_designation, service_start_date, specialization,
      awards, professional_bio
    ) VALUES (
      NEW.id, _requested_role, btrim(NEW.raw_user_meta_data->>'full_legal_name'),
      btrim(NEW.raw_user_meta_data->>'agency_department'), btrim(NEW.raw_user_meta_data->>'employee_id_number'),
      COALESCE(NEW.email, ''), btrim(NEW.raw_user_meta_data->>'contact_number'),
      btrim(NEW.raw_user_meta_data->>'rank_designation'), _service_start,
      btrim(NEW.raw_user_meta_data->>'specialization'), _awards,
      NULLIF(btrim(NEW.raw_user_meta_data->>'professional_bio'), '')
    );
    INSERT INTO public.audit_logs (actor_id, actor_name, action_type, action, detail)
    VALUES (NEW.id, btrim(NEW.raw_user_meta_data->>'full_legal_name'), 'account_application', 'Submitted account application', 'Requested role: ' || _requested_role::text);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.attach_application_document(_storage_path text, _mime_type text, _original_filename text)
RETURNS public.account_applications
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE _row public.account_applications;
BEGIN
  IF _storage_path !~ ('^applications/' || auth.uid()::text || '/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp|pdf)$') THEN
    RAISE EXCEPTION 'Invalid application document path';
  END IF;
  UPDATE public.account_applications SET
    official_id_path = _storage_path,
    official_id_mime_type = _mime_type,
    official_id_original_filename = left(_original_filename, 255),
    status = 'PENDING_ADMIN_APPROVAL', updated_at = now()
  WHERE user_id = auth.uid() AND status IN ('PENDING_DOCUMENT_REVIEW', 'MORE_INFORMATION_REQUIRED')
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Application cannot accept a document'; END IF;
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_application_document(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_application_document(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_account_application(
  _application_id uuid,
  _decision public.application_status,
  _notes text DEFAULT NULL
)
RETURNS public.account_applications
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  _row public.account_applications;
  _actor_name text;
  _previous_status public.application_status;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrator') OR NOT public.is_approved_user(auth.uid()) THEN
    RAISE EXCEPTION 'Administrator approval required';
  END IF;
  IF _decision NOT IN ('PENDING_ADMIN_APPROVAL', 'VERIFIED_APPROVED', 'REJECTED', 'FAILED', 'MORE_INFORMATION_REQUIRED') THEN
    RAISE EXCEPTION 'Invalid review decision';
  END IF;
  SELECT * INTO _row FROM public.account_applications WHERE id = _application_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF _row.user_id = auth.uid() THEN RAISE EXCEPTION 'Applicants cannot approve their own application'; END IF;

  _previous_status := _row.status;
  IF NOT (
    (_previous_status = 'PENDING_DOCUMENT_REVIEW' AND _decision IN ('PENDING_ADMIN_APPROVAL', 'MORE_INFORMATION_REQUIRED', 'REJECTED', 'FAILED')) OR
    (_previous_status = 'PENDING_ADMIN_APPROVAL' AND _decision IN ('PENDING_ADMIN_APPROVAL', 'VERIFIED_APPROVED', 'MORE_INFORMATION_REQUIRED', 'REJECTED', 'FAILED')) OR
    (_previous_status = 'MORE_INFORMATION_REQUIRED' AND _decision IN ('PENDING_ADMIN_APPROVAL', 'MORE_INFORMATION_REQUIRED', 'REJECTED', 'FAILED')) OR
    (_previous_status = 'VERIFIED_APPROVED' AND _decision = 'VERIFIED_APPROVED') OR
    (_previous_status = 'REJECTED' AND _decision = 'REJECTED') OR
    (_previous_status = 'FAILED' AND _decision = 'FAILED')
  ) THEN
    RAISE EXCEPTION 'Invalid application status transition from % to %', _previous_status, _decision;
  END IF;
  IF _decision IN ('REJECTED', 'MORE_INFORMATION_REQUIRED') AND NULLIF(btrim(_notes), '') IS NULL THEN
    RAISE EXCEPTION 'A review note is required for this decision';
  END IF;

  UPDATE public.account_applications SET status = _decision, reviewer_id = auth.uid(), review_notes = left(_notes, 2000), reviewed_at = now(), updated_at = now()
  WHERE id = _application_id RETURNING * INTO _row;
  IF _decision = 'VERIFIED_APPROVED' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_row.user_id, _row.requested_role::text::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles SET approval_status = 'VERIFIED_APPROVED' WHERE id = _row.user_id;
  ELSE
    -- Review outcomes never revoke existing assignments. Accounts with an existing role
    -- retain VERIFIED_APPROVED compatibility; new applicants remain unapproved.
    UPDATE public.profiles
    SET approval_status = _decision
    WHERE id = _row.user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _row.user_id
      );
  END IF;
  SELECT full_name INTO _actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs (actor_id, actor_name, action_type, action, detail)
  VALUES (
    auth.uid(),
    COALESCE(_actor_name, 'Administrator'),
    'account_application_review',
    'Reviewed account application',
    'Transition: ' || _previous_status::text || ' -> ' || _decision::text || '; application: ' || _application_id::text
  );
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.review_account_application(uuid, public.application_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_account_application(uuid, public.application_status, text) TO authenticated;

-- Replace broad case access. Equivalent approved-role checks are required for every protected table.
DROP POLICY IF EXISTS "cases readable by signed in" ON public.cases;
DROP POLICY IF EXISTS "cases writable by signed in" ON public.cases;
DROP POLICY IF EXISTS "cases updatable by signed in" ON public.cases;
CREATE POLICY "cases readable by approved users" ON public.cases FOR SELECT TO authenticated USING (public.is_approved_user(auth.uid()));
CREATE POLICY "cases insertable by approved writers" ON public.cases FOR INSERT TO authenticated WITH CHECK (public.is_case_writer(auth.uid()));
CREATE POLICY "cases updatable by approved writers" ON public.cases FOR UPDATE TO authenticated USING (public.is_case_writer(auth.uid())) WITH CHECK (public.is_case_writer(auth.uid()));

DROP POLICY IF EXISTS "profiles readable by signed in" ON public.profiles;
CREATE POLICY "profiles readable by owner or approved users" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_approved_user(auth.uid()));
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, contact_number, rank_designation, service_start_date, specialization, awards, professional_bio) ON public.profiles TO authenticated;
DROP POLICY IF EXISTS "roles readable by signed in" ON public.user_roles;
CREATE POLICY "roles readable by owner or administrator" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

DO $$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'persons','vehicles','weapons','locations','witnesses','cctv','timeline_events',
    'connection_factors','investigation_boards','board_items','board_connections','alerts'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _table || ' readable by signed in', _table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _table || ' writable by signed in', _table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_approved_user(auth.uid()))', _table || ' readable by approved users', _table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_case_writer(auth.uid())) WITH CHECK (public.is_case_writer(auth.uid()))', _table || ' writable by approved users', _table);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "connections readable by signed in" ON public.case_connections;
DROP POLICY IF EXISTS "connections insertable by signed in" ON public.case_connections;
CREATE POLICY "connections readable by approved users" ON public.case_connections FOR SELECT TO authenticated USING (public.is_approved_user(auth.uid()));
CREATE POLICY "connections insertable by approved writers" ON public.case_connections FOR INSERT TO authenticated WITH CHECK (public.is_case_writer(auth.uid()));
DROP POLICY IF EXISTS "audit insertable by signed in" ON public.audit_logs;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('application-identity-private', 'application-identity-private', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "applicants upload own identity document" ON storage.objects;
CREATE POLICY "applicants upload own identity document" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'application-identity-private' AND owner_id = auth.uid()::text
  AND (storage.foldername(name))[1] = 'applications' AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.account_applications a WHERE a.user_id = auth.uid() AND a.status IN ('PENDING_DOCUMENT_REVIEW', 'MORE_INFORMATION_REQUIRED'))
);
DROP POLICY IF EXISTS "applicants and administrators read identity document" ON storage.objects;
CREATE POLICY "applicants and administrators read identity document" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'application-identity-private' AND (owner_id = auth.uid()::text OR public.has_role(auth.uid(), 'administrator')));
DROP POLICY IF EXISTS "applicants clean unattached identity document" ON storage.objects;
CREATE POLICY "applicants clean unattached identity document" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'application-identity-private' AND owner_id = auth.uid()::text AND NOT EXISTS (SELECT 1 FROM public.account_applications a WHERE a.official_id_path = name));

COMMIT;
