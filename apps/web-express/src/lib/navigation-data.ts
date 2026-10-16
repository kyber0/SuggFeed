import type { Request, Response, NextFunction } from 'express';
import { loadPublishedSubmissions, loadPublishedTotal, type CacheStatus } from './data';
import { feedFilters } from './feed-filters';
import { roadmapFilters, loadRoadmapPage, loadRoadmapCategories, loadRecentlyCompleted } from './roadmap';

/** Only public, anon/RLS-filtered data. No session, profile, tracking or staff reads. */
export function preloadPublicNavigation(path: string, input: Record<string, unknown>,reportCache?:(status:CacheStatus)=>void): Promise<unknown> | null {
  if(path==='/' || path==='/feed' || path==='/feed/'){
    const filters=path==='/'?feedFilters({sort:'latest'}):feedFilters(input);
    if(filters.scope==='following')return null;
    return loadPublishedSubmissions({page:filters.page,sortBy:filters.sort,category:filters.category,search:filters.search,reportCache,includeTotal:false});
  }
  if(path==='/roadmap' || path==='/roadmap/'){
    const filters=roadmapFilters(input);
    return Promise.all([
      loadRoadmapPage(filters,reportCache),loadRoadmapCategories(),
      filters.view==='board' && filters.stage==='all' && !filters.search && filters.category==='all'
        ? loadRecentlyCompleted():Promise.resolve([]),
    ]);
  }
  return null;
}

/** Start public reads before session I/O; the route joins the same cache promise. */
export function startPublicNavigation(req: Request, res: Response, next: NextFunction) {
  if(req.method==='GET'){
    // Errors remain visible through the actual route's loader. Handle this branch
    // as well so an early failure cannot become an unhandled promise rejection.
    const pending=preloadPublicNavigation(req.path,req.query,status=>{res.locals.publicNavigationCache=status;});
    if(pending)void pending.catch(()=>undefined);
  }
  next();
}

/** A prefetch only warms shared public data; it never sends account-specific HTML. */
export async function warmPublicNavigation(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control','no-store');
  const path=typeof req.query.path==='string'?req.query.path:'';
  try {
    const pending=preloadPublicNavigation(path,req.query);
    if(!pending)return res.status(400).json({success:false,error:'This destination cannot be prefetched.'});
    await pending;
    return res.status(204).end();
  } catch(error){next(error);}
}

/** No session/cookies or account state; only a public count may enter CDN cache. */
export async function publicFeedTotal(req:Request,res:Response,next:NextFunction){
  const filters=feedFilters(req.query);
  if(filters.scope==='following'){
    res.setHeader('Cache-Control','no-store');
    return res.status(400).json({success:false,error:'This count is only available for public ideas.'});
  }
  try{
    const count=await loadPublishedTotal(filters.category,filters.search);
    res.setHeader('Cache-Control','private, no-store');
    return res.json({success:true,count});
  }catch(error){res.setHeader('Cache-Control','no-store');next(error);}
}
