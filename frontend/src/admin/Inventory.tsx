import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, RefreshCw, X, Search, Server, AlertCircle } from "lucide-react";
import adminApi from "../adminApi";

type Provider = { id: string; name: string; code: string; currency?: string; isActive: boolean };
type InventoryStatus = "AVAILABLE" | "RESERVED" | "ASSIGNED" | "MAINTENANCE" | "EXPIRED" | "SUSPENDED" | "FAILED";
type InventoryItem = {
  id: string; providerId: string; providerVpsId: string; ipAddress?: string | null;
  hostname?: string | null; cpuCores: number; ramGb: number; storageGb: number;
  bandwidthGb?: number | null; region?: string | null; operatingSystem?: string | null;
  providerCost: string | number; currency: string; status: InventoryStatus;
  expiresAt?: string | null; accessDetailsConfigured?: boolean;
  provider?: { id: string; name: string; code: string };
  vpsInstance?: { id: string; userId: string; status: string } | null;
};
type FormState = {
  providerId: string; providerVpsId: string; ipAddress: string; hostname: string;
  cpuCores: string; ramGb: string; storageGb: string; bandwidthGb: string;
  region: string; operatingSystem: string; providerCost: string; currency: string;
  expiresAt: string; accessDetails: string;
};
const initial: FormState = {
  providerId: "", providerVpsId: "", ipAddress: "", hostname: "",
  cpuCores: "2", ramGb: "4", storageGb: "50", bandwidthGb: "",
  region: "India", operatingSystem: "Ubuntu 24.04", providerCost: "0",
  currency: "INR", expiresAt: "", accessDetails: "",
};
const input = "w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm text-white outline-none focus:border-blue-500";
const statuses: InventoryStatus[] = ["AVAILABLE", "MAINTENANCE", "EXPIRED", "SUSPENDED", "FAILED"];

