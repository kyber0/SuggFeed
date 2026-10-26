BEGIN;
-- Opaque provider fingerprints; account ownership supports deletion without storing tokens.
CREATE TABLE public.provider_idle_sessions(
 id text PRIMARY KEY CHECK(id~'^[a-f0-9]{64}$'),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked boolean NOT NULL DEFAULT false
);
ALTER TABLE public.provider_idle_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_idle_sessions FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE FUNCTION public.web_session_idle(p_key text,p_actor uuid,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row public.provider_idle_sessions%ROWTYPE;now_at timestamptz;
BEGIN
 IF p_actor IS NULL OR p_key IS NULL OR p_key!~'^[a-f0-9]{64}$' OR p_action IS NULL OR p_action NOT IN('check','activity','revoke') THEN
  RAISE EXCEPTION 'Invalid session operation' USING ERRCODE='22023';
 END IF;
 now_at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor) THEN
  RETURN jsonb_build_object('allowed',false,'lastActivityAt',floor(extract(epoch FROM now_at)*1000),
   'expiresAt',floor(extract(epoch FROM now_at+interval '30 minutes')*1000),'serverNow',floor(extract(epoch FROM now_at)*1000));
 END IF;
 INSERT INTO public.provider_idle_sessions(id,user_id,revoked) VALUES(p_key,p_actor,p_action='revoke') ON CONFLICT(id) DO NOTHING;
 SELECT * INTO row FROM public.provider_idle_sessions WHERE id=p_key FOR UPDATE;
 IF row.user_id<>p_actor THEN RAISE EXCEPTION 'Session owner mismatch' USING ERRCODE='42501';END IF;
 now_at:=clock_timestamp();
 IF p_action='revoke' OR row.last_activity_at+interval '30 minutes'<=now_at THEN
  row.revoked:=true;
 END IF;
 IF NOT row.revoked AND p_action='activity' THEN row.last_activity_at:=now_at;END IF;
 UPDATE public.provider_idle_sessions AS sessions SET revoked=row.revoked,last_activity_at=row.last_activity_at WHERE sessions.id=p_key AND (sessions.revoked IS DISTINCT FROM row.revoked OR sessions.last_activity_at IS DISTINCT FROM row.last_activity_at);
 RETURN jsonb_build_object('allowed',NOT row.revoked,'lastActivityAt',floor(extract(epoch FROM row.last_activity_at)*1000),
 'expiresAt',floor(extract(epoch FROM row.last_activity_at+interval '30 minutes')*1000),'serverNow',floor(extract(epoch FROM now_at)*1000));
END $$;
REVOKE ALL ON FUNCTION public.web_session_idle(text,uuid,text) FROM PUBLIC,anon,authenticated,tenant_executor,service_role;
GRANT EXECUTE ON FUNCTION public.web_session_idle(text,uuid,text) TO service_role;
COMMENT ON TABLE public.provider_idle_sessions IS 'Server-only idle/revocation guard keyed by an opaque provider-session fingerprint. Do not purge while the provider session may still issue valid credentials.';
NOTIFY pgrst,'reload schema';
COMMIT;
