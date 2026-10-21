export interface SchoolDesign {
 light:Record<string,string>;dark:Record<string,string>;corners:'square'|'rounded'|'soft';font:'brand'|'inter'|'system';
 pages:Record<string,{layout:'default'|'wide'|'focused';spacing:'compact'|'comfortable'|'airy';cards:'outlined'|'soft'|'flat';view?:'board'|'tree'|'timeline'|'done';hidden:string[];order:string[];sections?:Record<string,{spacing:'inherit'|'compact'|'comfortable'|'airy';surface:'inherit'|'card'|'raised'|'transparent';alignment:'inherit'|'start'|'center'}>}>;
}
// The generated browser helper shares normalization and contrast rules with server rendering.
export const schoolDesign:{normalize(value:unknown,palette?:string):SchoolDesign;style(value:SchoolDesign):string;cursorStyle(value?:SchoolDesign):string;page(path:string):string}=require('../../public/js/school-design');
