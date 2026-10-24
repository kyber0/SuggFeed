BEGIN;
CREATE TABLE public.assistant_cache(scope text NOT NULL,question_hash text NOT NULL CHECK(question_hash~'^[a-f0-9]{64}$'),version text NOT NULL,locale text NOT NULL CHECK(locale IN('en','fil','taglish')),faq_id text NOT NULL,answer text NOT NULL CHECK(length(answer)<=1600),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,PRIMARY KEY(scope,question_hash,version,locale));
CREATE INDEX assistant_cache_expiry ON public.assistant_cache(expires_at);
CREATE TABLE public.assistant_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scope text NOT NULL,normalized_question text NOT NULL CHECK(length(normalized_question)<=300),answered boolean NOT NULL,source text NOT NULL CHECK(source IN('cache','ai','fallback')),faq_id text,version text NOT NULL,locale text NOT NULL CHECK(locale IN('en','fil','taglish')),rating text NOT NULL DEFAULT 'none' CHECK(rating IN('up','down','none')),reviewed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX assistant_log_scope_time ON public.assistant_log(scope,created_at DESC,id);
CREATE INDEX assistant_log_gaps ON public.assistant_log(scope,answered,normalized_question);
CREATE TABLE public.assistant_request_capabilities(request_id uuid PRIMARY KEY REFERENCES public.assistant_log(id) ON DELETE CASCADE,token_hash text NOT NULL CHECK(token_hash~'^[a-f0-9]{64}$'),expires_at timestamptz NOT NULL,used boolean NOT NULL DEFAULT false);
CREATE TABLE public.assistant_rate_limit(key text NOT NULL CHECK(key~'^[a-f0-9]{64}$'),window_start bigint NOT NULL,count integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(key,window_start));
CREATE INDEX assistant_budget_expiry ON public.assistant_rate_limit(updated_at);
CREATE TABLE public.assistant_provider_leases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),expires_at timestamptz NOT NULL);
CREATE TABLE public.assistant_runtime(id boolean PRIMARY KEY DEFAULT true CHECK(id),paused_until timestamptz NOT NULL DEFAULT '-infinity');
INSERT INTO public.assistant_runtime DEFAULT VALUES;
DO $$ DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['assistant_cache','assistant_log','assistant_request_capabilities','assistant_rate_limit','assistant_provider_leases','assistant_runtime'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role,tenant_executor',name);
END LOOP;END $$;
-- Only scoped admin RPCs below expose logs. Even authenticated clients cannot
-- read logs or manufacture their own feedback capabilities through table writes.
CREATE FUNCTION public.assistant_consume(p_key text,p_limit int,p_seconds int) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE bucket bigint;
BEGIN
 IF p_key IS NULL OR p_key!~'^[a-f0-9]{64}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 OR p_seconds IS NULL OR p_seconds NOT BETWEEN 10 AND 86400 THEN RAISE EXCEPTION 'Invalid budget' USING ERRCODE='22023';END IF;
 bucket:=floor(extract(epoch FROM clock_timestamp())/p_seconds);
 INSERT INTO public.assistant_rate_limit(key,window_start,count) VALUES(p_key,bucket,1) ON CONFLICT(key,window_start) DO UPDATE SET count=assistant_rate_limit.count+1,updated_at=now() WHERE assistant_rate_limit.count<p_limit;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.assistant_consume(text,int,int) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE FUNCTION public.assistant_action(p_school uuid,p_actor uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope_key text:=coalesce(p_school::text,'app');row_id uuid;total int;page_number int;result jsonb;lease uuid;
BEGIN
 IF jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023';END IF;
 IF p_action='cleanup' THEN
  IF p_school IS NOT NULL OR p_actor IS NOT NULL OR (p_data->>'days')::int NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'Invalid cleanup' USING ERRCODE='42501';END IF;
  WITH stale AS(SELECT id FROM public.assistant_log WHERE created_at<now()-make_interval(days=>(p_data->>'days')::int) ORDER BY created_at LIMIT 1000) DELETE FROM public.assistant_log WHERE id IN(SELECT id FROM stale);GET DIAGNOSTICS total=ROW_COUNT;
  DELETE FROM public.assistant_cache WHERE ctid IN(SELECT ctid FROM public.assistant_cache WHERE expires_at<now() LIMIT 1000);
  DELETE FROM public.assistant_request_capabilities WHERE request_id IN(SELECT request_id FROM public.assistant_request_capabilities WHERE expires_at<now() LIMIT 1000);
  DELETE FROM public.assistant_rate_limit WHERE ctid IN(SELECT ctid FROM public.assistant_rate_limit WHERE updated_at<now()-interval '2 days' LIMIT 1000);
  DELETE FROM public.assistant_provider_leases WHERE expires_at<now();
  RETURN jsonb_build_object('removed',total,'more',EXISTS(SELECT 1 FROM public.assistant_log WHERE created_at<now()-make_interval(days=>(p_data->>'days')::int)) OR EXISTS(SELECT 1 FROM public.assistant_cache WHERE expires_at<now()) OR EXISTS(SELECT 1 FROM public.assistant_request_capabilities WHERE expires_at<now()) OR EXISTS(SELECT 1 FROM public.assistant_rate_limit WHERE updated_at<now()-interval '2 days'));
 END IF;
 IF p_school IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND status='active') OR (p_actor IS NULL AND NOT public.school_publication_allowed(p_school)) OR (p_actor IS NOT NULL AND NOT public.school_actor_has_role(p_school,p_actor,ARRAY['student','moderator','admin'])) THEN RAISE EXCEPTION 'School access required' USING ERRCODE='42501';END IF;
 END IF;
 IF p_action='budget' THEN
  IF NOT public.assistant_consume(p_data->>'ip',(p_data->>'ipLimit')::int,(p_data->>'seconds')::int) THEN RETURN jsonb_build_object('allowed',false);END IF;
  IF p_actor IS NOT NULL AND NOT public.assistant_consume(p_data->>'account',(p_data->>'accountLimit')::int,(p_data->>'seconds')::int) THEN RETURN jsonb_build_object('allowed',false);END IF;
  RETURN jsonb_build_object('allowed',true);
 ELSIF p_action='cache-get' THEN
  SELECT jsonb_build_object('id',faq_id,'answer',answer) INTO result FROM public.assistant_cache WHERE scope=scope_key AND question_hash=p_data->>'hash' AND version=p_data->>'version' AND locale=p_data->>'locale' AND expires_at>now();RETURN coalesce(result,'null');
 ELSIF p_action='cache-put' THEN
  IF (p_data->>'ttl')::int NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'Invalid expiry' USING ERRCODE='22023';END IF;
  INSERT INTO public.assistant_cache(scope,question_hash,version,locale,faq_id,answer,expires_at) VALUES(scope_key,p_data->>'hash',p_data->>'version',p_data->>'locale',p_data->>'id',p_data->>'answer',now()+make_interval(secs=>(p_data->>'ttl')::int)) ON CONFLICT(scope,question_hash,version,locale) DO UPDATE SET faq_id=excluded.faq_id,answer=excluded.answer,expires_at=excluded.expires_at;RETURN '{}';
 ELSIF p_action='log' THEN
  IF p_data->>'topic' IS NULL OR length(p_data->>'topic') NOT BETWEEN 1 AND 300 OR p_data->>'topic'!~'^[a-z0-9 -]+$' THEN RAISE EXCEPTION 'Invalid topic' USING ERRCODE='22023';END IF;
  INSERT INTO public.assistant_log(scope,normalized_question,answered,source,faq_id,version,locale) VALUES(scope_key,p_data->>'topic',(p_data->>'answered')::boolean,p_data->>'source',p_data->>'id',p_data->>'version',p_data->>'locale') RETURNING id INTO row_id;
  INSERT INTO public.assistant_request_capabilities(request_id,token_hash,expires_at) VALUES(row_id,p_data->>'tokenHash',now()+make_interval(secs=>least(86400,greatest(60,coalesce((p_data->>'ttl')::int,86400)))));RETURN jsonb_build_object('id',row_id);
 ELSIF p_action='feedback' THEN
  IF p_data->>'rating' NOT IN('up','down') OR p_data->>'rating' IS NULL THEN RAISE EXCEPTION 'Invalid rating' USING ERRCODE='22023';END IF;
  SELECT c.request_id INTO row_id FROM public.assistant_request_capabilities c JOIN public.assistant_log l ON l.id=c.request_id WHERE l.scope=scope_key AND c.request_id=(p_data->>'id')::uuid AND c.token_hash=p_data->>'tokenHash' AND c.expires_at>now() FOR UPDATE OF c;
  IF row_id IS NULL THEN RAISE EXCEPTION 'Feedback unavailable' USING ERRCODE='42501';END IF;
  UPDATE public.assistant_log SET rating=p_data->>'rating' WHERE id=row_id AND rating='none';UPDATE public.assistant_request_capabilities SET used=true WHERE request_id=row_id;RETURN '{}';
 ELSIF p_action='claim' THEN
  PERFORM pg_advisory_xact_lock(hashtext('sugi-provider'));
  IF (SELECT paused_until>now() FROM public.assistant_runtime) OR (SELECT count(*) FROM public.assistant_provider_leases WHERE expires_at>now())>=least(2,(p_data->>'concurrency')::int) THEN RETURN 'null';END IF;
  IF NOT public.assistant_consume(p_data->>'key',(p_data->>'limit')::int,86400) THEN RETURN 'null';END IF;
  INSERT INTO public.assistant_provider_leases(expires_at) VALUES(now()+interval '8 seconds') RETURNING id INTO lease;RETURN jsonb_build_object('id',lease);
 ELSIF p_action='retry' THEN RETURN jsonb_build_object('allowed',public.assistant_consume(p_data->>'key',(p_data->>'limit')::int,86400));
 ELSIF p_action='release' THEN
  DELETE FROM public.assistant_provider_leases WHERE id=(p_data->>'id')::uuid;
  IF p_data->>'failed'='true' THEN UPDATE public.assistant_runtime SET paused_until=greatest(paused_until,now()+make_interval(secs=>least(600,greatest(10,coalesce((p_data->>'pause')::int,60)))));END IF;RETURN '{}';
 END IF;
 IF p_school IS NULL THEN
  IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Operator required' USING ERRCODE='42501';END IF;
 ELSIF NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';END IF;
 IF p_action='admin' THEN
  page_number:=greatest(1,least(10000,coalesce((p_data->>'page')::int,1)));
  RETURN jsonb_build_object('page',page_number,'gaps',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT normalized_question,locale,count(*) AS count,max(created_at) AS last_at FROM public.assistant_log WHERE scope=scope_key AND NOT answered AND NOT reviewed GROUP BY normalized_question,locale ORDER BY count(*) DESC,normalized_question LIMIT 25 OFFSET (page_number-1)*25)q),
   'negative',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT id,normalized_question,faq_id,version,locale,created_at FROM public.assistant_log WHERE scope=scope_key AND rating='down' AND NOT reviewed ORDER BY created_at DESC LIMIT 25 OFFSET (page_number-1)*25)q),
   'stats',(SELECT jsonb_build_object('total',count(*),'cache',count(*) FILTER(WHERE source='cache'),'ai',count(*) FILTER(WHERE source='ai'),'fallback',count(*) FILTER(WHERE NOT answered),'rated',count(*) FILTER(WHERE rating<>'none')) FROM public.assistant_log WHERE scope=scope_key AND created_at>=now()-interval '30 days'),
   'daily',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT created_at::date AS day,count(*) AS count FROM public.assistant_log WHERE scope=scope_key AND created_at>=now()-interval '30 days' GROUP BY created_at::date ORDER BY day)q));
 ELSIF p_action='review' THEN
  UPDATE public.assistant_log SET reviewed=true WHERE scope=scope_key AND (id::text=p_data->>'id' OR normalized_question=p_data->>'topic');RETURN '{}';
 END IF;
 RAISE EXCEPTION 'Unknown operation' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.assistant_action(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,tenant_executor,service_role;
GRANT EXECUTE ON FUNCTION public.assistant_action(uuid,uuid,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
