import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

test('account menu supports Escape, focus return and leaving the disclosure by keyboard',()=>{
  const documentEvents=new Map<string,Function>(),buttonEvents=new Map<string,Function>(),menuEvents=new Map<string,Function>();
  const internal={},outside={};let focused=false,expanded='false';
  const button={addEventListener:(name:string,fn:Function)=>buttonEvents.set(name,fn),setAttribute:(_name:string,value:string)=>{expanded=value;},focus:()=>{focused=true;}};
  const menu={hidden:true,contains:(target:unknown)=>target===internal,addEventListener:(name:string,fn:Function)=>menuEvents.set(name,fn)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/header.js'),'utf8'),{document:{getElementById:(name:string)=>name==='header-avatar-btn'?button:menu,addEventListener:(name:string,fn:Function)=>documentEvents.set(name,fn)}});
  buttonEvents.get('click')!({stopPropagation(){}});assert.equal(menu.hidden,false);assert.equal(expanded,'true');
  documentEvents.get('click')!({target:internal});assert.equal(menu.hidden,false);
  documentEvents.get('keydown')!({key:'Escape'});assert.equal(menu.hidden,true);assert.equal(expanded,'false');assert.equal(focused,true);
  buttonEvents.get('click')!({stopPropagation(){}});menuEvents.get('focusout')!({relatedTarget:outside});assert.equal(menu.hidden,true);
});
