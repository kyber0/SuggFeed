namespace SfMotion {
 export function staggerDelay(index:number):number{return index<5?Math.min(index*config.stagger,config.maxDelay):0;}
}
