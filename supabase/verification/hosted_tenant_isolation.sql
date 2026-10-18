-- Controlled synthetic probes. Never commit this transaction or remove its rollback.
BEGIN;
SET LOCAL statement_timeout = '25s';
CREATE TEMP TABLE isolation_probe_results(check_name text PRIMARY KEY, passed boolean NOT NULL) ON COMMIT DROP;
GRANT INSERT,SELECT ON isolation_probe_results TO anon,authenticated,tenant_executor,service_role;
DO $probe$
DECLARE school_a uuid:=gen_random_uuid(); school_b uuid:=gen_random_uuid();
 actor_a uuid:=gen_random_uuid(); actor_b uuid:=gen_random_uuid();
 idea_a uuid:=gen_random_uuid(); idea_b uuid:=gen_random_uuid(); category_a uuid; category_b uuid;
 update_a uuid:=gen_random_uuid(); update_b uuid:=gen_random_uuid();
 item record; n integer; blocked boolean; result jsonb; receipt uuid:=gen_random_uuid(); submitted_id uuid; submission_args jsonb; invitation_id uuid; invitation_hash text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
BEGIN
 -- These fields are transaction-local and invisible to other connections.
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 VALUES(actor_a,actor_a::text||'@example.invalid',now(),'{"display_name":"Isolation probe A"}'),(actor_b,actor_b::text||'@example.invalid',now(),'{"display_name":"Isolation probe B"}');
 UPDATE public.school_release_gate SET isolation_verified=true,verified_at=clock_timestamp(),verified_by=actor_a,verification_reference='Rollback-only fixture, not a release sign-off';
 INSERT INTO public.schools(id,slug,name) VALUES(school_a,'probe-'||school_a::text,'Rollback probe A'),(school_b,'probe-'||school_b::text,'Rollback probe B');
 INSERT INTO public.school_memberships(school_id,user_id,role) VALUES(school_a,actor_a,'admin'),(school_b,actor_b,'admin');
 INSERT INTO public.school_settings(school_id,privacy_notice,terms_notice,age_policy,privacy_contact,school_contact,publication_policy,approved_at,approved_by,approval_reference,updated_by)
 VALUES(school_a,'Synthetic rollback verification notice.','Synthetic rollback verification terms.','Adult synthetic probes only.','privacy@example.invalid','school@example.invalid','private',now(),actor_a,'Temporary rollback probe only',actor_a),
 (school_b,'Synthetic rollback verification notice.','Synthetic rollback verification terms.','Adult synthetic probes only.','privacy@example.invalid','school@example.invalid','private',now(),actor_b,'Temporary rollback probe only',actor_b);
 UPDATE public.schools SET status='active' WHERE id IN(school_a,school_b);
 SELECT id INTO category_a FROM public.categories WHERE school_id=school_a LIMIT 1;
 SELECT id INTO category_b FROM public.categories WHERE school_id=school_b LIMIT 1;
 INSERT INTO public.submissions(id,school_id,category_id,user_id,title,description,status)
 VALUES(idea_a,school_a,category_a,actor_a,'Rollback probe A','Synthetic verification record rolled back after checks.','approved'),
 (idea_b,school_b,category_b,actor_b,'Rollback probe B','Synthetic verification record rolled back after checks.','approved');
 INSERT INTO public.idea_updates(id,school_id,submission_id,request_id,request_payload,posted_by,kind,body,visibility,occurred_on,office_label)
 VALUES(update_a,school_a,idea_a,gen_random_uuid(),'{}',actor_a,'update','Rollback update A','public',current_date,'Synthetic probe'),
 (update_b,school_b,idea_b,gen_random_uuid(),'{}',actor_b,'update','Rollback update B','public',current_date,'Synthetic probe');
 INSERT INTO public.idea_notifications(school_id,user_id,submission_id,update_id,kind,title,office_label)
 VALUES(school_a,actor_a,idea_a,update_a,'update','Rollback notification A','Synthetic probe'),(school_b,actor_b,idea_b,update_b,'update','Rollback notification B','Synthetic probe');
 PERFORM set_config('suggfeed.school_id',school_a::text,true);
 PERFORM set_config('suggfeed.actor_id',actor_a::text,true);
 PERFORM set_config('request.jwt.claim.sub',actor_a::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor_a,'role','authenticated')::text,true);

 EXECUTE 'SET LOCAL ROLE tenant_executor';
 SELECT count(*) INTO n FROM public.submissions WHERE id=idea_b;
 INSERT INTO isolation_probe_results VALUES('executor_cannot_read_other_school',n=0);
 SELECT count(*) INTO n FROM public.submissions WHERE id=idea_a;
 INSERT INTO isolation_probe_results VALUES('executor_reads_own_school',n=1);
 UPDATE public.submissions SET title='Forbidden cross-school update' WHERE id=idea_b;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO isolation_probe_results VALUES('executor_cannot_update_other_school',n=0);
 DELETE FROM public.submissions WHERE id=idea_b;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO isolation_probe_results VALUES('executor_cannot_delete_other_school',n=0);
 blocked:=false;
 BEGIN
  INSERT INTO public.comments(school_id,submission_id,user_id,body) VALUES(school_a,idea_b,actor_a,'Cross-school probe must fail.');
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('cross_school_parent_write_rejected',blocked);
 blocked:=false;
 BEGIN UPDATE public.submissions SET school_id=school_b WHERE id=idea_a;
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('record_school_cannot_be_changed',blocked);
 SELECT count(*) INTO n FROM public.school_profiles WHERE id=actor_b;
 INSERT INTO isolation_probe_results VALUES('staff_directory_excludes_other_school',n=0);
 SELECT count(*) INTO n FROM public.idea_notifications WHERE school_id=school_b;
 INSERT INTO isolation_probe_results VALUES('notifications_exclude_other_school',n=0);
 SELECT count(*) INTO n FROM public.idea_notifications WHERE school_id=school_a;
 INSERT INTO isolation_probe_results VALUES('notifications_include_own_school',n=1);
 EXECUTE 'RESET ROLE';

 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO n FROM public.profiles WHERE id=actor_b;
 INSERT INTO isolation_probe_results VALUES('account_profiles_remain_self_only',n=0);
 SELECT count(*) INTO n FROM public.school_memberships WHERE school_id=school_b;
 INSERT INTO isolation_probe_results VALUES('school_memberships_remain_local',n=0);
 blocked:=false;
 BEGIN SELECT count(*) INTO n FROM public.submissions;
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('authenticated_cannot_bypass_gateway',blocked);
 blocked:=false;
 BEGIN UPDATE public.school_release_gate SET isolation_verified=true;
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('authenticated_cannot_open_release_gate',blocked);
 EXECUTE 'RESET ROLE';

 EXECUTE 'SET LOCAL ROLE anon';
 blocked:=false;
 BEGIN SELECT count(*) INTO n FROM public.submissions;
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('anon_cannot_read_private_submissions',blocked);
 EXECUTE 'RESET ROLE';

 EXECUTE 'SET LOCAL ROLE service_role';
 blocked:=false;
 BEGIN PERFORM public.tenant_rpc(school_a,actor_b,'set_idea_follow',jsonb_build_object('p_submission_id',idea_a,'p_following',true));
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('gateway_rejects_foreign_school_actor',blocked);
 blocked:=false;
 BEGIN UPDATE public.school_release_gate SET isolation_verified=true;
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('service_key_cannot_open_release_gate',blocked);
 EXECUTE 'RESET ROLE';

 -- Verify that calls cannot leak their scope into a pooled connection.
 PERFORM set_config('suggfeed.school_id',school_b::text,true);
 PERFORM set_config('suggfeed.actor_id',actor_b::text,true);
 PERFORM public.tenant_rpc(school_a,actor_a,'set_idea_follow',jsonb_build_object('p_submission_id',idea_a,'p_following',true));
 SELECT count(*) INTO n FROM public.idea_follows WHERE school_id=school_a AND user_id=actor_a AND submission_id=idea_a;
 INSERT INTO isolation_probe_results VALUES('gateway_accepts_own_school_follow',n=1);
 INSERT INTO isolation_probe_results VALUES('gateway_restores_scope_after_success',current_setting('suggfeed.school_id')=school_b::text AND current_setting('suggfeed.actor_id')=actor_b::text);
 blocked:=false;
 BEGIN PERFORM public.tenant_rpc(school_a,actor_a,'set_idea_follow',jsonb_build_object('p_submission_id',idea_b,'p_following',true));
 EXCEPTION WHEN raise_exception OR foreign_key_violation OR insufficient_privilege OR no_data_found THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('gateway_rejects_foreign_resource_id',blocked);
 INSERT INTO isolation_probe_results VALUES('gateway_restores_scope_after_failure',current_setting('suggfeed.school_id')=school_b::text AND current_setting('suggfeed.actor_id')=actor_b::text);
 -- Exercise the same write/receipt gateway used by the submission API.
 submission_args:=jsonb_build_object('p_owner_hash',repeat('a',64),'p_request_id',receipt,'p_payload_hash',repeat('b',64),'p_title','Rollback submission check','p_description','Synthetic backend check, rolled back after verification.','p_category_id',category_a,'p_user_id',actor_a,'p_tracking_hash',NULL);
 result:=public.tenant_rpc(school_a,actor_a,'create_submission_once',submission_args);
 submitted_id:=(result->>'id')::uuid;
 SELECT count(*) INTO n FROM public.submissions WHERE id=submitted_id AND school_id=school_a AND user_id=actor_a AND status='pending';
 INSERT INTO isolation_probe_results VALUES('submission_gateway_records_pending_idea',n=1 AND result->>'replayed'='false');
 result:=public.tenant_rpc(school_a,actor_a,'create_submission_once',submission_args);
 INSERT INTO isolation_probe_results VALUES('submission_gateway_replays_without_duplicate',result->>'id'=submitted_id::text AND result->>'replayed'='true');
 result:=public.tenant_rpc(school_a,actor_a,'read_submission_receipt',jsonb_build_object('p_owner_hash',repeat('a',64),'p_request_id',receipt));
 INSERT INTO isolation_probe_results VALUES('submission_gateway_recovers_receipt',result->>'id'=submitted_id::text);
 EXECUTE 'SET LOCAL ROLE service_role';
 result:=public.create_school_member_invitation(school_a,actor_a,invitation_hash,actor_b::text||'@example.invalid','moderator','link');
 invitation_id:=(result->>'id')::uuid;
 result:=public.list_school_member_invitations(school_a,actor_a);
 INSERT INTO isolation_probe_results VALUES('invitation_manager_omits_token_hashes',jsonb_array_length(result)=1 AND result->0->>'token_hash' IS NULL AND result->0->>'role'='moderator');
 result:=public.school_invitation_preview(invitation_hash,actor_b);
 INSERT INTO isolation_probe_results VALUES('invitation_preview_matches_verified_recipient',result->>'email_matches'='true' AND result->>'state'='pending' AND result->>'email' IS NULL);
 PERFORM public.revoke_school_member_invitation(school_a,actor_a,invitation_id);
 blocked:=false;
 BEGIN PERFORM public.accept_school_invitation(actor_b,invitation_hash);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('revoked_invitation_cannot_grant_membership',blocked);
 EXECUTE 'RESET ROLE';
 UPDATE public.school_memberships SET status='revoked' WHERE school_id=school_a AND user_id=actor_a;
 blocked:=false;
 BEGIN PERFORM public.tenant_rpc(school_a,actor_a,'set_idea_follow',jsonb_build_object('p_submission_id',idea_a,'p_following',true));
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 INSERT INTO isolation_probe_results VALUES('gateway_rechecks_revoked_membership',blocked);

 FOR item IN SELECT check_name FROM isolation_probe_results WHERE NOT passed LOOP
  RAISE EXCEPTION 'Hosted isolation check failed: %',item.check_name;
 END LOOP;
END $probe$;
SELECT jsonb_build_object('checks',jsonb_agg(jsonb_build_object('name',check_name,'passed',passed) ORDER BY check_name),'all_passed',bool_and(passed),'fixture_persistence','rolled_back') AS verification FROM isolation_probe_results;
ROLLBACK;

-- The management API returns the last result; prior assertions must succeed to reach this statement.
SELECT jsonb_build_object('all_passed',true,'check_count',27,'fixture_persistence','rolled_back') AS verification;
