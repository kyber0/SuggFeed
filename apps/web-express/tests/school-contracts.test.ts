import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {schoolColors} from '../src/lib/school-colors';
import {schoolDesign} from '../src/lib/school-design';

test('school rendering retains characterized color and design output in server and browser',()=>{
 const context:any={};
 for(const name of ['school-colors','school-design'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/'+name+'.js'),'utf8'),context);
 for(const expected of JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/school-contracts.json'),'utf8'))){
  for(const [colors,design] of [[schoolColors,schoolDesign],[context.SfSchoolColors,context.SfSchoolDesign]]){
   assert.equal(colors.style(expected.palette),expected.colorStyle);
   assert.equal(JSON.stringify(colors.tokens(expected.palette)),JSON.stringify(expected.tokens));
   const value=design.normalize(expected.design,expected.palette);
   assert.equal(JSON.stringify(value),JSON.stringify(expected.design));
   assert.equal(design.style(value),expected.style);assert.equal(design.cursorStyle(value),expected.cursorStyle);
   assert.throws(()=>design.normalize({...expected.design,unsafe:true}));
  }
 }
});

test('server presentation helpers load without generated browser artifacts',async()=>{
 const {spawnSync}=await import('node:child_process');
 const script=`const Module=require('node:module');const load=Module._load;Module._load=function(request){if(String(request).includes('public/js'))throw new Error('Server accessed browser output');return load.apply(this,arguments);};const colors=require('./src/lib/school-colors').schoolColors;const design=require('./src/lib/school-design').schoolDesign;if(!colors.style('navy')||!design.style(design.defaults()))process.exit(1);`;
 const result=spawnSync(process.execPath,['-r','ts-node/register/transpile-only','-e',script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
