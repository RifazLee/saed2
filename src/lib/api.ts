const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/,'');

export type ApiReflection = {
 id?:string; h:number; k:number; l:number;
 d_angstrom:number; d_nanometer:number; inverse_d2:number;
 reflection_status:'Allowed'|'Forbidden'|'Requires SG verification';
 calculation_method?:string;
};

export type ApiMaterialVersion = {
 id:string; material_id:string; version_number:number;
 lattice_a:number; lattice_b:number; lattice_c:number;
 alpha:number; beta:number; gamma:number;
 calculation_method:string; validation_status:string;
 validation_notes?:string|null; created_at:string; validated_at?:string|null;
};

export type ApiReflectionSummary = { total:number; allowed:number; forbidden:number; requiresVerification:number };

export type ApiValidatedMaterial = {
 id:string; material_name:string; chemical_formula:string; phase:string; crystal_system:string;
 space_group_number:number; space_group_symbol:string; setting:string;
 validatedVersionId:string; versionNumber:number;
 lattice:{a:number;b:number;c:number;alpha:number;beta:number;gamma:number};
 lattice_a?:number; lattice_b?:number; lattice_c?:number; alpha?:number; beta?:number; gamma?:number;
 allowedReflectionCount:number;
 reflections:ApiReflection[];
};

export type ApiMaterial = {
 id:string; material_name:string; chemical_formula:string; phase:string; crystal_system:string;
 space_group_number:number; space_group_symbol:string; setting:string;
 lattice_json?:string|Record<string,number>; source?:string; doi?:string; description?:string; notes?:string;
 status:string; created_at:string; validated_at?:string|null;
 current_version_id?:string|null; validated_version_id?:string|null;
 allowed_count?:number;
 lattice_a?:number; lattice_b?:number; lattice_c?:number; alpha?:number; beta?:number; gamma?:number;
 version?:ApiMaterialVersion|null;
 reflections?:ApiReflection[];
 summary?:ApiReflectionSummary;
};

export type ApiEnvelope<T> = {success:boolean;data:T};
export type LoginResponse = {success:boolean;token:string;user:{id:string;email:string;role:string}};
export type ValidateResponse = ApiEnvelope<{id:string;status:string;validatedAt?:string}>;

export async function api<T>(path:string, options:RequestInit={}, token?:string|null):Promise<T>{
 const headers=new Headers(options.headers);
 if(options.body && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
 if(token)headers.set('Authorization',`Bearer ${token}`);
 const response=await fetch(`${API_BASE}/api${path}`,{...options,headers});
 const payload=await response.json().catch(()=>({message:'Invalid server response'}));
 if(!response.ok)throw new Error(payload.message||`Request failed (${response.status})`);
 return payload as T;
}

export function parseLatticeJson(m:ApiMaterial):{a:number;b:number;c:number;alpha:number;beta:number;gamma:number}{
 const raw=typeof m.lattice_json==='string'?JSON.parse(m.lattice_json):(m.lattice_json||{});
 return {a:Number(raw.a??m.lattice_a??0),b:Number(raw.b??m.lattice_b??0),c:Number(raw.c??m.lattice_c??0),alpha:Number(raw.alpha??m.alpha??0),beta:Number(raw.beta??m.beta??0),gamma:Number(raw.gamma??m.gamma??0)};
}

export function apiMaterialToRecord(m:ApiMaterial){
 const lattice=parseLatticeJson(m);
 return {id:m.id,name:m.material_name,formula:m.chemical_formula,phase:m.phase,description:m.description||'',source:m.source||'',doi:m.doi||'',notes:m.notes||'',system:m.crystal_system,lattice,sgNumber:m.space_group_number,sgSymbol:m.space_group_symbol,setting:m.setting||'Standard',allowedCount:Number(m.allowed_count??0),reflections:(m.reflections||[]).map(r=>({h:r.h,k:r.k,l:r.l,hkl:`(${r.h} ${r.k} ${r.l})`,dAngstrom:Number(r.d_angstrom),dNm:Number(r.d_nanometer),inverseD2:1/(Number(r.d_angstrom)**2),status:r.reflection_status==='Forbidden'?'Centering-forbidden':'Centering-compatible; SG check required'})),status:m.status,createdAt:m.created_at,validatedAt:m.validated_at||undefined};
}
