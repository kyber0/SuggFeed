import type { Request, Response, NextFunction } from 'express';
import { loadPublishedSubmissions } from './data';
import { feedFilters } from './feed-filters';
import { roadmapFilters, loadRoadmapPage, loadRoadmapCategories, loadRecentlyCompleted } from './roadmap';

/** Only public, anon/RLS-filtered data. No session, profile, tracking or staff reads. */
export function preloadPublicNavigation(path: string, input: Record<string, unknown>): Promise<unknown> | null {
  if(path==='/' || path==='/feed' || path==='/feed/'){
    const filters=path==='/'?feedFilters({sort:'latest'}):feedFilters(input);
    if(filters.scope==='following')return null;
    return loadPublishedSubmissions({page:filters.page,sortBy:filters.sort,category:filters.category,search:filters.search});
  }
  if(path==='/roadmap' || path==='/roadmap/'){
    const filters=roadmapFilters(input);
    return Promise.all([
      loadRoadmapPage(filters),loadRoadmapCategories(),
      filters.view==='board' && filters.stage==='all' && !filters.search && filters.category==='all'
        ? loadRecentlyCompleted():Promise.resolve([]),
    ]);
  }
  return null;
}

/** Start public reads before session I/O; the route joins the same cache promise. */
export function startPublicNavigation(req: Request, _res: Response, next: NextFunction) {
  if(req.method==='GET'){
    // Errors remain visible through the actual route's loader. Handle this branch
    // as well so an early failure cannot become an unhandled promise rejection.
    const pending=preloadPublicNavigation(req.path,req.query);
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
