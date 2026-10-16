import { createHmac } from 'node:crypto';
import type { RequestHandler } from 'express';
import { currentSchool } from './school-scope';
import { supabasePlatform } from './supabase';
import '../types';

function sharedBudget(category: 'write' | 'auth'): RequestHandler {
  return async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32 || !process.env.SUPABASE_SERVICE_ROLE_KEY ||
        !(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      res.status(503).json({ success: false, error: 'Request controls unavailable. Please try again later.' });
      return;
    }
    const identities: [string, string, number][] = [
      ['ip', req.ip || req.socket.remoteAddress || 'unknown', category === 'auth' ? 20 : 200],
    ];
    if (req.session?.user?.id) identities.push(['account', req.session.user.id, category === 'auth' ? 20 : 120]);
    const school = currentSchool();
    if (school) identities.push(['school', school.id, 1000]);
    try {
      for (const [kind, identity, limit] of identities) {
        // Constant categories keep paths, invitation tokens and submitted secrets out of storage.
        const key = createHmac('sha256', secret).update(JSON.stringify(['request-budget-v1', category, kind, identity])).digest('hex');
        const { data, error } = await supabasePlatform.rpc('consume_request_budget', {
          p_key: key, p_limit: limit, p_window_seconds: 900,
        });
        const budget = Array.isArray(data) && data.length === 1 ? data[0] : null;
        if (error || !budget || typeof budget.allowed !== 'boolean' ||
            !Number.isInteger(budget.retry_after) || budget.retry_after < 1 || budget.retry_after > 86400) {
          throw new Error('Request budget unavailable');
        }
        if (!budget.allowed) {
          res.setHeader('Retry-After', String(budget.retry_after));
          res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
          return;
        }
      }
      next();
    } catch {
      res.status(503).json({ success: false, error: 'Request controls unavailable. Please try again later.' });
    }
  };
}

export const sharedWriteBudget = sharedBudget('write');
export const sharedAuthBudget = sharedBudget('auth');
