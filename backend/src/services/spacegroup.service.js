export async function validateSpaceGroup({spaceGroupNumber,spaceGroupSymbol,setting,reflections}) {
 const base=process.env.SPGLIB_URL;
 if(!base) return {available:false,reason:'SPGLIB_URL is not configured'};
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(`${base.replace(/\/$/,'')}/systematic-absences`,{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({space_group_number:spaceGroupNumber,space_group_symbol:spaceGroupSymbol,setting,reflections:reflections.map(r=>({h:r.h,k:r.k,l:r.l}))}),
   signal:controller.signal
  });
  if(!response.ok)throw new Error(`spglib service returned ${response.status}`);
  const result=await response.json();
  return {available:true,spaceGroup:result.space_group,reflections:result.reflections};
 }catch(e){return {available:false,reason:e.name==='AbortError'?'spglib service timeout':e.message};}
 finally{clearTimeout(timer);}
}
