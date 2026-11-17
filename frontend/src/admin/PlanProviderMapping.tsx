import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, RefreshCw, X, AlertCircle } from "lucide-react";
import adminApi from "../adminApi";

type Plan = { id: string; name: string; productType: string; cpuCores: number; ramGb: number; storageGb: number; bandwidthGb?: number | null; price: string | number; isActive: boolean };
type Provider = { id: string; name: string; code: string; isActive: boolean; apiPurchaseEnabled: boolean };
type Product = { id: string; providerId: string; name: string; externalProductId: string; productType: string; cpuCores: number; ramGb: number; storageGb: number; bandwidthGb?: number | null; supportedOS: string[]; isActive: boolean };
type Mapping = { id: string; planId: string; providerId: string; providerProductId: string; priority: number; isEnabled: boolean; autoPurchaseEnabled: boolean; maxAllowedCost?: string | number | null; plan: Plan; provider: Provider; providerProduct: Product };
type FormState = { planId: string; providerId: string; providerProductId: string; priority: string; isEnabled: boolean; autoPurchaseEnabled: boolean; maxAllowedCost: string };
const initial: FormState = { planId:"", providerId:"", providerProductId:"", priority:"100", isEnabled:true, autoPurchaseEnabled:false, maxAllowedCost:"" };
const input = "w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm text-white outline-none focus:border-blue-500";
const rows = (d:any, key:string) => Array.isArray(d?.[key]) ? d[key] : Array.isArray(d) ? d : [];

