const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/,'');
export type ApiMaterial = {
 id:string; material_name:string; chemical_formula:string; phase:string; crystal_system:string;
 space_group_number:number; space_group_symbol:string; setting:string; lattice_json?:string|Record<string,number>; source?:string; doi?:string; description?:string; notes?:string;
 status:string; created_at:string; validated_at?:string|null;
 lattice_a?:number; lattice_b?:number; lattice_c?:number; alpha?:number; beta?:number; gamma?:number;
 reflections?:Array<{h:number;k:number;l:number;d_angstrom:number;d_nanometer:number;reflection_status?:string}>;
};
export async function api<T>(path:string, options:RequestInit={}, token?:string|null):Promise<T>{
 const headers=new Headers(options.headers);
 if(options.body && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
 if(token)headers.set('Authorization',`Bearer ${token}`);
 const response=await fetch(`${API_BASE}/api${path}`,{...options,headers});
 const payload=await response.json().catch(()=>({message:'Invalid server response'}));
 if(!response.ok)throw new Error(payload.message||`Request failed (${response.status})`);
 return payload as T;
}
export function apiMaterialToRecord(m:ApiMaterial){
 const lattice=typeof m.lattice_json==='string'?JSON.parse(m.lattice_json):(m.lattice_json||{a:m.lattice_a,b:m.lattice_b,c:m.lattice_c,alpha:m.alpha,beta:m.beta,gamma:m.gamma});
 return {id:m.id,name:m.material_name,formula:m.chemical_formula,phase:m.phase,description:m.description||'',source:m.source||'',doi:m.doi||'',notes:m.notes||'',system:m.crystal_system,lattice,sgNumber:m.space_group_number,sgSymbol:m.space_group_symbol,setting:m.setting||'Standard',reflections:(m.reflections||[]).map(r=>({h:r.h,k:r.k,l:r.l,hkl:`(${r.h} ${r.k} ${r.l})`,dAngstrom:Number(r.d_angstrom),dNm:Number(r.d_nanometer),inverseD2:1/(Number(r.d_angstrom)**2),status:r.reflection_status==='Forbidden'?'Centering-forbidden':'Centering-compatible; SG check required'})),status:m.status,createdAt:m.created_at,validatedAt:m.validated_at||undefined};
}
