import { Router, Request, Response, NextFunction } from "express";
import { loadUserProfile, loadUserSubmissions, loadUserBookmarks } from "../lib/data";

import { supabaseService } from '../lib/supabase';
import { sameOriginOnly } from '../lib/security';
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

    const [profile, submissions, bookmarks] = await Promise.all([
      loadUserProfile(user.id),
      loadUserSubmissions(user.id),
      loadUserBookmarks(user.id),
    ]);

    res.render("profile", {
      title: "My Profile — SuggFeed",
      description: "Manage your ideas and bookmarks.",
      profile,
      submissions,
      bookmarks,
    });
  })
);


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
