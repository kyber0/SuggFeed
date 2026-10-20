BEGIN;
-- Optional component overrides retain old page configurations unchanged.
CREATE FUNCTION public.validate_school_component_styles(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE page record;component record;v jsonb;ids jsonb:='{"home":["hero","hub","ideas","points"],"feed":["topics","cards","promo","supported","help"],"roadmap":["heading","summary","filters","board"],"idea":["header","description","progress","support","discussion"],"profile":["identity","stats","shortcuts","activity"],"submit":["steps","categories","questions","review"],"notifications":["heading","stream","preferences"],"inbox":["heading","tracking","messages"],"staff":["navigation","heading","board","tools"]}';
BEGIN
 FOR page IN SELECT * FROM jsonb_each(p->'pages') LOOP
  IF page.value ? 'view' AND (page.key<>'roadmap' OR page.value->>'view' IS NULL OR page.value->>'view' NOT IN('board','tree','timeline','done')) THEN RAISE EXCEPTION 'Unsupported default view' USING ERRCODE='22023';END IF;
  IF NOT page.value ? 'sections' THEN CONTINUE;END IF;
  IF jsonb_typeof(page.value->'sections') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid component styles' USING ERRCODE='22023';END IF;
  FOR component IN SELECT * FROM jsonb_each(page.value->'sections') LOOP
   IF NOT (ids->page.key) @> jsonb_build_array(component.key) THEN RAISE EXCEPTION 'Unsupported component' USING ERRCODE='22023';END IF;
   v:=component.value;
   IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid component style' USING ERRCODE='22023';END IF;
   IF NOT v ?& ARRAY['spacing','surface','alignment'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE k<>ALL(ARRAY['spacing','surface','alignment'])) OR v->>'spacing' IS NULL OR v->>'spacing' NOT IN('inherit','compact','comfortable','airy') OR v->>'surface' IS NULL OR v->>'surface' NOT IN('inherit','card','raised','transparent') OR v->>'alignment' IS NULL OR v->>'alignment' NOT IN('inherit','start','center') THEN RAISE EXCEPTION 'Unsupported component style' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
END $$;
DO $migration$ DECLARE definition text;updated text;BEGIN
 definition:=pg_get_functiondef('public.validate_school_design(jsonb)'::regprocedure);
 updated:=replace(definition,$old$k<>ALL(ARRAY['layout','spacing','cards','hidden','order'])$old$,$new$k<>ALL(ARRAY['layout','spacing','cards','hidden','order','sections','view'])$new$);
 IF updated=definition THEN RAISE EXCEPTION 'Design validator changed; review extension';END IF;
 updated:=regexp_replace(updated,'END \$function\$;?[[:space:]]*$',E' PERFORM public.validate_school_component_styles(p);\nEND $function$;');
 IF updated NOT LIKE '%PERFORM public.validate_school_component_styles%' THEN RAISE EXCEPTION 'Cannot locate design validator end';END IF;
 EXECUTE updated;
END $migration$;
REVOKE ALL ON FUNCTION public.validate_school_component_styles(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_school_component_styles(jsonb) TO service_role;
COMMIT;
