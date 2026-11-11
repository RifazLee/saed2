import { useCallback, useEffect, useState } from 'react';
import InputPage, { type InputEntry } from '@/pages/InputPage';
import ProcessingPage from '@/pages/ProcessingPage';
import RingSelectPage from '@/pages/RingSelectPage';
import ResultsPage from '@/pages/ResultsPage';
import MaterialPage, { type MaterialRecord } from '@/pages/MaterialPage';
import MaterialDetailPage from '@/pages/MaterialDetailPage';
import LoginPage from '@/pages/LoginPage';
import type { AnalysisParams, AnalysisResult, DetectionResult } from '@/lib/diffraction/types';
import { api, apiMaterialToRecord, type ApiMaterial } from '@/lib/api';

type Stage = 'materials' | 'material-detail' | 'input' | 'processing' | 'ringselect' | 'results';
type ApiEnvelope<T> = {success:boolean;data:T};
type LoginResponse = {success:boolean;token:string;user:{id:string;email:string;role:string}};
export default function App() {
  const [stage, setStage] = useState<Stage>('materials');
  const [detailMaterialId, setDetailMaterialId] = useState<string|null>(null);
  const [token,setToken]=useState<string|null>(()=>sessionStorage.getItem('saed_token'));
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [entries, setEntries] = useState<InputEntry[]>([]);
  const [params, setParams] = useState<AnalysisParams | null>(null);
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loadingMaterials,setLoadingMaterials]=useState(false);
  const [apiError,setApiError]=useState('');

  const refreshMaterials=useCallback(async()=>{
    setLoadingMaterials(true);setApiError('');
    try{
      const response=await api<ApiEnvelope<ApiMaterial[]>>('/materials');
      setMaterials(response.data.map(m => apiMaterialToRecord(m) as MaterialRecord));
    }catch(e){setApiError(e instanceof Error?e.message:'Cannot load materials');}
    finally{setLoadingMaterials(false);}
  },[]);
  useEffect(()=>{if(token)void refreshMaterials();},[token,refreshMaterials]);

  const login=useCallback(async(email:string,password:string)=>{
    const response=await api<LoginResponse>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
    sessionStorage.setItem('saed_token',response.token);setToken(response.token);
  },[]);
  const logout=()=>{sessionStorage.removeItem('saed_token');setToken(null);setMaterials([]);setStage('materials');};

  const saveMaterial = useCallback(async(material:MaterialRecord) => {
    if(!token)throw new Error('Session expired. Sign in again.');
    const payload={
      materialName:material.name,chemicalFormula:material.formula,phase:material.phase,
      description:material.description,source:material.source,doi:material.doi,notes:material.notes,
      crystalSystem:material.system,spaceGroupNumber:material.sgNumber,spaceGroupSymbol:material.sgSymbol,
      setting:material.setting,lattice:material.lattice
    };
    let id=material.id;
    const existingMaterial=materials.find(m=>m.id===material.id);
    const existing=Boolean(existingMaterial);
    const isValidatedRevision=existingMaterial?.status==='Validated';
    const endpoint=existing?(isValidatedRevision?`/materials/${id}/revisions`:`/materials/${id}`):'/materials';
    const created=await api<ApiEnvelope<{id:string}>>(endpoint,{
      method:existing?(isValidatedRevision?'POST':'PUT'):'POST',body:JSON.stringify(payload)
    },token);
    id=created.data.id;
    try {
      if(material.status==='Validated'){
        await api<ApiEnvelope<unknown>>(`/materials/${id}/calculate`,{
          method:'POST',body:JSON.stringify(material.calculationLimits || {maxH:8,maxK:8,maxL:8,minD:0.5})
        },token);
        await api<ApiEnvelope<unknown>>(`/materials/${id}/validate`,{
          method:'POST',body:JSON.stringify({validationNotes:'Operator reviewed material metadata, lattice parameters, reference source and generated reflections.'})
        },token);
      }
    } finally {
      await refreshMaterials();
    }
  },[token,materials,refreshMaterials]);

  const handleStart = useCallback((ents: InputEntry[], p: AnalysisParams) => {
    setEntries(ents); setParams(p); setDetections([]); setResults([]); setErrors([]); setStage('processing');
  }, []);
  const handleDetected = useCallback((dets: DetectionResult[], errs: string[]) => {
    setDetections(dets); setErrors(errs); setStage('ringselect');
  }, []);
  const handleRingSelected = useCallback((res: AnalysisResult[]) => { setResults(res); setStage('results'); }, []);
  const handleRestart = useCallback(() => {
    setEntries([]); setParams(null); setDetections([]); setResults([]); setErrors([]); setStage('input');
  }, []);

  if(!token)return <LoginPage onLogin={login}/>;
  if(stage==='material-detail'&&detailMaterialId)return <MaterialDetailPage materialId={detailMaterialId} token={token} onBack={()=>{setDetailMaterialId(null);setStage('materials');void refreshMaterials();}}/>;
  if(stage==='materials')return <div><div className="absolute right-6 top-6 z-10 flex items-center gap-3"><button onClick={logout} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-white">Sign out</button></div>{apiError&&<div className="bg-red-50 px-6 py-2 text-center text-xs text-red-700">{apiError}</div>}{loadingMaterials&&<div className="bg-slate-100 px-6 py-2 text-center text-xs text-slate-500">Loading materials...</div>}<MaterialPage materials={materials} onSave={saveMaterial} onOpenAnalysis={()=>setStage('input')} onViewDetail={(id)=>{setDetailMaterialId(id);setStage('material-detail');}}/></div>;
  if (stage === 'input') return <InputPage onStart={handleStart} onBackToMaterials={() => setStage('materials')} />;
  if (stage === 'processing' && params) return <ProcessingPage entries={entries} params={params} onDone={handleDetected} />;
  if (stage === 'ringselect' && params) return <RingSelectPage detections={detections} params={params} errors={errors} onConfirm={handleRingSelected} onRestart={handleRestart} />;
  return <ResultsPage results={results} errors={errors} onRestart={handleRestart} />;
}
