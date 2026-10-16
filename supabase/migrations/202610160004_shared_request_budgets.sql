-- One row per HMAC identity/category, reused across windows and server instances.
BEGIN;
CREATE TABLE public.request_budgets (
 key text PRIMARY KEY CHECK(key ~ '^[a-f0-9]{64}$'),
 hits integer NOT NULL CHECK(hits BETWEEN 1 AND 1001),
 expires_at timestamptz NOT NULL
);
CREATE INDEX request_budgets_expiry ON public.request_budgets(expires_at);
ALTER TABLE public.request_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_budgets FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.consume_request_budget(p_key text,p_limit integer,p_window_seconds integer)
RETURNS TABLE(allowed boolean,retry_after integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_now timestamptz := clock_timestamp();
 v_limit integer := least(p_limit,1000);
 v_window integer := least(p_window_seconds,86400);
 v_hits integer;
 v_expiry timestamptz;
BEGIN
 IF p_key IS NULL OR p_key !~ '^[a-f0-9]{64}$' OR p_limit IS NULL OR p_limit<1
    OR p_window_seconds IS NULL OR p_window_seconds<1 THEN
  RAISE EXCEPTION 'Invalid request budget';
 END IF;
 -- A one-day cleanup grace avoids retaining abandoned identities indefinitely.
 DELETE FROM public.request_budgets WHERE key IN (
  SELECT key FROM public.request_budgets WHERE expires_at < v_now-interval '1 day'
  ORDER BY expires_at LIMIT 10 FOR UPDATE SKIP LOCKED
 );
 INSERT INTO public.request_budgets AS b(key,hits,expires_at)
 VALUES(p_key,1,v_now+make_interval(secs=>v_window))
 ON CONFLICT(key) DO UPDATE SET
  hits=CASE WHEN b.expires_at<=v_now THEN 1 ELSE least(b.hits+1,1001) END,
  expires_at=CASE WHEN b.expires_at<=v_now THEN excluded.expires_at ELSE b.expires_at END
 RETURNING hits,expires_at INTO v_hits,v_expiry;
 RETURN QUERY SELECT v_hits<=v_limit,greatest(1,least(86400,ceil(extract(epoch FROM v_expiry-v_now))::integer));
END;
$$;
REVOKE ALL ON FUNCTION public.consume_request_budget(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_request_budget(text,integer,integer) TO service_role;
COMMIT;
