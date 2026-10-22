namespace SfMotion {
 factories.push(context=>{
  const records=new Map<HTMLElement,{original:Text;nodes:Node[]}[]>(),active=new Set<Animation>();
  const restore=(heading:HTMLElement)=>{for(const record of records.get(heading)||[]){const first=record.nodes[0];if(first?.parentNode){first.parentNode.insertBefore(record.original,first);record.nodes.forEach(node=>node.parentNode?.removeChild(node));}}records.delete(heading);};
  return {refresh(root){if(editing()||!Element.prototype.animate)return;for(const heading of elements(root,'[data-sf-split-text="words"]')){
   if(records.has(heading)||blocked(heading))continue;const tree=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT),texts:Text[]=[];let node:Node|null;
   while((node=tree.nextNode()))if(node.textContent?.trim()&&!node.parentElement?.closest('script,style,[aria-hidden="true"]'))texts.push(node as Text);
   const words:HTMLElement[]=[],originals:{original:Text;nodes:Node[]}[]=[];
   for(const text of texts){const fragment=document.createDocumentFragment(),nodes:Node[]=[];for(const part of text.data.split(/(\s+)/)){if(!part)continue;let child:Node;if(/^\s+$/.test(part))child=document.createTextNode(part);else{const span=document.createElement('span');span.dataset.sfWord='';span.dataset.sfGenerated='';span.textContent=part;words.push(span);child=span;}nodes.push(child);fragment.append(child);}text.replaceWith(fragment);originals.push({original:text,nodes});}
   records.set(heading,originals);if(context.seen.has(heading))continue;context.seen.add(heading);
   const interval=Math.min(config.stagger,(config.headline-config.word)/Math.max(1,words.length-1));
   words.forEach((word,index)=>{const frames:Keyframe[]=context.reduced.matches?[{opacity:.9},{opacity:1}]:[{opacity:.85,transform:`translateY(${config.mobileDistance}px)`},{opacity:1,transform:'translateY(0)'}];const animation=word.animate(frames,{duration:config.word,delay:index*interval,easing:config.ease});active.add(animation);animation.onfinish=animation.oncancel=()=>active.delete(animation);});
  }},remove(root){for(const heading of records.keys())if(root===heading||(root instanceof Node&&root.contains(heading)))restore(heading);},pause(value){if(value)active.forEach(animation=>animation.finish());},destroy(){active.forEach(animation=>animation.cancel());active.clear();for(const heading of records.keys())restore(heading);}};
 });
}
