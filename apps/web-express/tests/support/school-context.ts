import type { Request, Response, NextFunction } from 'express';
import { runWithSchool } from '../../src/lib/school-scope';

/** HTTP fixtures treat their mock user role as an already verified school membership. */
export function withTestSchool(req: Request, _res: Response, next: NextFunction) {
 const user=req.session.user;
 const role=user ? (user.role==='admin'||user.role==='moderator'?user.role:'student') : null;
 return runWithSchool({id:'00000000-0000-4000-8000-00000000000a',slug:'test-school',name:'Test School',actorId:user?.id??null,role},next);
}

import {test as nodeTest,type TestContext} from 'node:test';
/** Direct loader fixtures still need an explicit school for their shared cache keys. */
export function schoolTest(name:string,fn:(context:TestContext)=>unknown) {
 return nodeTest(name,async context=>{
  await runWithSchool({id:'00000000-0000-4000-8000-00000000000a',slug:'test-school',name:'Test School',actorId:null,role:null},()=>fn(context));
 });
}
