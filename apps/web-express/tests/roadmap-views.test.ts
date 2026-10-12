import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function harness(){
  const documentHandlers=new Map<string,Function>(),handlers=new Map<string,Function>();
  let focused:any;
  const trigger={focus(){focused=trigger;}},links=[0,1,2].map(index=>({index,focus(){focused=this;}}));
  const disclosure={open:false,contains:(node:any)=>node===trigger || links.includes(node),querySelector:()=>trigger,querySelectorAll:()=>links,addEventListener:(name:string,fn:Function)=>handlers.set(name,fn)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/roadmap-views.js'),'utf8'),{document:{querySelector:()=>disclosure,addEventListener:(name:string,fn:Function)=>documentHandlers.set(name,fn)}});
  const key=(target:any,value:string)=>{const event={target,key:value,preventDefault(){},stopPropagation(){}};handlers.get('keydown')!(event);};
  return {trigger,links,disclosure,key,documentHandlers,get focused(){return focused;}};
}
test('Other views supports arrow navigation, Home/End and Escape with focus restoration',()=>{
  const h=harness();h.key(h.trigger,'ArrowDown');assert.equal(h.disclosure.open,true);assert.equal(h.focused,h.links[0]);
  h.key(h.links[0],'ArrowUp');assert.equal(h.focused,h.links[2]);
  h.key(h.links[2],'Home');assert.equal(h.focused,h.links[0]);
  h.key(h.links[0],'End');assert.equal(h.focused,h.links[2]);
  h.key(h.links[2],'Escape');assert.equal(h.disclosure.open,false);assert.equal(h.focused,h.trigger);
});
test('Other views closes on outside clicks and focus, without closing for its own links',()=>{
  const h=harness();h.disclosure.open=true;h.documentHandlers.get('click')!({target:h.links[1]});assert.equal(h.disclosure.open,true);
  h.documentHandlers.get('click')!({target:{}});assert.equal(h.disclosure.open,false);
  h.disclosure.open=true;h.documentHandlers.get('focusin')!({target:{}});assert.equal(h.disclosure.open,false);
});
