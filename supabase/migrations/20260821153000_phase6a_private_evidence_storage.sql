BEGIN;

-- Phase 6A.1: private evidence file storage and metadata hardening.
-- This migration intentionally does not expose a public URL or broad object deletion.
--
-- REQUIRED CLOUD PREFLIGHT BEFORE APPLICATION:
--   1. Inspect existing public.evidence status values.
--   2. Inspect duplicate non-null public.evidence.storage_path values.
--   3. Confirm storage.objects and storage.buckets columns and types.
--   4. Enumerate existing public.evidence and storage.objects policies, including
--      any cloud-only policies not represented in this repository.
--   5. Confirm the project-wide Storage size limit supports this initial 50 MB
--      per-bucket limit. Larger/resumable video uploads remain a later phase.

-- ---------------------------------------------------------------------------
-- Private bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'evidence-private',
  'evidence-private',
  false,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Evidence metadata
-- ---------------------------------------------------------------------------

ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS checksum_sha256 text,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS withdrawal_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- NOT VALID preserves unknown historical rows while immediately enforcing the
-- checks for new or changed records. Each constraint is validated below only
-- when the existing corpus is compatible.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence'::regclass
      AND conname = 'evidence_file_size_bytes_check'
  ) THEN
    ALTER TABLE public.evidence
      ADD CONSTRAINT evidence_file_size_bytes_check
      CHECK (file_size_bytes IS NULL OR file_size_bytes BETWEEN 0 AND 52428800)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence'::regclass
      AND conname = 'evidence_checksum_sha256_check'
  ) THEN
    ALTER TABLE public.evidence
      ADD CONSTRAINT evidence_checksum_sha256_check
      CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$')
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence'::regclass
      AND conname = 'evidence_status_check'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.evidence
      WHERE status NOT IN ('Uploading', 'Indexed', 'Withdrawn', 'Storage Missing')
    ) THEN
      RAISE NOTICE 'Skipping evidence_status_check: unsupported historical evidence statuses exist. Review them without rewriting data before adding the constraint in a later migration.';
    ELSE
      ALTER TABLE public.evidence
        ADD CONSTRAINT evidence_status_check
        CHECK (status IN ('Uploading', 'Indexed', 'Withdrawn', 'Storage Missing'));
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence'::regclass
      AND conname = 'evidence_withdrawal_metadata_check'
  ) THEN
    ALTER TABLE public.evidence
      ADD CONSTRAINT evidence_withdrawal_metadata_check
      CHECK (
        (
          status = 'Withdrawn'
          AND withdrawn_at IS NOT NULL
          AND withdrawn_by IS NOT NULL
          AND withdrawal_reason IS NOT NULL
          AND char_length(btrim(withdrawal_reason)) BETWEEN 1 AND 1000
        )
        OR
        (
          status <> 'Withdrawn'
          AND withdrawn_at IS NULL
          AND withdrawn_by IS NULL
          AND withdrawal_reason IS NULL
        )
      )
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.evidence
    WHERE file_size_bytes IS NOT NULL
      AND file_size_bytes NOT BETWEEN 0 AND 52428800
  ) THEN
    ALTER TABLE public.evidence VALIDATE CONSTRAINT evidence_file_size_bytes_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.evidence
    WHERE checksum_sha256 IS NOT NULL
      AND checksum_sha256 !~ '^[0-9a-f]{64}$'
  ) THEN
    ALTER TABLE public.evidence VALIDATE CONSTRAINT evidence_checksum_sha256_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.evidence
    WHERE NOT (
      (
        status = 'Withdrawn'
        AND withdrawn_at IS NOT NULL
        AND withdrawn_by IS NOT NULL
        AND withdrawal_reason IS NOT NULL
        AND char_length(btrim(withdrawal_reason)) BETWEEN 1 AND 1000
      )
      OR
      (
        status <> 'Withdrawn'
        AND withdrawn_at IS NULL
        AND withdrawn_by IS NULL
        AND withdrawal_reason IS NULL
      )
    )
  ) THEN
    ALTER TABLE public.evidence VALIDATE CONSTRAINT evidence_withdrawal_metadata_check;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS evidence_touch ON public.evidence;
