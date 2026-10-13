BEGIN;
-- No draft text, browser cookie, account ID, or plaintext tracking code is stored here.
-- Keep a minimal tombstone when a submission is deleted so old operation IDs
-- cannot recreate it. Receipts can be recovered for thirty days.
CREATE TABLE public.submission_receipts (
 owner_hash text NOT NULL CHECK(owner_hash ~ '^[a-f0-9]{64}$'),
 request_id uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
 is_anonymous boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_hash,request_id)
);
ALTER TABLE public.submission_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submission_receipts FROM public,anon,authenticated;
GRANT ALL ON public.submission_receipts TO service_role;
CREATE INDEX submission_receipt_parent_idx ON public.submission_receipts(submission_id);
CREATE FUNCTION public.create_submission_once(p_owner_hash text,p_request_id uuid,p_payload_hash text,
 p_title text,p_description text,p_category_id uuid,p_user_id uuid,p_tracking_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE receipt public.submission_receipts; result_id uuid;
BEGIN
 IF p_owner_hash IS NULL OR p_owner_hash !~ '^[a-f0-9]{64}$' OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$'
 OR p_request_id IS NULL OR p_title IS NULL OR char_length(trim(p_title)) NOT BETWEEN 10 AND 120
 OR p_description IS NULL OR char_length(trim(p_description)) NOT BETWEEN 20 AND 2000
 OR p_category_id IS NULL OR (p_user_id IS NULL AND (p_tracking_hash IS NULL OR p_tracking_hash !~ '^[a-f0-9]{64}$'))
 OR (p_user_id IS NOT NULL AND p_tracking_hash IS NOT NULL) THEN
  RAISE EXCEPTION 'Invalid submission' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_owner_hash),hashtext(p_request_id::text));
 SELECT * INTO receipt FROM public.submission_receipts WHERE owner_hash=p_owner_hash AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.payload_hash<>p_payload_hash THEN RAISE EXCEPTION 'Operation reused for changed content' USING ERRCODE='23505'; END IF;
  IF receipt.submission_id IS NULL OR receipt.created_at<now()-interval '30 days' THEN
   RAISE EXCEPTION 'Receipt expired or submission removed' USING ERRCODE='P0004';
  END IF;
  RETURN jsonb_build_object('id',receipt.submission_id,'replayed',true);
 END IF;
 INSERT INTO public.submission_receipts(owner_hash,request_id,payload_hash,is_anonymous)
 VALUES(p_owner_hash,p_request_id,p_payload_hash,p_user_id IS NULL);
 INSERT INTO public.submissions(title,description,category_id,user_id,anonymous_tracking_hash,status)
 VALUES(trim(p_title),trim(p_description),p_category_id,p_user_id,p_tracking_hash,'pending') RETURNING id INTO result_id;
 UPDATE public.submission_receipts SET submission_id=result_id WHERE owner_hash=p_owner_hash AND request_id=p_request_id;
 RETURN jsonb_build_object('id',result_id,'replayed',false);
END $$;
CREATE FUNCTION public.read_submission_receipt(p_owner_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE receipt public.submission_receipts;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(p_owner_hash),hashtext(p_request_id::text));
 SELECT * INTO receipt FROM public.submission_receipts WHERE owner_hash=p_owner_hash AND request_id=p_request_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF receipt.submission_id IS NULL OR receipt.created_at<now()-interval '30 days' THEN
  RAISE EXCEPTION 'Receipt expired or submission removed' USING ERRCODE='P0004';
 END IF;
 RETURN jsonb_build_object('id',receipt.submission_id,'is_anonymous',receipt.is_anonymous);
END $$;
REVOKE ALL ON FUNCTION public.create_submission_once(text,uuid,text,text,text,uuid,uuid,text),public.read_submission_receipt(text,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_submission_once(text,uuid,text,text,text,uuid,uuid,text),public.read_submission_receipt(text,uuid) TO service_role;
COMMIT;
