import { Router, Request, Response, NextFunction } from "express";
import { loadUserProfile, loadUserSubmissions } from "../lib/data";

import { supabaseService } from '../lib/supabase';
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
    const user = req.session.user ?? null;

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
 if(!req.session.user)return res.status(401).json({success:false,error:'Sign in to load account bookmarks.'});
 const ids=await loadBookmarkIds(req.session.user.id);
 return res.json({success:true,ids});
}));
router.post('/preferences',sameOriginOnly,asyncHandler(async(req,res)=>{
 const user=req.session.user;if(!user)return res.status(401).json({success:false,error:'Sign in to update account preferences.'});
 const {display_name,email_notifications_enabled}=req.body || {};
 if(typeof display_name!=='string' || display_name.trim().length>60 || typeof email_notifications_enabled!=='boolean')return res.status(400).json({success:false,error:'Use a display name of up to 60 characters and a valid notification choice.'});
 const {data,error}=await supabaseService.from('profiles').update({display_name:display_name.trim() || null,email_notifications_enabled}).eq('id',user.id).select('display_name,email_notifications_enabled').single();
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
  const offset=req.body?.offset ?? 0,localPhase=req.body?.local===true || !req.session.user;
  if(!Number.isSafeInteger(offset) || offset<0 || offset>100000)return res.status(400).json({success:false,error:'Invalid activity page.'});
  const size=25;
  let ids:string[]=[],more=false;
  if(!localPhase){
   const result=await supabaseService.from(tables[tab]).select('submission_id').eq('user_id',req.session.user!.id).order('created_at',{ascending:false}).order('submission_id').range(offset,offset+size);
   if(result.error)throw new Error('Activity could not load.');
   more=(result.data || []).length>size;ids=(result.data || []).slice(0,size).map(row=>row.submission_id);
  }else{
   let remembered=Array.isArray(req.body?.ids)?[...new Set<string>(req.body.ids.filter((id:unknown):id is string=>typeof id==='string' && uuid.test(id)))].slice(0,200):[];
   if(req.session.user && tab==='bookmarks')remembered=[];
   if(req.session.user && remembered.length){
    const result=await supabaseService.from(tables[tab]).select('submission_id').eq('user_id',req.session.user.id).in('submission_id',remembered);
    if(result.error)throw new Error('Device activity could not load.');
    const recorded=new Set((result.data || []).map(row=>row.submission_id));remembered=remembered.filter(id=>!recorded.has(id));
   }
   ids=remembered.slice(offset,offset+size);more=remembered.length>offset+size;
  }
  let rows:any[]=[];
  if(ids.length){
   const result=await supabaseService.from('submissions').select('id,title,status,vote_count,created_at,categories(name)').in('id',ids).in('status',['approved','in_progress','resolved']);
   if(result.error)throw new Error('Public activity could not load.');
   const byId=new Map((result.data || []).map(row=>[row.id,row]));rows=ids.map(id=>byId.get(id)).filter(Boolean);
  }
  const next=more?{offset:offset+size,local:localPhase}:!localPhase && tab!=='bookmarks'?{offset:0,local:true}:null;
  return res.json({success:true,rows,next});
 }
 const local=(key:string):string[]=>Array.isArray(req.body?.[key])?[...new Set<string>(req.body[key].filter((id:unknown):id is string=>typeof id==='string' && uuid.test(id)))].slice(0,200):[];
 const accountIds=async(table:string)=>{
  if(!req.session.user)return [];
  const {data,error}=await supabaseService.from(table).select('submission_id').eq('user_id',req.session.user.id).order('created_at',{ascending:false}).limit(200);
  if(error)throw new Error('Account activity could not load.');return (data || []).map(row=>row.submission_id as string);
 };
 const [saved,supported,shared]=await Promise.all([accountIds('bookmarks'),accountIds('votes'),accountIds('shared_posts')]);
 const groups={bookmarks:req.session.user?saved:local('saved'),voted:[...new Set([...supported,...local('supported')])].slice(0,200),shared:[...new Set([...shared,...local('shared')])].slice(0,200)};
 const ids=[...new Set(Object.values(groups).flat())];
 let rows:any[]=[];
 for(let offset=0;offset<ids.length;offset+=100){const result=await supabaseService.from('submissions').select('id,title,status,vote_count,created_at,categories(name)').in('id',ids.slice(offset,offset+100)).in('status',['approved','in_progress','resolved']);if(result.error)throw new Error('Public activity could not load.');rows.push(...(result.data || []));}
 const byId=new Map(rows.map(row=>[row.id,row]));
 return res.json({success:true,...Object.fromEntries(Object.entries(groups).map(([key,list])=>[key,list.map(id=>byId.get(id)).filter(Boolean)]))});
}));
router.post('/shared/:id',sameOriginOnly,asyncHandler(async(req,res)=>{
 const id=req.params.id as string;if(!uuid.test(id))return res.status(400).json({success:false,error:'Invalid idea.'});
 const {data,error}=await supabaseService.from('submissions').select('id').eq('id',id).in('status',['approved','in_progress','resolved']).maybeSingle();
 if(error)throw new Error('Sharing could not be recorded.');if(!data)return res.status(404).json({success:false,error:'Public idea not found.'});
 if(req.session.user){const write=await supabaseService.from('shared_posts').upsert({user_id:req.session.user.id,submission_id:id},{onConflict:'user_id,submission_id'});if(write.error)throw new Error('Sharing could not be recorded.');}
 return res.json({success:true});
}));
export default router;
