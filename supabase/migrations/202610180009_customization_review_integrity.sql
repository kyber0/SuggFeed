BEGIN;
-- Review fingerprints cover a security boundary, so use the built-in SHA-256.
DO $$ DECLARE definition text;signature regprocedure;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.publish_school_customization(uuid,uuid,integer)'::regprocedure,'public.review_school_customization_form(uuid,uuid,integer,text)'::regprocedure] LOOP
  SELECT pg_get_functiondef(signature) INTO definition;
  definition:=replace(definition,'md5((p->''form'')::text)','encode(sha256(convert_to((p->''form'')::text,''UTF8'')),''hex'')');
  definition:=replace(definition,'md5((draft->''form'')::text)','encode(sha256(convert_to((draft->''form'')::text,''UTF8'')),''hex'')');
  EXECUTE definition;
 END LOOP;
END $$;
UPDATE public.school_customization_state SET form_review_hash=NULL,form_policy_version=NULL,form_reviewed_by=NULL,form_review_reference=NULL WHERE form_review_hash IS NOT NULL;
COMMIT;
