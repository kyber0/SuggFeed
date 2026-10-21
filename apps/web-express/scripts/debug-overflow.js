// Paste this entire snippet into DevTools. Run sfDebugOverflow.clear() to undo outlines.
(() => {
 window.sfDebugOverflow?.clear();
 const marked=[];const width=document.documentElement.clientWidth;
 const rows=[...document.querySelectorAll('body *')].filter(element=>{
  if(!element.checkVisibility({checkVisibilityCSS:true})||element.closest('[hidden],[inert]'))return false;
  const bounds=element.getBoundingClientRect();
  return bounds.width>width+1||bounds.right>width+1||bounds.left< -1;
 }).map(element=>{
  const bounds=element.getBoundingClientRect();let scroller=null;
  for(let parent=element.parentElement;parent&&parent!==document.body;parent=parent.parentElement){if(/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowX)){scroller=parent;break;}}
  marked.push([element,element.style.outline,element.style.outlineOffset]);
  element.style.outline=scroller?'2px dashed orange':'2px solid red';element.style.outlineOffset='-2px';
  return {element,left:Math.round(bounds.left),right:Math.round(bounds.right),width:Math.round(bounds.width),containedBy:scroller||'PAGE OVERFLOW'};
 });
 console.table(rows);console.info('Viewport:',width,'Document:',document.documentElement.scrollWidth,'Red: uncontained. Orange: inspect the local scroller; wide table/canvas contents may be intentional.');
 window.sfDebugOverflow={clear(){for(const [element,outline,offset] of marked){element.style.outline=outline;element.style.outlineOffset=offset;}delete window.sfDebugOverflow;}};
})();
