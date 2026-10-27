import {parse,defaultTreeAdapter,type DefaultTreeAdapterMap} from 'parse5';
export function htmlElements(html:string):DefaultTreeAdapterMap['element'][] {
 const found:DefaultTreeAdapterMap['element'][]=[];
 function visit(parent:DefaultTreeAdapterMap['parentNode']){for(const child of parent.childNodes)if(defaultTreeAdapter.isElementNode(child)){found.push(child);if(child.tagName==='template')visit((child as DefaultTreeAdapterMap['template']).content);visit(child);}}
 visit(parse(html));return found;
}
