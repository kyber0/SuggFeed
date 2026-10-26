import type { Request, Response } from 'express';
import { supabasePlatform } from '../lib/supabase';
import { READINESS_TIMEOUT_MS } from '../lib/provider-fetch';

export function liveness(_req: Request, res: Response) {
 res.setHeader('Cache-Control','no-store');
 return res.json({status:'alive'});
}

export async function readiness(_req: Request, res: Response) {
 res.setHeader('Cache-Control','no-store');
 try {
  const {error}=await supabasePlatform.from('schools').select('id').limit(1).abortSignal(AbortSignal.timeout(READINESS_TIMEOUT_MS));
  if(error)throw error;
  res.json({status:'healthy',database:'connected',ts:new Date().toISOString()});
 }catch{
  res.status(503).json({status:'unhealthy',database:'disconnected',ts:new Date().toISOString()});
 }
}
