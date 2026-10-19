(() => {
 const select=document.getElementById('school-preview-width') as HTMLSelectElement|null,theme=document.getElementById('school-preview-theme') as HTMLSelectElement|null,frame=document.getElementById('school-preview-frame') as HTMLIFrameElement|null;
 if(select&&frame)select.addEventListener('change',()=>{frame.style.width=select.value+'px';});
 if(theme&&frame)theme.addEventListener('change',()=>{const url=new URL(frame.src);url.searchParams.set('theme',theme.value);frame.src=url.href;});
})();
