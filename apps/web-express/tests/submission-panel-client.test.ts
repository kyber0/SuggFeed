import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function runtime(fail=false) {
 const listeners=new Map<string,Function[]>(),nodes=new Map<string,any>(),calls:any[]=[];
 class Element {
  value='';checked=true;hidden=false;disabled=false;textContent='';style:any={};parentElement=null;
  classList={add(){},remove(){},toggle(){}};
  dataset:any={};
  constructor(public id:string){}
  focus(){} setAttribute(){} addEventListener(){} getAttribute(key:string){return this.id==='submit-idea-form'&&key==='data-sf-submit'?'action-115':null;}
  dispatchEvent(event:Event){Object.defineProperty(event,'target',{value:this});if(event.bubbles)for(const listener of listeners.get(event.type)||[])listener(event);return !event.defaultPrevented;}
 }
 const node=(id:string)=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
 node('sip-title').value='Improve library seating';node('sip-description').value='Add comfortable seats in the school reading area.';
 const category=node('category');category.value='Facilities';
 const context:any={Event,Element,document:{getElementById:node,querySelector:(selector:string)=>selector.includes('sip-category')?category:node(selector),querySelectorAll:()=>[],addEventListener:(type:string,fn:Function)=>listeners.set(type,[...(listeners.get(type)||[]),fn])},sfToast:(...args:any[])=>calls.push(['toast',...args])};
 context.window=context;
 context.sfSubmissionRecovery={prepare:async()=>({key:'receipt',actor:'actor'}),request:async(...args:any[])=>{calls.push(['request',...args]);if(fail)throw Error('Backend unavailable');return {id:'idea',tracking_code:'CV-'+'A'.repeat(32)};},finish:async()=>calls.push(['finish']),failed:(error:Error)=>{node('sip-recovery-status').textContent=error.message;}};
 vm.createContext(context);
 for(const file of ['events','submit-panel'])vm.runInContext(readFileSync(path.resolve(__dirname,'../public/js/'+file+'.js'),'utf8'),context);
 return {context,node,calls};
}

test('final idea button reaches the delegated submit handler and displays the backend result',async()=>{
 const {context,node,calls}=runtime();
 context.sipNextStep();context.sipNextStep();context.sipNextStep();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.filter(call=>call[0]==='request').length,1);
 assert.equal(calls.find(call=>call[0]==='request')[1],'submit');
 assert.equal(node('sip-success').hidden,false);
 assert.equal(node('sip-success-code').textContent,'CV-'+'A'.repeat(32));
 assert.equal(node('sip-next-btn').disabled,false);
});

test('submission backend failure restores the button and retains the idea with visible feedback',async()=>{
 const {context,node,calls}=runtime(true);
 context.sipNextStep();context.sipNextStep();context.sipNextStep();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(node('sip-recovery-status').textContent,'Backend unavailable');
 assert.equal(node('sip-next-btn').disabled,false);
 assert.equal(node('sip-title').value,'Improve library seating');
 assert.equal(calls.some(call=>call[0]==='finish'),false);
});
