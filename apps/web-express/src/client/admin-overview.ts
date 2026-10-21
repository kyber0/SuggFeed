(() => {
 const panel=document.querySelector<HTMLElement>('[data-overview-root]');
 if(!panel)return;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let entered=false;
 const reveal=()=>{
  if(panel.hidden||entered)return;
  entered=true;
  if(reduced.matches)return;
  for(const [index,item] of [...panel.querySelectorAll<HTMLElement>('[data-overview-entrance]')].entries())if(typeof item.animate==='function')item.animate([{opacity:.55,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:400,delay:Math.min(index*35,160),easing:'cubic-bezier(.22,1,.36,1)'});
 };
 reveal();window.addEventListener('hashchange',reveal);
 const source=document.getElementById('overview-chart-data');
 if(!source)return;
 type Point={fullDate:string;date:string;submissions:number;votes?:number};
 type Metric='submissions'|'votes';
 let data:{timeline:Point[];totals:Record<Metric,number>;period:string;includeSupport?:boolean};
 try{data=JSON.parse(source.textContent||'');}catch{return;}
 const slider=panel.querySelector<HTMLInputElement>('[data-overview-day]');
 const readout=panel.querySelector<HTMLOutputElement>('[data-overview-readout]');
 const chart=panel.querySelector<HTMLElement>('[data-overview-chart]');
 if(!slider||!readout||!chart||!data.timeline.length)return;
 const guide=panel.querySelector<SVGLineElement>('[data-overview-guide]');
 const dot=panel.querySelector<SVGCircleElement>('[data-overview-dot]');
 const total=panel.querySelector<HTMLElement>('[data-overview-chart-total]');
 const caption=panel.querySelector<HTMLElement>('[data-overview-chart-caption]');
 const title=panel.querySelector<SVGTitleElement>('#overview-graph-label');
 let metric:Metric='submissions';
 const selectDay=(index:number)=>{
  const point=data.timeline[index];if(!point)return;
  slider.value=String(index);
  const description=point.fullDate+' · '+point.submissions+' ideas'+(data.includeSupport===false?'':' · '+(point.votes||0)+' current support votes');
  readout.textContent=description;slider.setAttribute('aria-valuetext',description);
  const ceiling=Math.max(1,...data.timeline.map(day=>Number(day[metric])||0));
  const x=32+(data.timeline.length>1?index/(data.timeline.length-1):0)*736,y=196-(Number(point[metric])||0)/ceiling*160;
  guide?.removeAttribute('hidden');guide?.setAttribute('x1',String(x));guide?.setAttribute('x2',String(x));
  dot?.removeAttribute('hidden');dot?.setAttribute('cx',String(x));dot?.setAttribute('cy',String(y));
 };
 for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-overview-metric]'))button.addEventListener('click',()=>{
  metric=button.dataset.overviewMetric==='votes'?'votes':'submissions';
  for(const control of panel.querySelectorAll<HTMLElement>('[data-overview-metric]'))control.setAttribute('aria-pressed',String(control.dataset.overviewMetric===metric));
  for(const series of panel.querySelectorAll<SVGElement>('[data-overview-series]')){
   if(series.dataset.overviewSeries===metric)series.removeAttribute('hidden');else series.setAttribute('hidden','');
  }
  if(total)total.textContent=data.totals[metric].toLocaleString('en-PH');
  if(caption)caption.textContent=metric==='votes'?'current support votes':'ideas received';
  if(title)title.textContent=(metric==='votes'?'Current support votes grouped by idea submission date':'Daily idea submissions')+' over the last '+data.period+' days. Exact daily values are available below.';
  selectDay(Number(slider.value));
 });
 slider.addEventListener('input',()=>selectDay(Number(slider.value)));
 let bounds:DOMRect|undefined;
 chart.addEventListener('pointerenter',()=>{bounds=chart.getBoundingClientRect();});
 const explore=(event:PointerEvent)=>{
  if(!bounds||!bounds.width)return;
  const fraction=((event.clientX-bounds.left)/bounds.width*800-32)/736;
  selectDay(Math.max(0,Math.min(data.timeline.length-1,Math.round(fraction*(data.timeline.length-1)))));
 };
 chart.addEventListener('pointermove',event=>{if(event.pointerType==='mouse')explore(event);});
 chart.addEventListener('pointerdown',event=>{bounds=chart.getBoundingClientRect();explore(event);});
 window.addEventListener('resize',()=>{bounds=undefined;},{passive:true});
 for(const item of panel.querySelectorAll<HTMLElement>('[data-overview-interactive]'))item.hidden=false;
 selectDay(data.timeline.length-1);
})();
