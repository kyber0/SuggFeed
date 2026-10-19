import {schoolFeature} from '../lib/school-customization';
import { schoolUser } from '../lib/school-scope';
import { Router, Request, Response, NextFunction } from "express";
import { loadUserProfile, loadUserSubmissions } from "../lib/data";

import { supabaseService, supabasePlatform } from '../lib/supabase';
import { sameOriginOnly } from '../lib/security';
import { loadBookmarkIds } from '../lib/feed-account';
const router = Router();
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const user = schoolUser(req) ?? null;

    if (!user) {
      return res.render("profile", {
        title: "Profile — SuggFeed",
        description: "Sign in to view your profile and manage your ideas.",
        profile: null,
        submissions: [],
        bookmarks: [],
      });
    }

    const dataStarted=performance.now();
    const [profile, submissions] = await Promise.all([
      res.locals.verifiedProfile?.userId===user.id
        ? Promise.resolve(res.locals.verifiedProfile.profile)
        : loadUserProfile(user.id),
      loadUserSubmissions(user.id),
    ]);

    res.append('Server-Timing',`data;dur=${(performance.now()-dataStarted).toFixed(1)}`);
    res.render("profile", {
      title: "My Profile — SuggFeed",
      description: "Manage your ideas and bookmarks.",
      profile,
      submissions,
      bookmarks: [],
    });
  })
);


