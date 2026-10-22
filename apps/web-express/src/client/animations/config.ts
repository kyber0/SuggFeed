namespace SfMotion {
 export const config=Object.freeze({interaction:200,page:240,story:600,storyOverlap:140,reveal:400,word:400,headline:720,stagger:40,maxDelay:160,scroll:650,distance:12,mobileDistance:6,magnet:4,marqueeSpeed:24,ease:'cubic-bezier(.22,1,.36,1)',threshold:.08});
 export interface Effect {refresh?(root:ParentNode):void;remove?(root:ParentNode):void;pause?(paused:boolean):void;destroy():void;}
 export interface Context {signal:AbortSignal;reduced:MediaQueryList;fine:MediaQueryList;seen:WeakSet<Element>;on(target:EventTarget,type:string,listener:(event:Event)=>void,options?:AddEventListenerOptions):void;}
 export const factories:Array<(context:Context)=>Effect>=[];
 export function elements(root:ParentNode,selector:string):HTMLElement[]{const found=[...root.querySelectorAll<HTMLElement>(selector)];if(root instanceof HTMLElement&&root.matches(selector))found.unshift(root);return found;}
 export function editing():boolean{return document.body.classList.contains('studio-host')||document.documentElement.dataset.studioMode==='edit';}
 export function saveData():boolean{return Boolean((navigator as Navigator&{connection?:{saveData?:boolean}}).connection?.saveData);}
 export function blocked(el:Element):boolean{return editing()||Boolean(el.closest('[data-sf-motion="off"],.studio-overlay,.studio-frame-outline,.studio-frame-label,.studio-frame-banner,.studio-canvas,.is-dragging,[data-dragging="true"],dialog,[role="dialog"],table,textarea,[data-lenis-prevent]'));}
}
interface Window {sfMotion?:{mount(root?:Document):void;refresh(root?:ParentNode):void;destroy():void;};Lenis?:new(options:Record<string,unknown>)=>{raf(time:number):void;destroy():void;stop():void;start():void;resize():void;isScrolling:boolean|string;};}
