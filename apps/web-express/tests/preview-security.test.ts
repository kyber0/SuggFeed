import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse,defaultTreeAdapter,type DefaultTreeAdapterMap} from 'parse5';
import {scriptlessPreviewHtml} from '../src/lib/preview-html';
import {renderSchoolPreview} from '../src/routes/school-customization-preview';
import {customizationDefaults} from '../src/lib/school-customization';
function tags(html:string){const found:string[]=[];function visit(parent:DefaultTreeAdapterMap['parentNode']){for(const child of parent.childNodes)if(defaultTreeAdapter.isElementNode(child)){found.push(child.tagName);if(child.tagName==='template')visit((child as DefaultTreeAdapterMap['template']).content);visit(child);}}visit(parse(html));return found;}
test('preview script removal handles HTML5 script syntax and template/SVG descendants',()=>{
 for(const script of ['<SCRIPT>alert(1)</SCRIPT>','<script/x>alert(1)</script\t\n bar>','<svg><script>alert(1)</script></svg>','<template><script>alert(1)</script></template>']){
  const html=scriptlessPreviewHtml('<!doctype html><html><head><link rel="manifest" href="/manifest.json"></head><body><p>&lt;script&gt;literal text</p>'+script+'</body></html>');
  assert.equal(tags(html).includes('script'),false);assert.ok(html.includes('&lt;script&gt;literal text'));assert.ok(!html.includes('manifest.json'));
 }
});
test('shared preview renderer rejects invalid page/theme input including the local fixture route',()=>{
 const input={school:{id:'00000000-0000-4000-8000-000000000001',slug:'demo',name:'Fictional school'},configuration:customizationDefaults([]),page:'home',scenario:'populated',theme:'light'};
 assert.throws(()=>renderSchoolPreview({...input,theme:'"><img src=x onerror=alert(1)>'},'/fixture','example'));
 assert.throws(()=>renderSchoolPreview({...input,page:'../../privacy'},'/fixture','example'));
 const html=renderSchoolPreview(input,'/fixture','example');assert.ok(html.includes('/js/vendor/dompurify.js'));assert.ok(html.includes('/js/school-studio-frame.js'));
});
test('DOMPurify removes executable preview markup and retains controls, styles, data and SVG icons',()=>{
 const {JSDOM}=require('jsdom');const createDOMPurify=require('dompurify');const dom=new JSDOM('');
 try{
  const clean=createDOMPurify(dom.window).sanitize('<html><head><link rel="stylesheet" href="/css/base.css"></head><body><img src=x onerror="window.pwned=1"><iframe srcdoc="<script>bad()</script>"></iframe><a href="javascript:bad()">link</a><button id="submit" data-studio-component="hero" style="color:blue">Safe</button><svg viewBox="0 0 24 24"><use href="#sf-icon"></use></svg></body></html>',{WHOLE_DOCUMENT:true,ADD_TAGS:['link','use'],FORBID_TAGS:['script','iframe','object','embed','base','meta'],FORBID_ATTR:['srcdoc']});
  const document=new dom.window.DOMParser().parseFromString(clean,'text/html');
  assert.equal(document.querySelector('[onerror],iframe,script,[srcdoc]'),null);assert.equal(document.querySelector('a').hasAttribute('href'),false);
  assert.equal(document.querySelector('button').dataset.studioComponent,'hero');assert.equal(document.querySelector('button').style.color,'blue');assert.ok(document.querySelector('link[rel="stylesheet"]'));assert.ok(document.querySelector('svg use[href="#sf-icon"]'));
 }finally{dom.window.close();}
});
