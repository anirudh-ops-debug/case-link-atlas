-- Correct the application identity path regex applied by the account-application migration.
-- PostgreSQL standard-conforming strings preserved the prior doubled backslash, so a normal
-- literal dot did not match. A character class avoids string/regex escaping ambiguity.
-- The intended private object shape remains:
-- applications/{authenticated-user-uuid}/{secure-object-uuid}.{validated-extension}

BEGIN;

DO $path_constraint_fix$
DECLARE
  _constraint_name text;
  _constraint_count integer;
BEGIN
  -- Stop without changing schema if historical metadata contains a path outside the
  -- corrected user-owned format. No application record is rewritten or deleted.
  IF EXISTS (
    SELECT 1
    FROM public.account_applications AS application
    WHERE application.official_id_path IS NOT NULL
      AND application.official_id_path !~ (
        '^applications/' || application.user_id::text ||
        '/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|pdf)$'
      )
  ) THEN
    RAISE EXCEPTION
      'Application identity path correction stopped: existing non-null paths do not match the intended format';
  END IF;

  -- The original CHECK was unnamed, so inspect the catalog rather than assuming the
  -- PostgreSQL-generated constraint name. Require one unambiguous path constraint.
  SELECT count(*), min(constraint_record.conname)
  INTO _constraint_count, _constraint_name
  FROM pg_catalog.pg_constraint AS constraint_record
  WHERE constraint_record.conrelid = 'public.account_applications'::pg_catalog.regclass
    AND constraint_record.contype = 'c'
    AND pg_catalog.pg_get_constraintdef(constraint_record.oid) LIKE '%official_id_path%';

  IF _constraint_count <> 1 OR _constraint_name IS NULL THEN
    RAISE EXCEPTION
      'Application identity path correction stopped: expected one official_id_path constraint, found %',
      _constraint_count;
  END IF;

  EXECUTE pg_catalog.format(
    'ALTER TABLE public.account_applications DROP CONSTRAINT %I',
    _constraint_name
  );

  ALTER TABLE public.account_applications
    ADD CONSTRAINT account_applications_official_id_path_format_check
    CHECK (
      official_id_path IS NULL OR
      official_id_path ~ (
        '^applications/' || user_id::text ||
        '/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|pdf)$'
      )
    );
END;
$path_constraint_fix$;

CREATE OR REPLACE FUNCTION public.attach_application_document(
  _storage_path text,
  _mime_type text,
  _original_filename text
)
RETURNS public.account_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $attach_application_document$
DECLARE
  _row public.account_applications;
BEGIN
  IF _storage_path !~ (
    '^applications/' || auth.uid()::text ||
    '/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|pdf)$'
  ) THEN
    RAISE EXCEPTION 'Invalid application document path';
  END IF;

  UPDATE public.account_applications
  SET
    official_id_path = _storage_path,
    official_id_mime_type = _mime_type,
    official_id_original_filename = left(_original_filename, 255),
    status = 'PENDING_ADMIN_APPROVAL',
    updated_at = now()
  WHERE user_id = auth.uid()
    AND status IN ('PENDING_DOCUMENT_REVIEW', 'MORE_INFORMATION_REQUIRED')
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Application cannot accept a document';
  END IF;

  RETURN _row;
END;
$attach_application_document$;

REVOKE ALL ON FUNCTION public.attach_application_document(text, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_application_document(text, text, text)
TO authenticated;

COMMIT;
