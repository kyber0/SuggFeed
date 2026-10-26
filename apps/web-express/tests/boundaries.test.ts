import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const {inspectBoundaries}=require('../scripts/check-boundaries.cjs');
function fixture(files:Record<string,string>,run:(root:string)=>void){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sf-boundaries-'));try{for(const [name,text] of Object.entries(files)){const file=path.join(root,'src',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}run(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('boundary guard flags reverse routes, generated runtime imports and browser-to-server imports',()=>{
 fixture({'lib/auth.ts':"import '../routes/schools'; require('../../public/js/design');",'routes/schools.ts':'','client/editor.ts':"import '../lib/auth';"},root=>assert.deepEqual(inspectBoundaries(root).map((finding:{kind:string})=>finding.kind).sort(),['browser-server','generated','layer']));
});
test('boundary guard detects import-equals cycles but excludes explicit type-only imports',()=>{
 fixture({'lib/a.ts':"import B = require('./b'); export = B;",'lib/b.ts':"import A = require('./a'); export = A;",'lib/c.ts':"import type {Thing} from './d';",'lib/d.ts':"import {type Thing} from './c';"},root=>{const cycles=inspectBoundaries(root).filter((finding:{kind:string})=>finding.kind==='cycle');assert.equal(cycles.length,1);assert.deepEqual(cycles[0].files,['src/lib/a.ts','src/lib/b.ts','src/lib/a.ts']);});
});
test('current authored sources have no static boundary violations or runtime import cycles',()=>{
 assert.deepEqual(inspectBoundaries(path.resolve(__dirname,'..')),[]);
});
