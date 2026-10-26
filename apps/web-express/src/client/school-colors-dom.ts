/** Browser-only application of the shared school presentation contract. */
namespace SfSchoolColors {
export function apply(element:HTMLElement,value:string){const p=tokens(value);element.dataset.schoolColors='';for(const [key,color] of Object.entries(p))element.style.setProperty('--school-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),color);}
}
