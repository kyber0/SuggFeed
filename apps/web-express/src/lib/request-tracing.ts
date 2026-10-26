import { randomUUID } from 'node:crypto';
import type { Request, Response, RequestHandler } from 'express';
import { safeRequestPath } from './request-path';

/** Ignore caller-supplied IDs so an untrusted header cannot forge log attribution. */
export const traceRequest: RequestHandler = (_req, res, next) => {
 const id=randomUUID();res.locals.requestId=id;res.setHeader('X-Request-ID',id);next();
};

export function requestErrorRecord(error: Error, req: Pick<Request, 'method' | 'path'>, res: Pick<Response, 'locals'>) {
 const status=(error as Error & {status?:number}).status;
 const code=status===503?'SERVICE_UNAVAILABLE':status===400?'INVALID_REQUEST':status===413?'BODY_TOO_LARGE':'INTERNAL_ERROR';
 const name=['Error','TypeError','RangeError','SyntaxError','AbortError','TimeoutError'].includes(error.name)?error.name:'ApplicationError';
 return {level:'error',event:'request_failed',requestId:res.locals.requestId,method:req.method,path:safeRequestPath(req.path),code,errorType:name};
}
