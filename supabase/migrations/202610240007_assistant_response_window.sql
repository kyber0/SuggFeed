BEGIN;
-- A generation may now run for 20s; keep its concurrency lease alive throughout.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.assistant_action(uuid,uuid,text,jsonb)'::regprocedure);
 IF position('interval ''8 seconds''' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected assistant lease definition';END IF;
 EXECUTE replace(definition,'interval ''8 seconds''','interval ''30 seconds''');
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
