import {parse,serialize,defaultTreeAdapter,type DefaultTreeAdapterMap} from 'parse5';

/** Strip executable scripts from trusted Eta output using HTML5 parsing. */
export function scriptlessPreviewHtml(html:string):string {
 const document=parse(html);
 function visit(parent:DefaultTreeAdapterMap['parentNode']){
  for(const child of [...parent.childNodes]){
   if(defaultTreeAdapter.isElementNode(child)){
    const attribute=(name:string)=>child.attrs.find(attr=>attr.name===name)?.value;
    if(child.tagName==='script'||child.tagName==='link'&&(attribute('rel')==='manifest'||attribute('href')?.startsWith('/css/motion-transitions.css'))){defaultTreeAdapter.detachNode(child);continue;}
    if(child.tagName==='template')visit((child as DefaultTreeAdapterMap['template']).content);
    visit(child);
   }
  }
 }
 visit(document);return serialize(document);
}
