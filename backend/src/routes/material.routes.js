import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool} from '../config/db.js';
import {requireAuth,optionalAuth} from '../middleware/auth.js';
import {httpError} from '../middleware/errors.js';
import {validateCell,generateCandidates} from '../services/crystallography.service.js';
import {validateSpaceGroup} from '../services/spacegroup.service.js';
const router=Router();
const schema=z.object({
 materialName:z.string().min(1).max(180),chemicalFormula:z.string().min(1).max(100),phase:z.string().min(1).max(180),
 description:z.string().max(2000).optional().default(''),source:z.string().min(1).max(1000),doi:z.string().max(500).optional().default(''),
 notes:z.string().max(4000).optional().default(''),crystalSystem:z.enum(['Cubic','Tetragonal','Orthorhombic','Hexagonal','Trigonal / Rhombohedral','Monoclinic','Triclinic']),
 spaceGroupNumber:z.number().int().min(1).max(230),spaceGroupSymbol:z.string().min(1).max(80),setting:z.string().max(80).optional().default('Standard'),
 lattice:z.object({a:z.number().positive(),b:z.number().positive(),c:z.number().positive(),alpha:z.number().positive().lt(180),beta:z.number().positive().lt(180),gamma:z.number().positive().lt(180)})
});
const parseId=z.string().uuid();
const idParam=req=>{const v=parseId.safeParse(req.params.id);if(!v.success)throw httpError('Invalid material id');return v.data;};
async function getMaterial(conn,id,lock=false){
 const [rows]=await conn.execute(`SELECT * FROM materials WHERE id=? ${lock?'FOR UPDATE':''}`,[id]);
 if(!rows.length)throw httpError('Material not found',404);return rows[0];
}
router.get('/',optionalAuth,async(req,res,next)=>{
 try{
  const status=req.query.status;
  const where=status? 'WHERE status=?':'';
  const [rows]=await pool.execute(`SELECT id,material_name,chemical_formula,phase,description,source,doi,notes,crystal_system,space_group_number,space_group_symbol,setting,lattice_json,status,created_at,validated_at FROM materials ${where} ORDER BY created_at DESC`,status?[status]:[]);
  res.json({success:true,data:rows});
 }catch(e){next(e);}
});
router.get('/validated',async(_req,res,next)=>{
 try{
  const [rows]=await pool.execute(`SELECT m.id,m.material_name,m.chemical_formula,m.phase,m.crystal_system,m.space_group_number,m.space_group_symbol,m.setting,mv.version_number,mv.lattice_a,mv.lattice_b,mv.lattice_c,mv.alpha,mv.beta,mv.gamma FROM materials m JOIN material_versions mv ON mv.id=m.validated_version_id WHERE m.validated_version_id IS NOT NULL AND mv.validation_status='Validated' ORDER BY m.material_name`);
  const data=[];
  for(const m of rows){
   const [refs]=await pool.execute(`SELECT h,k,l,d_angstrom,d_nanometer FROM hkl_reflections WHERE material_version_id=? AND reflection_status='Allowed' ORDER BY d_angstrom DESC`,[m.current_version_id]);
   data.push({...m,reflections:refs});
  }
  res.json({success:true,data});
 }catch(e){next(e);}
});
router.post('/',requireAuth,async(req,res,next)=>{
 const conn=await pool.getConnection();
 try{
  const input=schema.parse(req.body);
  const errors=validateCell(input.crystalSystem,input.lattice);if(errors.length)throw httpError(errors.join(' '));
  const sgRange=input.spaceGroupNumber<=2?'Triclinic':input.spaceGroupNumber<=15?'Monoclinic':input.spaceGroupNumber<=74?'Orthorhombic':input.spaceGroupNumber<=142?'Tetragonal':input.spaceGroupNumber<=167?'Trigonal / Rhombohedral':input.spaceGroupNumber<=194?'Hexagonal':'Cubic';
  if(input.crystalSystem!==sgRange)throw httpError(`Space group ${input.spaceGroupNumber} belongs to ${sgRange}, not ${input.crystalSystem}.`);
  const id=randomUUID();
  await conn.beginTransaction();
  await conn.execute(`INSERT INTO materials(id,material_name,chemical_formula,phase,description,source,doi,notes,crystal_system,space_group_number,space_group_symbol,setting,lattice_json,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?, 'Draft',?)`,
   [id,input.materialName,input.chemicalFormula,input.phase,input.description,input.source,input.doi,input.notes,input.crystalSystem,input.spaceGroupNumber,input.spaceGroupSymbol,input.setting,JSON.stringify(input.lattice),req.user.sub]);
  await conn.commit();res.status(201).json({success:true,data:{id,status:'Draft'}});
 }catch(e){await conn.rollback();next(e);}finally{conn.release();}
});
router.put('/:id',requireAuth,async(req,res,next)=>{
 const conn=await pool.getConnection();
 try{
  const id=idParam(req);const input=schema.parse(req.body);const errors=validateCell(input.crystalSystem,input.lattice);if(errors.length)throw httpError(errors.join(' '));
  const sgRange=input.spaceGroupNumber<=2?'Triclinic':input.spaceGroupNumber<=15?'Monoclinic':input.spaceGroupNumber<=74?'Orthorhombic':input.spaceGroupNumber<=142?'Tetragonal':input.spaceGroupNumber<=167?'Trigonal / Rhombohedral':input.spaceGroupNumber<=194?'Hexagonal':'Cubic';
  if(input.crystalSystem!==sgRange)throw httpError(`Space group ${input.spaceGroupNumber} belongs to ${sgRange}, not ${input.crystalSystem}.`);
  await conn.beginTransaction();const m=await getMaterial(conn,id,true);
  if(m.status==='Validated')throw httpError('Validated material is immutable; create a new material revision.',409);
  await conn.execute(`UPDATE materials SET material_name=?,chemical_formula=?,phase=?,description=?,source=?,doi=?,notes=?,crystal_system=?,space_group_number=?,space_group_symbol=?,setting=?,lattice_json=?,status='Draft',current_version_id=NULL,updated_at=NOW() WHERE id=?`,
   [input.materialName,input.chemicalFormula,input.phase,input.description,input.source,input.doi,input.notes,input.crystalSystem,input.spaceGroupNumber,input.spaceGroupSymbol,input.setting,JSON.stringify(input.lattice),id]);
  await conn.commit();res.json({success:true,data:{id,status:'Draft'}});
 }catch(e){await conn.rollback();next(e);}finally{conn.release();}
});
router.post('/:id/revisions',requireAuth,async(req,res,next)=>{
 const conn=await pool.getConnection();
 try{
  const id=idParam(req);const input=schema.parse(req.body);const errors=validateCell(input.crystalSystem,input.lattice);if(errors.length)throw httpError(errors.join(' '));
  const sgRange=input.spaceGroupNumber<=2?'Triclinic':input.spaceGroupNumber<=15?'Monoclinic':input.spaceGroupNumber<=74?'Orthorhombic':input.spaceGroupNumber<=142?'Tetragonal':input.spaceGroupNumber<=167?'Trigonal / Rhombohedral':input.spaceGroupNumber<=194?'Hexagonal':'Cubic';
  if(input.crystalSystem!==sgRange)throw httpError(`Space group ${input.spaceGroupNumber} belongs to ${sgRange}, not ${input.crystalSystem}.`);
  await conn.beginTransaction();const m=await getMaterial(conn,id,true);
  if(!m.validated_version_id)throw httpError('Use normal material update for an unvalidated draft.',409);
  await conn.execute(`UPDATE materials SET material_name=?,chemical_formula=?,phase=?,description=?,source=?,doi=?,notes=?,crystal_system=?,space_group_number=?,space_group_symbol=?,setting=?,lattice_json=?,status='Draft',current_version_id=NULL,updated_at=NOW() WHERE id=?`,
   [input.materialName,input.chemicalFormula,input.phase,input.description,input.source,input.doi,input.notes,input.crystalSystem,input.spaceGroupNumber,input.spaceGroupSymbol,input.setting,JSON.stringify(input.lattice),id]);
  await conn.commit();res.json({success:true,data:{id,status:'Draft',previousValidatedVersionPreserved:true}});
 }catch(e){await conn.rollback();next(e);}finally{conn.release();}
});
router.post('/:id/calculate',requireAuth,async(req,res,next)=>{
 const conn=await pool.getConnection();
 try{
  const id=idParam(req);const limits=z.object({maxH:z.number().int().min(0).max(30),maxK:z.number().int().min(0).max(30),maxL:z.number().int().min(0).max(30),minD:z.number().positive(),maxD:z.number().positive().optional()}).parse(req.body);
  await conn.beginTransaction();const m=await getMaterial(conn,id,true);
  if(m.status==='Validated')throw httpError('Validated material cannot be recalculated in place. Create a new revision.');
  const [vrows]=await conn.execute('SELECT COALESCE(MAX(version_number),0)+1 AS next FROM material_versions WHERE material_id=?',[id]);
  const version=vrows[0].next;
  const cell=typeof m.lattice_json==='string'?JSON.parse(m.lattice_json):m.lattice_json;
  const candidates=generateCandidates(cell,limits);
  if(candidates.length>50000)throw httpError('Generated reflection count exceeds 50,000. Reduce HKL limits or narrow the d-spacing range.',413);
  const sg=await validateSpaceGroup({spaceGroupNumber:m.space_group_number,spaceGroupSymbol:m.space_group_symbol,setting:m.setting,reflections:candidates});
  const versionId=randomUUID();
  await conn.execute(`INSERT INTO material_versions(id,material_id,version_number,lattice_a,lattice_b,lattice_c,alpha,beta,gamma,calculation_method,validation_status,calculation_parameters_json,created_by) VALUES(?,?,?,?,?,?,?,?,?,'metric-tensor+spglib','Pending Validation',?,?)`,
   [versionId,id,version,cell.a,cell.b,cell.c,cell.alpha,cell.beta,cell.gamma,JSON.stringify({...limits,spglibAvailable:sg.available}),req.user.sub]);
  const byKey=new Map((sg.reflections||[]).map(r=>[`${r.h},${r.k},${r.l}`,r]));
  for(const r of candidates){
   const verdict=byKey.get(`${r.h},${r.k},${r.l}`);
   const status=!sg.available?'Requires SG verification':verdict?.allowed?'Allowed':'Forbidden';
   await conn.execute(`INSERT INTO hkl_reflections(id,material_version_id,h,k,l,d_angstrom,d_nanometer,inverse_d2,reflection_status,calculation_method) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [randomUUID(),versionId,r.h,r.k,r.l,r.dAngstrom,r.dNanometer,r.inverseD2,status,sg.available?'spglib':'metric-only']);
  }
  await conn.execute(`UPDATE materials SET current_version_id=?,status='Pending Validation',updated_at=NOW() WHERE id=?`,[versionId,id]);
  await conn.commit();
  res.json({success:true,data:{versionId,version,spglibAvailable:sg.available,spglibReason:sg.reason||null,totalCandidates:candidates.length,allowed:sg.available?sg.reflections.filter(r=>r.allowed).length:0,forbidden:sg.available?sg.reflections.filter(r=>!r.allowed).length:0,reflections:candidates.map(r=>({...r,status:byKey.get(`${r.h},${r.k},${r.l}`)?.allowed?'Allowed':sg.available?'Forbidden':'Requires SG verification'}))}});
 }catch(e){await conn.rollback();next(e);}finally{conn.release();}
});
router.post('/:id/validate',requireAuth,async(req,res,next)=>{
 const conn=await pool.getConnection();
 try{
  const id=idParam(req);await conn.beginTransaction();const m=await getMaterial(conn,id,true);
  if(m.status!=='Pending Validation'||!m.current_version_id)throw httpError('Material must be calculated before validation.');
  const [v]=await conn.execute('SELECT * FROM material_versions WHERE id=? AND material_id=? FOR UPDATE',[m.current_version_id,id]);
  if(!v.length)throw httpError('Current material version not found',409);
  const [unknown]=await conn.execute(`SELECT COUNT(*) AS n FROM hkl_reflections WHERE material_version_id=? AND reflection_status='Requires SG verification'`,[v[0].id]);
  const [allowedCount]=await conn.execute(`SELECT COUNT(*) AS n FROM hkl_reflections WHERE material_version_id=? AND reflection_status='Allowed'`,[v[0].id]);
  if(allowedCount[0].n===0)throw httpError('No allowed reflections were generated; adjust HKL limits or review the space group.',409);
  if(unknown[0].n>0)throw httpError('Space-group verification unavailable. Configure and verify spglib service before validating this material.',409);
  const notes=String(req.body?.validationNotes||'').slice(0,4000);
  await conn.execute(`UPDATE material_versions SET validation_status='Validated',validated_at=NOW(),validated_by=?,validation_notes=? WHERE id=?`,[req.user.sub,notes,v[0].id]);
  await conn.execute(`UPDATE materials SET status='Validated',validated_version_id=?,validated_at=NOW(),validated_by=?,updated_at=NOW() WHERE id=?`,[v[0].id,req.user.sub,id]);
  await conn.execute(`INSERT INTO material_validation_audit(id,material_id,material_version_id,operator_id,validation_status,validation_notes) VALUES(?,?,?,?, 'Validated',?)`,[randomUUID(),id,v[0].id,req.user.sub,notes]);
  await conn.commit();res.json({success:true,data:{id,status:'Validated',validatedAt:new Date().toISOString()}});
 }catch(e){await conn.rollback();next(e);}finally{conn.release();}
});
router.get('/:id',async(req,res,next)=>{
 try{
  const id=idParam(req);const [rows]=await pool.execute('SELECT * FROM materials WHERE id=?',[id]);if(!rows.length)throw httpError('Material not found',404);
  const m=rows[0];let version=null,reflections=[];
  if(m.current_version_id){const [v]=await pool.execute('SELECT * FROM material_versions WHERE id=?',[m.current_version_id]);version=v[0]||null;[reflections]=await pool.execute('SELECT * FROM hkl_reflections WHERE material_version_id=? ORDER BY d_angstrom DESC',[m.current_version_id]);}
  res.json({success:true,data:{...m,version,reflections}});
 }catch(e){next(e);}
});
router.get('/:id/versions',requireAuth,async(req,res,next)=>{
 try{const id=idParam(req);const [rows]=await pool.execute('SELECT id,version_number,calculation_method,validation_status,created_at,validated_at,validated_by FROM material_versions WHERE material_id=? ORDER BY version_number DESC',[id]);res.json({success:true,data:rows});}catch(e){next(e);}
});
router.delete('/:id',requireAuth,async(req,res,next)=>{
 const conn=await pool.getConnection();
 try{const id=idParam(req);await conn.beginTransaction();const m=await getMaterial(conn,id,true);if(m.validated_version_id&&req.user.role!=='admin')throw httpError('Only an admin can delete validated materials',403);await conn.execute('DELETE FROM materials WHERE id=?',[id]);await conn.commit();res.json({success:true});}catch(e){await conn.rollback();next(e);}finally{conn.release();}
});
export default router;