router.get('/bookmarks',asyncHandler(async(req,res)=>{
 if(!schoolUser(req))return res.status(401).json({success:false,error:'Sign in to load account bookmarks.'});
 const ids=await loadBookmarkIds(schoolUser(req)!.id);
 return res.json({success:true,ids});
}));
router.post('/preferences',sameOriginOnly,asyncHandler(async(req,res)=>{
 const user=schoolUser(req);if(!user)return res.status(401).json({success:false,error:'Sign in to update account preferences.'});
 const {display_name,email_notifications_enabled}=req.body || {};
 if(typeof display_name!=='string' || display_name.trim().length>60 || typeof email_notifications_enabled!=='boolean')return res.status(400).json({success:false,error:'Use a display name of up to 60 characters and a valid notification choice.'});
 const {data,error}=await supabasePlatform.from('profiles').update({display_name:display_name.trim() || null,email_notifications_enabled}).eq('id',user.id).select('display_name,email_notifications_enabled').single();
 if(error)throw new Error('Account preferences could not be saved.');
 req.session.user!.display_name=data.display_name || undefined;
 req.session.user!.full_name=data.display_name || undefined;
 await new Promise<void>((resolve,reject)=>req.session.save(error=>error?reject(error):resolve()));
 return res.json({success:true,preferences:data});
}));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.post('/activity',sameOriginOnly,asyncHandler(async(req,res)=>{
 // New clients request one bounded page. Keep the legacy response for older cached clients.
 const tab=req.body?.tab;
 if(tab!==undefined){
  const tables:Record<string,string>={bookmarks:'bookmarks',voted:'votes',shared:'shared_posts'};
  if(typeof tab!=='string' || !['bookmarks','voted','shared'].includes(tab))return res.status(400).json({success:false,error:'Unknown activity tab.'});
  const offset=req.body?.offset ?? 0,localPhase=req.body?.local===true || !schoolUser(req);
  if(!Number.isSafeInteger(offset) || offset<0 || offset>100000)return res.status(400).json({success:false,error:'Invalid activity page.'});
  const size=25,columns='id,title,status,vote_count,created_at,categories(name)';
  const publicStatuses=['approved','in_progress','resolved'];
  const deviceRows=async()=>{
   let remembered=Array.isArray(req.body?.ids)?[...new Set<string>(req.body.ids.filter((id:unknown):id is string=>typeof id==='string' && uuid.test(id)))].slice(0,200):[];
   if(schoolUser(req) && tab==='bookmarks')return [];
   if(schoolUser(req) && remembered.length){
    const result=await supabaseService.from(tables[tab]).select('submission_id').eq('user_id',schoolUser(req)!.id).in('submission_id',remembered);
    if(result.error)throw new Error('Device activity could not load.');
    const recorded=new Set((result.data || []).map(row=>row.submission_id));remembered=remembered.filter(id=>!recorded.has(id));
   }
   if(!remembered.length)return [];
   const result=await supabaseService.from('submissions').select(columns).in('id',remembered).in('status',publicStatuses);
   if(result.error)throw new Error('Public activity could not load.');
   const byId=new Map((result.data || []).map(row=>[row.id,row]));
   return remembered.map(id=>byId.get(id)).filter(Boolean);
  };
  let rows:any[]=[],next:{offset:number;local:boolean}|null=null;
  if(localPhase){
   const available=await deviceRows();
   rows=available.slice(offset,offset+size);
   if(available.length>offset+size)next={offset:offset+size,local:true};
  }else{
   // Filter before pagination so hidden or deleted ideas cannot create empty pages.
   const result=await supabaseService.from(tables[tab]).select(`submission_id,submission:submissions!inner(${columns})`).eq('user_id',schoolUser(req)!.id).in('submission.status',publicStatuses).order('created_at',{ascending:false}).order('submission_id').range(offset,offset+size);
   if(result.error)throw new Error('Activity could not load.');
   rows=(result.data || []).slice(0,size).map(row=>row.submission);
   if((result.data || []).length>size)next={offset:offset+size,local:false};
   else {
    const available=await deviceRows();
    if(!rows.length){rows=available.slice(0,size);if(available.length>size)next={offset:size,local:true};}
    else if(available.length)next={offset:0,local:true};
   }
  }
  return res.json({success:true,rows,next});
 }
 const local=(key:string):string[]=>Array.isArray(req.body?.[key])?[...new Set<string>(req.body[key].filter((id:unknown):id is string=>typeof id==='string' && uuid.test(id)))].slice(0,200):[];
 const accountIds=async(table:string)=>{
  if(!schoolUser(req))return [];
  const {data,error}=await supabaseService.from(table).select('submission_id').eq('user_id',schoolUser(req)!.id).order('created_at',{ascending:false}).limit(200);
  if(error)throw new Error('Account activity could not load.');return (data || []).map(row=>row.submission_id as string);
 };
 const [saved,supported,shared]=await Promise.all([accountIds('bookmarks'),accountIds('votes'),accountIds('shared_posts')]);
 const groups={bookmarks:schoolUser(req)?saved:local('saved'),voted:[...new Set([...supported,...local('supported')])].slice(0,200),shared:[...new Set([...shared,...local('shared')])].slice(0,200)};
 const ids=[...new Set(Object.values(groups).flat())];
 let rows:any[]=[];
 for(let offset=0;offset<ids.length;offset+=100){const result=await supabaseService.from('submissions').select('id,title,status,vote_count,created_at,categories(name)').in('id',ids.slice(offset,offset+100)).in('status',['approved','in_progress','resolved']);if(result.error)throw new Error('Public activity could not load.');rows.push(...(result.data || []));}
 const byId=new Map(rows.map(row=>[row.id,row]));
 return res.json({success:true,...Object.fromEntries(Object.entries(groups).map(([key,list])=>[key,list.map(id=>byId.get(id)).filter(Boolean)]))});
}));
router.post('/shared/:id',sameOriginOnly,asyncHandler(async(req,res)=>{
 if(!schoolFeature('sharing'))return res.status(403).json({success:false,code:'FEATURE_DISABLED',error:'This school disabled new sharing actions.'});
 const id=req.params.id as string;if(!uuid.test(id))return res.status(400).json({success:false,error:'Invalid idea.'});
 const {data,error}=await supabaseService.from('submissions').select('id').eq('id',id).in('status',['approved','in_progress','resolved']).maybeSingle();
 if(error)throw new Error('Sharing could not be recorded.');if(!data)return res.status(404).json({success:false,error:'Public idea not found.'});
 if(schoolUser(req)){const write=await supabaseService.from('shared_posts').upsert({user_id:schoolUser(req)!.id,submission_id:id},{onConflict:'user_id,submission_id'});if(write.error)throw new Error('Sharing could not be recorded.');}
 return res.json({success:true});
}));
export default router;
