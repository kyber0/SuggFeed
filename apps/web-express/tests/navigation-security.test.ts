import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
test('section picker changes only known panel hashes, never a URL copied from DOM text',async()=>{
 const {JSDOM,VirtualConsole}=require('jsdom');const errors:Error[]=[];const console=new VirtualConsole();console.on('jsdomError',(error:Error)=>errors.push(error));
 const dom=new JSDOM('<main data-workspace-sections><aside class="school-settings-sidebar"><nav><a href="#one">One</a><a href="#two">Two</a><a href="https://attacker.invalid/">Untrusted link</a></nav></aside><section id="one" data-workspace-panel></section><section id="two" data-workspace-panel></section></main>',{url:'https://school.invalid/',runScripts:'outside-only',virtualConsole:console});
 try{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/client/navigation.ts'),'utf8');dom.window.eval(ts.transpile(source,{target:ts.ScriptTarget.ES2020}));
  const picker=dom.window.document.querySelector('select');assert.ok(picker);
  picker.value='#two';picker.dispatchEvent(new dom.window.Event('change'));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(dom.window.location.hash,'#two');
  picker.value='https://attacker.invalid/';picker.dispatchEvent(new dom.window.Event('change'));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(dom.window.location.hash,'#two');assert.equal(errors.length,0);
 }finally{dom.window.close();}
});
