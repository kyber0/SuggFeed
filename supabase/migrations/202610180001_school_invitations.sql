-- Invitation management stays behind verified school administration; tokens remain hashed.
BEGIN;
ALTER TABLE public.school_invitations ADD COLUMN revoked_at timestamptz,
 ADD COLUMN delivery_state text NOT NULL DEFAULT 'link' CHECK(delivery_state IN('link','sending','sent','failed','uncertain'));

CREATE FUNCTION public.create_school_member_invitation(p_school uuid,p_actor uuid,p_hash text,p_email text,p_role text,p_delivery text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE invitation public.school_invitations;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=p_school AND approved_at IS NOT NULL) THEN RAISE EXCEPTION 'School policy review required' USING ERRCODE='22023'; END IF;
 IF p_delivery IS NULL OR p_delivery NOT IN('link','email') THEN RAISE EXCEPTION 'Choose an invitation method' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.school_id=p_school AND m.status='active' AND lower(u.email)=lower(btrim(p_email))) THEN
  RAISE EXCEPTION 'This account is already a school member' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_invitations WHERE school_id=p_school AND email=lower(btrim(p_email)) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) THEN
  RAISE EXCEPTION 'A pending invitation already exists. Revoke it before creating another' USING ERRCODE='23505'; END IF;
 PERFORM public.issue_school_invitation(p_school,p_actor,p_hash,p_email,p_role);
 UPDATE public.school_invitations SET delivery_state=CASE WHEN p_delivery='email' THEN 'sending' ELSE 'link' END WHERE token_hash=p_hash RETURNING * INTO invitation;
 RETURN jsonb_build_object('id',invitation.id,'expires_at',invitation.expires_at);
END $$;

CREATE FUNCTION public.list_school_member_invitations(p_school uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=p_actor AND role='admin' AND status='active') OR NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND status<>'closed') THEN
  RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC,i.id DESC) FROM
  (SELECT id,email,role,expires_at,created_at,accepted_at,revoked_at,delivery_state FROM public.school_invitations WHERE school_id=p_school ORDER BY created_at DESC,id DESC LIMIT 50) i),'[]'::jsonb);
END $$;

CREATE FUNCTION public.record_school_invitation_delivery(p_school uuid,p_actor uuid,p_invitation uuid,p_state text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 IF p_state IS NULL OR p_state NOT IN('sent','failed','uncertain') THEN RAISE EXCEPTION 'Invalid delivery state' USING ERRCODE='22023'; END IF;
 UPDATE public.school_invitations SET delivery_state=p_state WHERE id=p_invitation AND school_id=p_school AND invited_by=p_actor AND delivery_state='sending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation delivery unavailable' USING ERRCODE='P0002'; END IF;
END $$;

CREATE FUNCTION public.revoke_school_member_invitation(p_school uuid,p_actor uuid,p_invitation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.school_invitations WHERE id=p_invitation AND school_id=p_school FOR UPDATE;
 PERFORM 1 FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 UPDATE public.school_invitations SET revoked_at=coalesce(revoked_at,now()) WHERE id=p_invitation AND school_id=p_school AND accepted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending invitation unavailable' USING ERRCODE='P0002'; END IF;
END $$;

CREATE FUNCTION public.school_invitation_preview(p_hash text,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE invitation public.school_invitations; school public.schools; verified_email text; state text; member_role text; can_enter boolean;
BEGIN
 SELECT * INTO invitation FROM public.school_invitations WHERE token_hash=p_hash;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO school FROM public.schools WHERE id=invitation.school_id;
 SELECT lower(email) INTO verified_email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL;
 SELECT role INTO member_role FROM public.school_memberships WHERE school_id=school.id AND user_id=p_actor AND status='active';
 can_enter:=member_role IS NOT NULL AND school.status='active' AND coalesce(p_actor=invitation.accepted_by OR verified_email=invitation.email,false);
 state:=CASE WHEN invitation.revoked_at IS NOT NULL THEN 'revoked' WHEN invitation.accepted_at IS NOT NULL THEN 'accepted' WHEN invitation.expires_at<=now() THEN 'expired'
  WHEN NOT public.school_actor_has_role(invitation.school_id,invitation.invited_by,ARRAY['admin']) OR NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=school.id AND approved_at IS NOT NULL) THEN 'unavailable'
  WHEN verified_email=invitation.email AND EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=school.id AND user_id=p_actor AND status='active') THEN 'member' ELSE 'pending' END;
 RETURN jsonb_build_object('school_name',school.name,'school_slug',school.slug,'role',CASE WHEN can_enter THEN member_role ELSE invitation.role END,'expires_at',invitation.expires_at,'state',state,
  'recipient',left(split_part(invitation.email,'@',1),1)||'•••@'||split_part(invitation.email,'@',2),'email_matches',coalesce(verified_email=invitation.email,false),
  'can_enter',can_enter);
END $$;

-- Recheck revocation under the invitation row lock before existing acceptance checks.
ALTER FUNCTION public.accept_school_invitation(uuid,text) RENAME TO accept_school_invitation_v1;
REVOKE ALL ON FUNCTION public.accept_school_invitation_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.accept_school_invitation(p_actor uuid,p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE invitation public.school_invitations;
BEGIN
 SELECT * INTO invitation FROM public.school_invitations WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR invitation.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=invitation.school_id AND approved_at IS NOT NULL) THEN RAISE EXCEPTION 'School policy review required' USING ERRCODE='42501'; END IF;
 RETURN public.accept_school_invitation_v1(p_actor,p_hash);
END $$;
REVOKE ALL ON FUNCTION public.create_school_member_invitation(uuid,uuid,text,text,text,text),public.list_school_member_invitations(uuid,uuid),public.record_school_invitation_delivery(uuid,uuid,uuid,text),public.revoke_school_member_invitation(uuid,uuid,uuid),public.school_invitation_preview(text,uuid),public.accept_school_invitation(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_school_member_invitation(uuid,uuid,text,text,text,text),public.list_school_member_invitations(uuid,uuid),public.record_school_invitation_delivery(uuid,uuid,uuid,text),public.revoke_school_member_invitation(uuid,uuid,uuid),public.school_invitation_preview(text,uuid),public.accept_school_invitation(uuid,text) TO service_role;
COMMIT;
