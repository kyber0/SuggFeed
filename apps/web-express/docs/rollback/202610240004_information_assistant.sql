-- Disable Sugi endpoints/provider first. Export any history that must be retained.
-- Destructive rollback removes only assistant-owned data and functions.
BEGIN;
DROP FUNCTION public.assistant_action(uuid,uuid,text,jsonb);
DROP FUNCTION public.assistant_consume(text,integer,integer);
DROP TABLE public.assistant_request_capabilities,public.assistant_cache,public.assistant_log,public.assistant_rate_limit,public.assistant_provider_leases,public.assistant_runtime;
NOTIFY pgrst,'reload schema';
COMMIT;
