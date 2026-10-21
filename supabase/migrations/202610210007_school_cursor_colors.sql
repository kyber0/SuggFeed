BEGIN;
-- Cursor is an optional theme role; preserve validation of every existing field.
DO $migration$
DECLARE definition text;updated text;
BEGIN
 definition:=pg_get_functiondef('public.validate_school_design(jsonb)'::regprocedure);
 updated:=replace(definition,$old$WHERE k<>ALL(allowed)$old$,$new$WHERE k<>ALL(allowed || ARRAY['cursor'])$new$);
 IF updated=definition THEN RAISE EXCEPTION 'Theme role validator changed; review cursor extension';END IF;
 updated:=replace(updated,$old$c:=p->mode;allowed:=$old$,$new$c:=p->mode;
  IF c ? 'cursor' AND (jsonb_typeof(c->'cursor') IS DISTINCT FROM 'string' OR c->>'cursor' !~ '^#[0-9a-fA-F]{6}$') THEN RAISE EXCEPTION 'Use a six-digit cursor color' USING ERRCODE='22023';END IF;
  allowed:=$new$);
 IF updated NOT LIKE '%Use a six-digit cursor color%' THEN RAISE EXCEPTION 'Theme mode validator changed; review cursor extension';END IF;
 EXECUTE updated;
END $migration$;
COMMIT;
