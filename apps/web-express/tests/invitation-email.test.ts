import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invitationEmailConfigured,schoolInvitationEmail,sendSchoolInvitation} from '../src/lib/invitation-email';
const token='a'.repeat(64),url='https://www.suggfeed.me/schools/invitations/'+token;
test('branded invitation email includes school, access, expiry, safe links and an escaped text alternative',()=>{
 const result=schoolInvitationEmail('<School & community>','moderator',url,'2026-10-20T04:00:00Z');
 assert.match(result.html,/&lt;School &amp; community&gt;/);assert.doesNotMatch(result.html,/<School/);
 assert.match(result.html,/Accept invitation/);assert.match(result.text,/Moderator/);assert.match(result.text,/Philippine time/);assert.match(result.text,/email address that received/);assert.match(result.html,/prefers-color-scheme:dark/);
 for(const bad of ['http://www.suggfeed.me/schools/invitations/'+token,'https://www.suggfeed.me/other','https://user:pass@www.suggfeed.me/schools/invitations/'+token])assert.throws(()=>schoolInvitationEmail('School','student',bad,'2026-10-20'));
 assert.equal(invitationEmailConfigured({} as any),false);
});
test('invitation transport distinguishes provider acceptance, rejection and uncertainty without duplicate retries',async()=>{
 const previous={key:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL,origin:process.env.APP_ORIGIN};
 Object.assign(process.env,{RESEND_API_KEY:'synthetic-key',RESEND_FROM_EMAIL:'SuggFeed <invite@example.test>',APP_ORIGIN:'https://www.suggfeed.me'});
 try{
  assert.equal(invitationEmailConfigured(),true);let calls=0;
  const input={id:'test-invitation',school:'Synthetic school',email:'person@example.test',role:'student' as const,token,expires:'2026-10-20'};
  const accepted=(async(_url:any,options:any)=>{calls++;assert.equal(options.headers['Idempotency-Key'],'school-invitation-test-invitation');const body=JSON.parse(options.body);assert.deepEqual(body.to,['person@example.test']);assert.match(body.html,/Synthetic school/);return Response.json({id:'provider-id'});}) as typeof fetch;
  assert.equal(await sendSchoolInvitation(input,accepted),'sent');assert.equal(calls,1);
  assert.equal(await sendSchoolInvitation(input,(async()=>new Response('',{status:401})) as any),'failed');
  assert.equal(await sendSchoolInvitation(input,(async()=>new Response('',{status:503})) as any),'uncertain');
  assert.equal(await sendSchoolInvitation(input,(async()=>{throw Error('timeout')}) as any),'uncertain');
  assert.equal(await sendSchoolInvitation(input,(async()=>Response.json({})) as any),'uncertain');
 }finally{for(const [key,value]of Object.entries({RESEND_API_KEY:previous.key,RESEND_FROM_EMAIL:previous.from,APP_ORIGIN:previous.origin})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