export default function Inventory() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [form, setForm] = useState<FormState>(initial);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [p, i] = await Promise.all([
        adminApi.get("/admin/providers"),
        adminApi.get("/admin/inventory", { params: { status: statusFilter || undefined, providerId: providerFilter || undefined } }),
      ]);
      const providerRows = p.data?.providers ?? p.data ?? [];
      const inventoryRows = i.data?.inventory ?? [];
      setProviders(Array.isArray(providerRows) ? providerRows : []);
      setItems(Array.isArray(inventoryRows) ? inventoryRows : []);
    } catch (e: any) {
      setError(e.response?.data?.message || "Inventory load failed. Check admin API access.");
    } finally { setLoading(false); }
  }, [statusFilter, providerFilter]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(x => [x.providerVpsId, x.ipAddress, x.hostname, x.operatingSystem, x.provider?.name].some(v => String(v || "").toLowerCase().includes(q)));
  }, [items, search]);

  const counts = useMemo(() => ({
    total: items.length,
    available: items.filter(x => x.status === "AVAILABLE").length,
    reserved: items.filter(x => x.status === "RESERVED").length,
    assigned: items.filter(x => x.status === "ASSIGNED").length,
  }), [items]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const payload: any = {
        providerId: form.providerId, providerVpsId: form.providerVpsId.trim(),
        ipAddress: form.ipAddress.trim() || undefined, hostname: form.hostname.trim() || undefined,
        cpuCores: Number(form.cpuCores), ramGb: Number(form.ramGb), storageGb: Number(form.storageGb),
        bandwidthGb: form.bandwidthGb === "" ? undefined : Number(form.bandwidthGb),
        region: form.region.trim() || undefined, operatingSystem: form.operatingSystem.trim() || undefined,
        providerCost: Number(form.providerCost), currency: form.currency,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        accessDetails: form.accessDetails || undefined,
      };
      await adminApi.post("/admin/inventory", payload);
      setSuccess("Inventory item added successfully.");
      setForm(initial); setModal(false); await load();
    } catch (e: any) {
      setError(e.response?.data?.message || "Unable to add inventory item.");
    } finally { setSaving(false); }
  };

  const changeStatus = async (item: InventoryItem, status: InventoryStatus) => {
    if (item.status === "RESERVED" || item.status === "ASSIGNED" || item.vpsInstance) return;
    setError(""); setSuccess("");
    try {
      await adminApi.patch(`/admin/inventory/${item.id}/status`, { status });
      setSuccess(`Inventory status updated to ${status}.`); await load();
    } catch (e: any) { setError(e.response?.data?.message || "Status update failed."); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Inventory Management</h1><p className="mt-1 text-sm text-slate-400">Manage pre-purchased VPS inventory from providers.</p></div>
      <div className="flex gap-2">
        <button onClick={load} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm"><RefreshCw size={15}/> Refresh</button>
        <button onClick={() => { setError(""); setSuccess(""); setModal(true); }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold"><Plus size={16}/> Add Inventory</button>
      </div>
    </div>
    {error && <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle size={16}/>{error}</div>}
    {success && <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">{success}</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Object.entries({ "Total Inventory": counts.total, Available: counts.available, Reserved: counts.reserved, Assigned: counts.assigned }).map(([k,v]) =>
        <div key={k} className="rounded-xl border border-slate-800 bg-[#111a2b] p-4"><p className="text-sm text-slate-400">{k}</p><p className="mt-2 text-2xl font-bold">{v}</p></div>)}
    </div>
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#111a2b] p-4 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-500" size={17}/><input className={`${input} pl-10`} placeholder="Search VPS ID, IP, hostname, OS or provider..." value={search} onChange={e => setSearch(e.target.value)}/></div>
      <select className={input} value={providerFilter} onChange={e => setProviderFilter(e.target.value)}><option value="">All providers</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select className={input} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{["AVAILABLE","RESERVED","ASSIGNED","MAINTENANCE","EXPIRED","SUSPENDED","FAILED"].map(s => <option key={s}>{s}</option>)}</select>
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#111a2b]">
      {loading ? <div className="p-12 text-center text-slate-400"><RefreshCw className="mx-auto mb-3 animate-spin"/>Loading inventory...</div> :
      visible.length === 0 ? <div className="p-12 text-center text-slate-400"><Server className="mx-auto mb-3" size={32}/>No inventory items found.</div> :
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="bg-[#0d1525] text-xs uppercase text-slate-400"><tr>{["Provider / VPS ID","IP / Hostname","Specifications","OS / Region","Provider Cost","Status","Change Status"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-800">{visible.map(item => {
          const locked = item.status === "RESERVED" || item.status === "ASSIGNED" || !!item.vpsInstance;
          return <tr key={item.id} className="hover:bg-slate-800/30">
            <td className="px-4 py-4"><p className="font-semibold">{item.provider?.name || "Provider"}</p><p className="mt-1 font-mono text-xs text-slate-400">{item.providerVpsId}</p></td>
            <td className="px-4 py-4"><p>{item.ipAddress || "—"}</p><p className="text-xs text-slate-500">{item.hostname || "—"}</p></td>
            <td className="px-4 py-4">{item.cpuCores} CPU · {item.ramGb} GB RAM · {item.storageGb} GB</td>
            <td className="px-4 py-4">{item.operatingSystem || "—"}<p className="text-xs text-slate-500">{item.region || "—"}</p></td>
            <td className="px-4 py-4 tabular-nums">₹{Number(item.providerCost).toLocaleString("en-IN")} {item.currency}</td>
            <td className="px-4 py-4"><span className="rounded-full bg-slate-700/60 px-2.5 py-1 text-xs">{item.status}</span></td>
            <td className="px-4 py-4"><select disabled={locked} className={`${input} min-w-36`} value={item.status} onChange={e => changeStatus(item, e.target.value as InventoryStatus)}><option value={item.status}>{item.status}</option>{statuses.filter(s => s !== item.status).map(s=><option key={s} value={s}>{s}</option>)}</select>{locked && <p className="mt-1 text-xs text-amber-400">Lifecycle locked</p>}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    </div>
    {modal && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => !saving && setModal(false)}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-[#111a2b] p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Add VPS Inventory</h2><p className="text-xs text-slate-400">Access details are encrypted by the backend before storage.</p></div><button type="button" onClick={() => setModal(false)}><X/></button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Provider *<select required className={`${input} mt-1`} value={form.providerId} onChange={e => setForm({...form,providerId:e.target.value,currency:providers.find(p=>p.id===e.target.value)?.currency || "INR"})}><option value="">Select provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="text-sm">Provider VPS ID *<input required className={`${input} mt-1`} value={form.providerVpsId} onChange={e=>setForm({...form,providerVpsId:e.target.value})}/></label>
          <label className="text-sm">IP Address<input className={`${input} mt-1`} value={form.ipAddress} onChange={e=>setForm({...form,ipAddress:e.target.value})}/></label>
          <label className="text-sm">Hostname<input className={`${input} mt-1`} value={form.hostname} onChange={e=>setForm({...form,hostname:e.target.value})}/></label>
          <label className="text-sm">CPU Cores *<input required type="number" min="1" className={`${input} mt-1`} value={form.cpuCores} onChange={e=>setForm({...form,cpuCores:e.target.value})}/></label>
          <label className="text-sm">RAM (GB) *<input required type="number" min="1" className={`${input} mt-1`} value={form.ramGb} onChange={e=>setForm({...form,ramGb:e.target.value})}/></label>
          <label className="text-sm">Storage (GB) *<input required type="number" min="1" className={`${input} mt-1`} value={form.storageGb} onChange={e=>setForm({...form,storageGb:e.target.value})}/></label>
          <label className="text-sm">Bandwidth (GB)<input type="number" min="0" className={`${input} mt-1`} value={form.bandwidthGb} onChange={e=>setForm({...form,bandwidthGb:e.target.value})}/></label>
          <label className="text-sm">Region<input className={`${input} mt-1`} value={form.region} onChange={e=>setForm({...form,region:e.target.value})}/></label>
          <label className="text-sm">Operating System<input className={`${input} mt-1`} value={form.operatingSystem} onChange={e=>setForm({...form,operatingSystem:e.target.value})}/></label>
          <label className="text-sm">Provider Cost (₹) *<input required type="number" min="0" step="0.01" className={`${input} mt-1`} value={form.providerCost} onChange={e=>setForm({...form,providerCost:e.target.value})}/></label>
          <label className="text-sm">Currency<select className={`${input} mt-1`} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option>INR</option></select></label>
          <label className="text-sm">Expiry Date<input type="date" className={`${input} mt-1`} value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/></label>
          <label className="text-sm sm:col-span-2">Access Details (optional; plaintext sent over HTTPS, encrypted server-side)<textarea rows={3} className={`${input} mt-1`} value={form.accessDetails} onChange={e=>setForm({...form,accessDetails:e.target.value})} placeholder="Credentials or access information"/></label>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border border-slate-700 px-4 py-2">Cancel</button><button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2 font-semibold disabled:opacity-50">{saving?"Saving...":"Save Inventory"}</button></div>
      </form>
    </div>}
  </div>;
}
