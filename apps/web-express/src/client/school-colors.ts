/** Shared deterministic tokens for server rendering, the live school and the private editor. */
namespace SfSchoolColors {
 export const presets:Record<string,string>={navy:'#0b3857',forest:'#166534',purple:'#6b21a8',burgundy:'#9f1239',teal:'#115e59',indigo:'#3730a3'};
 const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const hex=(channels:number[])=>'#'+channels.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');
 const mix=(color:string,base:string,amount:number)=>hex(rgb(color).map((n,i)=>n*amount+rgb(base)[i]*(1-amount)));
 function luminance(color:string){return rgb(color).map(n=>{n/=255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);}
 export function resolve(value:string){return presets[value]||(/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():presets.navy);}
 function readable(color:string,background:string,toward:string){const base=luminance(background);for(let i=0;i<=20;i++){const candidate=mix(toward,color,i/20),l=luminance(candidate);if((Math.max(l,base)+.05)/(Math.min(l,base)+.05)>=4.5)return candidate;}return toward;}
 export function tokens(value:string){const accent=resolve(value);return {accent,onAccent:(luminance(accent)+.05)/.05>=4.5?'#000000':'#ffffff',softLight:mix(accent,'#ffffff',.1),softDark:mix(accent,'#111827',.2),textLight:readable(accent,'#ffffff','#000000'),textDark:readable(accent,'#111827','#ffffff')};}
 export function style(value:string){const p=tokens(value);return `--school-accent:${p.accent};--school-on-accent:${p.onAccent};--school-soft-light:${p.softLight};--school-soft-dark:${p.softDark};--school-text-light:${p.textLight};--school-text-dark:${p.textDark};`;}
 export function apply(element:HTMLElement,value:string){const p=tokens(value);element.dataset.schoolColors='';for(const [key,color] of Object.entries(p))element.style.setProperty('--school-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),color);}
}
declare var module:{exports:unknown}|undefined;
if(typeof module!=='undefined')module.exports=SfSchoolColors;
