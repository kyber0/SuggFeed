'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from './auth-context';

const recoveryKey='sf:next-password-recovery:v1';
export default function AuthCallbackPage({codeEntry=false}:{codeEntry?:boolean}){
 const {openAuthModal}=useAuth();
 const started=useRef<Promise<{session:Session|null;recovery:boolean;destination:string}>|null>(null);
 const [session,setSession]=useState<Session|null>(null),[message,setMessage]=useState('Verifying your sign-in link…'),[error,setError]=useState('');
 const [email,setEmail]=useState(''),[code,setCode]=useState('');
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[complete,setComplete]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  if(!started.current)started.current=(async()=>{
   const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));
   let recovery=query.get('type')==='recovery' || hash.get('type')==='recovery';
   let recoveryEvent=false;
   const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')recoveryEvent=true;});
   const requested=query.get('next') || '/';
   let destination='/';
   try{const url=new URL(requested,location.origin);if(url.origin===location.origin && requested.startsWith('/') && !requested.startsWith('//') && !requested.includes('\\') && !url.pathname.startsWith('/auth/'))destination=url.pathname+url.search+url.hash;}catch{}
   history.replaceState(null,'',codeEntry?'/auth/recovery':recovery?'/auth/callback?type=recovery':'/auth/callback');
   try{
    if(query.has('error') || hash.has('error'))throw new Error('The link could not be verified. Please request a new one.');
    if(codeEntry && !query.has('code') && !hash.has('access_token'))return {session:null,recovery:true,destination:'/'};
    let current:Session|null=null;
    if(query.get('code')){const result=await supabase.auth.exchangeCodeForSession(query.get('code')!,query.get('sb_flow_id')?{flowId:query.get('sb_flow_id')!}:undefined);if(result.error)throw new Error('This link expired or was opened in a different browser. Request a fresh link.');current=result.data.session;recovery ||= ('redirectType' in result.data && result.data.redirectType==='recovery') || recoveryEvent;}
    else if(hash.get('access_token') && hash.get('refresh_token')){const result=await supabase.auth.setSession({access_token:hash.get('access_token')!,refresh_token:hash.get('refresh_token')!});if(result.error)throw new Error('The link expired. Please request a new one.');current=result.data.session;}
    else if(query.has('code') || hash.has('access_token') || hash.has('refresh_token'))throw new Error('The link is incomplete. Please request a new one.');
    else if(recovery){const result=await supabase.auth.getSession();current=result.data.session;let marker;try{marker=JSON.parse(sessionStorage.getItem(recoveryKey)||'null');}catch{}if(!current || marker?.userId!==current.user.id || typeof marker.createdAt!=='number' || marker.createdAt>Date.now() || Date.now()-marker.createdAt>30*60000)throw new Error('Please use a fresh password reset link.');}
    else throw new Error('The sign-in link is missing. Please sign in again.');
    if(!current)throw new Error('No verified session was returned. Please request a new link.');
    if(recovery){try{sessionStorage.setItem(recoveryKey,JSON.stringify({userId:current.user.id,createdAt:Date.now()}));}catch{}history.replaceState(null,'','/auth/callback?type=recovery');}
    return {session:current,recovery,destination};
   }finally{subscription.unsubscribe();}
  })();
  started.current.then(result=>{if(cancelled)return;if(result.recovery){setSession(result.session);setMessage(result.session?'Choose a new password to finish resetting your account.':'Enter your account email and the code from your password reset email.');}else location.replace(result.destination);}).catch(reason=>{if(!cancelled)setError(reason.message || 'Sign-in could not be completed.');});
  return()=>{cancelled=true;};
 },[codeEntry]);
 async function verifyCode(event:FormEvent){
  event.preventDefault();if(busy)return;setError('');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !/^[0-9]{6,10}$/.test(code.trim())){setError('Enter your email address and the numeric reset code.');return;}
  setBusy(true);
  try{const result=await supabase.auth.verifyOtp({email:email.trim(),token:code.trim(),type:'recovery'});if(result.error || !result.data.session)throw new Error('The reset code could not be verified. Check the email address and code, or request a fresh reset email.');setSession(result.data.session);setCode('');try{sessionStorage.setItem(recoveryKey,JSON.stringify({userId:result.data.session.user.id,createdAt:Date.now()}));}catch{}history.replaceState(null,'','/auth/callback?type=recovery');setMessage('Choose a new password to finish resetting your account.');}
  catch(reason){setError(reason instanceof Error?reason.message:'The code could not be verified.');}finally{setBusy(false);}
 }
 async function cancelReset(){if(busy)return;setBusy(true);try{const result=await supabase.auth.signOut({scope:'local'});if(result.error)throw result.error;try{sessionStorage.removeItem(recoveryKey);}catch{}location.replace('/');}catch{setError('Could not sign out. Please try again.');setBusy(false);}}
 async function updatePassword(event:FormEvent){
  event.preventDefault();if(busy || !session)return;setError('');
  if(password.length<8){setError('Use at least 8 characters.');return;}if(password!==confirmation){setError('The passwords do not match.');return;}
  setBusy(true);
  try{const current=await supabase.auth.getUser();if(current.error || current.data.user?.id!==session.user.id)throw new Error('Your reset session expired or the account changed. Request a fresh link.');const result=await supabase.auth.updateUser({password});if(result.error)throw result.error;try{sessionStorage.removeItem(recoveryKey);}catch{}setPassword('');setConfirmation('');setComplete(true);setMessage('Your password was updated.');}
  catch(reason){setError(reason instanceof Error?reason.message:'The password could not be updated.');}finally{setBusy(false);}
 }
 return <main className="auth-flow-card"><h1>{complete?'Password updated':session?'Choose a new password':'Verify your link'}</h1><p role="status">{message}</p>{error && <p role="alert">{error}</p>}{codeEntry && !session && <form className="am-form" onSubmit={verifyCode}><label className="am-label">Account email<input className="am-input" type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/></label><label className="am-label">Password reset code<input className="am-input" type="text" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={10} value={code} onChange={event=>setCode(event.target.value)} disabled={busy}/></label><button className="btn-primary" type="submit" disabled={busy}>{busy?'Verifying…':'Verify reset code'}</button><button type="button" className="am-btn-ghost" disabled={busy} onClick={()=>openAuthModal('forgot')}>Request a new reset email</button></form>}{session && !complete && <form className="am-form" onSubmit={updatePassword}><label className="am-label">New password<input className="am-input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label><label className="am-label">Confirm password<input className="am-input" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={event=>setConfirmation(event.target.value)} disabled={busy}/></label><button type="submit" className="btn-primary" disabled={busy}>{busy?'Updating…':'Update password'}</button></form>}{session && !complete && <button className="btn-ghost" disabled={busy} onClick={()=>void cancelReset()}>Cancel reset and sign out</button>}{(!session || complete) && <p><a href={complete?'/profile':'/'}>{complete?'Continue to your profile':'Return home'}</a></p>}</main>;
}
