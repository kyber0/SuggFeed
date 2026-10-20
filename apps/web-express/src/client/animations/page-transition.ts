namespace SfMotion {
 export function transitionEligible(href:string,origin:string):boolean {
  try{const url=new URL(href,origin),path=url.pathname.replace(/^\/s\/[^/]+(?=\/|$)/,'')||'/';return url.origin===origin&&/^https?:$/.test(url.protocol)&&!/^\/(auth|api|digest|account\/security|staff-login|staff\/workspace)(\/|$)/.test(path)&&!path.includes('/customization');}catch{return false;}
 }
 factories.push(context=>{
  let pending=false;
  const eligible=()=>!context.reduced.matches&&!editing()&&transitionEligible(location.href,location.origin);
  document.documentElement.toggleAttribute('data-sf-transitions',eligible());
  context.on(document,'click',event=>{const click=event as MouseEvent;const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;pending=false;if(!link||click.button!==0||click.metaKey||click.ctrlKey||click.shiftKey||click.altKey||link.download||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;queueMicrotask(()=>{pending=!event.defaultPrevented&&transitionEligible(link.href,location.origin);});});
  context.on(document,'submit',event=>{const form=event.target as HTMLFormElement,submitter=(event as SubmitEvent).submitter as HTMLButtonElement|null;queueMicrotask(()=>{pending=!event.defaultPrevented&&(submitter?.formMethod||form.method).toLowerCase()==='get'&&transitionEligible(submitter?.formAction||form.action,location.origin);});});
  context.on(window,'pageswap',event=>{const swap=event as Event&{viewTransition?:{skipTransition():void};activation?:{navigationType?:string;entry?:{url?:string}}};if(!eligible()||(!pending&&swap.activation?.navigationType!=='traverse')||!transitionEligible(swap.activation?.entry?.url||'',location.origin))swap.viewTransition?.skipTransition();pending=false;});
  context.on(window,'pagereveal',event=>{if(!eligible())(event as Event&{viewTransition?:{skipTransition():void}}).viewTransition?.skipTransition();});
  return {destroy(){document.documentElement.removeAttribute('data-sf-transitions');}};
 });
}
