(() => {
 window.sfRecordShare=async(id:string)=>{
  try{
   const response=await fetch('/profile/shared/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error();
   if(!document.getElementById('sf-auth-config')?.dataset.user){const data=JSON.parse(localStorage.getItem('sf_shared_ideas') || '[]');const ids=Array.isArray(data)?data.filter(value=>typeof value==='string' && /^[a-f0-9-]{36}$/i.test(value)):[];localStorage.setItem('sf_shared_ideas',JSON.stringify([...new Set([...ids,id])].slice(-200)));}
  }catch{window.sfToast?.('Shared, but activity could not be recorded.','warning');}
 };
})();
