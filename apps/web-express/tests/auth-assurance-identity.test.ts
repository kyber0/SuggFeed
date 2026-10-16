import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIdentity } from '../src/lib/identity';
import { supabasePlatform } from '../src/lib/supabase';

// The provider mock represents verification; decoding a token is never verification.
test('identity derives assurance only from the exact provider-verified session token',async()=>{
 const original={getUser:supabasePlatform.auth.getUser,from:supabasePlatform.from};
 const token='header.'+Buffer.from(JSON.stringify({aal:'aal2'})).toString('base64url')+'.signature';
 let verified=true;
 try {
  supabasePlatform.auth.getUser=(async(value:string)=>({data:{user:verified&&value===token?{id:'owner'}:null},error:verified?null:{status:401}})) as any;
  supabasePlatform.from=(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'admin'},error:null})})})})) as any;
  const run=async(accessToken:string)=>{
   const req:any={path:'/platform/schools',method:'GET',session:{user:{id:'owner',role:'admin'},accessToken},headers:{'x-auth-assurance':'aal2'}};
   const res:any={locals:{authAssurance:'aal2'},append(){}};
   await new Promise<void>((resolve,reject)=>validateIdentity(req,res,error=>error?reject(error):resolve()));
   return {req,res};
  };
  assert.equal((await run(token)).res.locals.authAssurance,'aal2');
  verified=false;
  const rejected=await run(token);
  assert.equal(rejected.res.locals.authAssurance,'aal1');assert.equal(rejected.req.session.user,null);
 } finally {supabasePlatform.auth.getUser=original.getUser;supabasePlatform.from=original.from;}
});