export default function PlanProviderMapping() {
  const [plans,setPlans] = useState<Plan[]>([]);
  const [providers,setProviders] = useState<Provider[]>([]);
  const [products,setProducts] = useState<Product[]>([]);
  const [mappings,setMappings] = useState<Mapping[]>([]);
  const [form,setForm] = useState<FormState>(initial);
  const [modal,setModal] = useState(false);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const [enabledFilter,setEnabledFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [a,b,c,d] = await Promise.all([
        adminApi.get("/admin/plans"), adminApi.get("/admin/providers"),
        adminApi.get("/admin/provider-products"), adminApi.get("/admin/plan-provider-mappings", {params:{enabled:enabledFilter || undefined}}),
      ]);
      setPlans(rows(a.data,"plans").filter((x:Plan)=>x.isActive));
      setProviders(rows(b.data,"providers").filter((x:Provider)=>x.isActive));
      setProducts(rows(c.data,"products").filter((x:Product)=>x.isActive));
      setMappings(rows(d.data,"mappings"));
    } catch(e:any) { setError(e.response?.data?.message || "Unable to load mapping data. Check API routes and admin access."); }
    finally { setLoading(false); }
  },[enabledFilter]);
  useEffect(()=>{load();},[load]);

  const selectedPlan = plans.find(x=>x.id===form.planId);
  const eligibleProducts = useMemo(()=>products.filter(p=>p.providerId===form.providerId && p.productType===selectedPlan?.productType && p.cpuCores >= (selectedPlan?.cpuCores || 0) && p.ramGb >= (selectedPlan?.ramGb || 0) && p.storageGb >= (selectedPlan?.storageGb || 0) && (selectedPlan?.bandwidthGb == null || (p.bandwidthGb != null && p.bandwidthGb >= selectedPlan.bandwidthGb))),[products,form.providerId,selectedPlan]);

  const submit = async(e:FormEvent) => {
    e.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      await adminApi.post("/admin/plan-provider-mappings", {
        planId:form.planId, providerId:form.providerId, providerProductId:form.providerProductId,
        priority:Number(form.priority), isEnabled:form.isEnabled,
        autoPurchaseEnabled:false,
        maxAllowedCost:form.maxAllowedCost==="" ? undefined : Number(form.maxAllowedCost),
      });
      setSuccess("Plan-provider mapping created. Automatic provider purchase remains OFF.");
      setForm(initial); setModal(false); await load();
    } catch(e:any) { setError(e.response?.data?.message || "Unable to create mapping."); }
    finally { setSaving(false); }
  };

  const update = async(m:Mapping, patch:Partial<Pick<Mapping,"priority"|"isEnabled"|"autoPurchaseEnabled">>) => {
    setError(""); setSuccess("");
    try {
      await adminApi.patch(`/admin/plan-provider-mappings/${m.id}`,patch);
      setSuccess("Mapping updated."); await load();
    } catch(e:any) { setError(e.response?.data?.message || "Mapping update failed."); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">VPS Plan Provider Mapping</h1><p className="mt-1 text-sm text-slate-400">Connect customer plans to eligible provider products and define fallback priority.</p></div><div className="flex gap-2"><button onClick={load} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm"><RefreshCw size={15}/> Refresh</button><button onClick={()=>{setForm(initial);setModal(true);setError("");}} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold"><Plus size={16}/> Add Mapping</button></div></div>
    {error && <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle size={16}/>{error}</div>}
    {success && <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">{success}</div>}
    <div className="flex justify-end"><select className={`${input} max-w-xs`} value={enabledFilter} onChange={e=>setEnabledFilter(e.target.value)}><option value="">All mappings</option><option value="true">Enabled</option><option value="false">Disabled</option></select></div>
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#111a2b]">
      {loading ? <div className="p-12 text-center text-slate-400"><RefreshCw className="mx-auto mb-3 animate-spin"/>Loading mappings...</div> : mappings.length===0 ? <div className="p-12 text-center text-slate-400">No mappings configured yet.</div> :
      <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-[#0d1525] text-xs uppercase text-slate-400"><tr>{["VPS Plan","Provider","Provider Product","Priority","Mapping","Auto Purchase","Actions"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{mappings.map(m=><tr key={m.id}>
        <td className="px-4 py-4"><p className="font-semibold">{m.plan?.name || "—"}</p><p className="text-xs text-slate-500">{m.plan?.productType}</p></td>
        <td className="px-4 py-4">{m.provider?.name || "—"}<p className="text-xs text-slate-500">{m.provider?.code}</p></td>
        <td className="px-4 py-4">{m.providerProduct?.name || "—"}<p className="text-xs text-slate-500">{m.providerProduct?.externalProductId}</p></td>
        <td className="px-4 py-4"><input aria-label="Priority" type="number" min="0" defaultValue={m.priority} onBlur={e=>{const n=Number(e.target.value);if(n!==m.priority && n>=0) update(m,{priority:n});}} className={`${input} w-20`}/></td>
        <td className="px-4 py-4"><select className={input} value={String(m.isEnabled)} onChange={e=>update(m,{isEnabled:e.target.value==="true"})}><option value="true">Enabled</option><option value="false">Disabled</option></select></td>
        <td className="px-4 py-4"><span className={m.autoPurchaseEnabled?"text-amber-400":"text-green-400"}>{m.autoPurchaseEnabled?"Enabled":"Off"}</span></td>
        <td className="px-4 py-4"><button disabled={!m.provider?.apiPurchaseEnabled || m.autoPurchaseEnabled} onClick={()=>update(m,{autoPurchaseEnabled:true})} title={!m.provider?.apiPurchaseEnabled?"Provider API purchasing is disabled":""} className="rounded-lg border border-slate-700 px-3 py-2 text-xs disabled:opacity-40">Enable API Purchase</button></td>
      </tr>)}</tbody></table></div>}
    </div>
    {modal && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={()=>!saving&&setModal(false)}><form onSubmit={submit} onClick={e=>e.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-[#111a2b] p-6">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Create Plan Mapping</h2><p className="text-xs text-slate-400">Only compatible active provider products are selectable.</p></div><button type="button" onClick={()=>setModal(false)}><X/></button></div>
      <label className="block text-sm">VPS Plan *<select required className={`${input} mt-1`} value={form.planId} onChange={e=>setForm({...form,planId:e.target.value,providerProductId:""})}><option value="">Select plan</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name} · {p.productType} · {p.cpuCores} CPU / {p.ramGb} GB RAM</option>)}</select></label>
      <label className="block text-sm">Provider *<select required className={`${input} mt-1`} value={form.providerId} onChange={e=>setForm({...form,providerId:e.target.value,providerProductId:""})}><option value="">Select provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}</select></label>
      <label className="block text-sm">Compatible Provider Product *<select required disabled={!form.providerId||!form.planId} className={`${input} mt-1`} value={form.providerProductId} onChange={e=>setForm({...form,providerProductId:e.target.value})}><option value="">Select product</option>{eligibleProducts.map(p=><option key={p.id} value={p.id}>{p.name} · {p.cpuCores} CPU / {p.ramGb} GB RAM / {p.storageGb} GB</option>)}</select>{form.planId&&form.providerId&&eligibleProducts.length===0&&<p className="mt-1 text-xs text-amber-400">No active product meets this plan's type and specifications.</p>}</label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Priority (lower = first) *<input required type="number" min="0" className={`${input} mt-1`} value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}/></label><label className="text-sm">Maximum provider cost (₹)<input type="number" min="0" step="0.01" className={`${input} mt-1`} value={form.maxAllowedCost} onChange={e=>setForm({...form,maxAllowedCost:e.target.value})}/></label></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isEnabled} onChange={e=>setForm({...form,isEnabled:e.target.checked})}/> Mapping enabled</label>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Automatic provider purchasing is intentionally OFF until provider API documentation and credentials are verified.</div>
      <div className="flex justify-end gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border border-slate-700 px-4 py-2">Cancel</button><button disabled={saving||!eligibleProducts.some(p=>p.id===form.providerProductId)} className="rounded-lg bg-blue-600 px-5 py-2 font-semibold disabled:opacity-50">{saving?"Saving...":"Create Mapping"}</button></div>
    </form></div>}
  </div>;
}