CREATE TRIGGER evidence_touch
BEFORE UPDATE ON public.evidence
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_evidence_status ON public.evidence(status);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON public.evidence(uploaded_by);
-- This index is intentionally non-unique. Historical path uniqueness must be
-- verified against cloud data before a later migration enforces uniqueness.
CREATE INDEX IF NOT EXISTS idx_evidence_storage_path
  ON public.evidence(storage_path)
  WHERE storage_path IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Verified CASELINK role helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_verified_caselink_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'investigator')
    OR public.has_role(_user_id, 'senior_investigator')
    OR public.has_role(_user_id, 'administrator')
  )
$$;

REVOKE ALL ON FUNCTION public.is_verified_caselink_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_verified_caselink_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_verified_caselink_user(uuid) TO authenticated;

-- A boolean-only SECURITY DEFINER helper prevents Storage cleanup checks from
-- being weakened when the caller cannot see a withdrawn evidence row via RLS.
CREATE OR REPLACE FUNCTION public.evidence_storage_path_is_referenced(_storage_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.evidence e
    WHERE e.storage_path = _storage_path
  )
$$;

REVOKE ALL ON FUNCTION public.evidence_storage_path_is_referenced(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evidence_storage_path_is_referenced(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.evidence_storage_path_is_referenced(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Evidence metadata RLS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "evidence writable by signed in" ON public.evidence;
DROP POLICY IF EXISTS "evidence readable by signed in" ON public.evidence;
DROP POLICY IF EXISTS "active evidence readable by verified users" ON public.evidence;
DROP POLICY IF EXISTS "withdrawn evidence readable by reviewers" ON public.evidence;
DROP POLICY IF EXISTS "evidence insertable by verified users" ON public.evidence;
DROP POLICY IF EXISTS "evidence permanently deletable by administrators" ON public.evidence;

CREATE POLICY "active evidence readable by verified users"
ON public.evidence
FOR SELECT
TO authenticated
USING (
  public.is_verified_caselink_user(auth.uid())
  AND status <> 'Withdrawn'
);

CREATE POLICY "withdrawn evidence readable by reviewers"
ON public.evidence
FOR SELECT
TO authenticated
USING (
  status = 'Withdrawn'
  AND public.can_verify(auth.uid())
);

CREATE POLICY "evidence insertable by verified users"
ON public.evidence
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_verified_caselink_user(auth.uid())
  AND uploaded_by = auth.uid()
  AND (
    uploaded_by_name IS NULL
    OR uploaded_by_name = (
      SELECT p.full_name
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  )
  AND status IN ('Uploading', 'Indexed', 'Storage Missing')
  AND withdrawn_at IS NULL
  AND withdrawn_by IS NULL
  AND withdrawal_reason IS NULL
  AND (
    storage_path IS NULL
    OR (
      storage_path LIKE 'cases/' || case_id::text || '/evidence/' || id::text || '/%'
      AND EXISTS (
        SELECT 1
        FROM storage.objects o
        WHERE o.bucket_id = 'evidence-private'
          AND o.name = storage_path
          AND o.owner_id::text = auth.uid()::text
      )
    )
  )
);

-- No general UPDATE or DELETE policy is created. Security-sensitive state
-- transitions use the narrow, audited functions below. Permanent deletion is
-- intentionally reserved for a later administrator workflow.

-- ---------------------------------------------------------------------------
-- Audited withdrawal and restoration
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.withdraw_evidence(
  _evidence_id uuid,
  _reason text
)
RETURNS public.evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _actor_name text;
  _row public.evidence;
BEGIN
  IF NOT public.is_verified_caselink_user(_actor_id) THEN
    RAISE EXCEPTION 'Not authorized to withdraw evidence';
  END IF;

  IF NULLIF(btrim(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A withdrawal reason is required';
  END IF;

  IF char_length(btrim(_reason)) > 1000 THEN
    RAISE EXCEPTION 'Withdrawal reason must not exceed 1000 characters';
  END IF;

  SELECT * INTO _row
  FROM public.evidence
  WHERE id = _evidence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence record not found';
  END IF;

  IF _row.status = 'Withdrawn' THEN
    RAISE EXCEPTION 'Evidence is already withdrawn';
  END IF;

  IF NOT (
    _row.uploaded_by = _actor_id
    OR public.has_role(_actor_id, 'senior_investigator')
    OR public.has_role(_actor_id, 'administrator')
  ) THEN
    RAISE EXCEPTION 'Investigators may withdraw only evidence they uploaded';
  END IF;

  UPDATE public.evidence
  SET
    status = 'Withdrawn',
    withdrawn_at = now(),
    withdrawn_by = _actor_id,
    withdrawal_reason = btrim(_reason)
  WHERE id = _evidence_id
  RETURNING * INTO _row;

  SELECT COALESCE(full_name, 'Investigator') INTO _actor_name
  FROM public.profiles
  WHERE id = _actor_id;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_name,
    action_type,
    action,
    case_id,
    detail
  )
  VALUES (
    _actor_id,
    COALESCE(_actor_name, 'Investigator'),
    'evidence_withdrawal',
    'Withdrew evidence',
    _row.case_id,
    format('Evidence %s withdrawn. Reason: %s', _row.id, btrim(_reason))
  );

  RETURN _row;
END
$$;

CREATE OR REPLACE FUNCTION public.restore_evidence(_evidence_id uuid)
RETURNS public.evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _actor_name text;
  _row public.evidence;
BEGIN
  IF NOT public.can_verify(_actor_id) THEN
    RAISE EXCEPTION 'Only senior investigators or administrators may restore evidence';
  END IF;

  SELECT * INTO _row
  FROM public.evidence
  WHERE id = _evidence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence record not found';
  END IF;

  IF _row.status <> 'Withdrawn' THEN
    RAISE EXCEPTION 'Only withdrawn evidence can be restored';
  END IF;

  UPDATE public.evidence
  SET
    status = CASE WHEN storage_path IS NULL THEN 'Storage Missing' ELSE 'Indexed' END,
    withdrawn_at = NULL,
    withdrawn_by = NULL,
    withdrawal_reason = NULL
  WHERE id = _evidence_id
  RETURNING * INTO _row;

  SELECT COALESCE(full_name, 'Investigator') INTO _actor_name
  FROM public.profiles
  WHERE id = _actor_id;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_name,
    action_type,
    action,
    case_id,
    detail
  )
  VALUES (
    _actor_id,
    COALESCE(_actor_name, 'Investigator'),
    'evidence_restoration',
    'Restored evidence',
    _row.case_id,
    format('Evidence %s restored to status %s.', _row.id, _row.status)
  );

  RETURN _row;
END
$$;

REVOKE ALL ON FUNCTION public.withdraw_evidence(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_evidence(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_evidence(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.restore_evidence(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_evidence(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_evidence(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Private Storage policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "verified users read private evidence objects" ON storage.objects;
DROP POLICY IF EXISTS "verified users upload private evidence objects" ON storage.objects;
DROP POLICY IF EXISTS "uploaders clean up orphaned private evidence objects" ON storage.objects;

CREATE POLICY "verified users read private evidence objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'evidence-private'
  AND public.is_verified_caselink_user(auth.uid())
);

CREATE POLICY "verified users upload private evidence objects"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'evidence-private'
  AND public.is_verified_caselink_user(auth.uid())
  AND cardinality(storage.foldername(name)) = 4
  AND (storage.foldername(name))[1] = 'cases'
  AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[3] = 'evidence'
  AND (storage.foldername(name))[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$'
  AND EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id::text = (storage.foldername(name))[2]
  )
);

-- This is deliberately narrower than a general DELETE policy. It exists only
-- so an authenticated uploader can call the Storage API remove() after an
-- object upload succeeds but its evidence metadata insert fails. Referenced
-- evidence and objects owned by another user cannot be removed through it.
CREATE POLICY "uploaders clean up orphaned private evidence objects"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'evidence-private'
  AND public.is_verified_caselink_user(auth.uid())
  AND owner_id::text = auth.uid()::text
  AND cardinality(storage.foldername(name)) = 4
  AND (storage.foldername(name))[1] = 'cases'
  AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[3] = 'evidence'
  AND (storage.foldername(name))[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$'
  AND NOT public.evidence_storage_path_is_referenced(name)
);

COMMIT;
