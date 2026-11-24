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
const input = "w-full rounded-xl border border-[#332f2a] bg-[#171717] p-3 text-sm text-[#F1E9DA] outline-none placeholder:text-[#F1E9DA]/40 focus:border-[#C6A66B] focus:ring-1 focus:ring-[#C6A66B]/50";
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
      <div>
        <h1 className="font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">Inventory Management</h1>
        <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">Manage pre-purchased VPS inventory from providers.</p>
      </div>
      <div className="flex gap-2.5">
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2 font-mono text-xs font-semibold text-[#F1E9DA] transition hover:bg-[#201d1a]"><RefreshCw size={14}/> Refresh</button>
        <button onClick={() => { setError(""); setSuccess(""); setModal(true); }} className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-sm transition hover:bg-[#d8b87d]"><Plus size={15}/> Add Inventory</button>
      </div>
    </div>
    {error && <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 font-mono text-xs text-red-300"><AlertCircle size={15}/>{error}</div>}
    {success && <div className="rounded-xl border border-[#C6A66B]/30 bg-[#C6A66B]/10 p-3.5 font-mono text-xs text-[#C6A66B]">{success}</div>}
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Object.entries({ "Total Inventory": counts.total, Available: counts.available, Reserved: counts.reserved, Assigned: counts.assigned }).map(([k,v]) =>
        <div key={k} className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">{k}</p>
          <p className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA]">{v}</p>
        </div>)}
    </div>
    <div className="flex flex-col gap-3 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-4 shadow-sm sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-3.5 text-[#F1E9DA]/40" size={16}/>
        <input className={`${input} pl-10`} placeholder="Search VPS ID, IP, hostname, OS or provider..." value={search} onChange={e => setSearch(e.target.value)}/>
      </div>
      <select className={input} value={providerFilter} onChange={e => setProviderFilter(e.target.value)}><option value="">All providers</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select className={input} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{["AVAILABLE","RESERVED","ASSIGNED","MAINTENANCE","EXPIRED","SUSPENDED","FAILED"].map(s => <option key={s}>{s}</option>)}</select>
    </div>
    <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a] shadow-sm">
      {loading ? <div className="p-12 text-center font-mono text-xs text-[#F1E9DA]/60"><RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]"/>Loading inventory...</div> :
      visible.length === 0 ? <div className="p-12 text-center font-mono text-xs text-[#F1E9DA]/60"><Server className="mx-auto mb-3 text-[#C6A66B]/40" size={32}/>No inventory items found.</div> :
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/60"><tr>{["Provider / VPS ID","IP / Hostname","Specifications","OS / Region","Provider Cost","Status","Change Status"].map(x=><th key={x} className="px-5 py-3.5">{x}</th>)}</tr></thead>
        <tbody className="divide-y divide-[#332f2a]">{visible.map(item => {
          const locked = item.status === "RESERVED" || item.status === "ASSIGNED" || !!item.vpsInstance;
          return <tr key={item.id} className="transition hover:bg-[#292521]/60">
            <td className="px-5 py-4"><p className="font-medium text-[#F1E9DA]">{item.provider?.name || "Provider"}</p><p className="mt-1 font-mono text-xs text-[#F1E9DA]/50">{item.providerVpsId}</p></td>
            <td className="px-5 py-4"><p className="font-mono text-xs text-[#F1E9DA]">{item.ipAddress || "—"}</p><p className="font-mono text-[11px] text-[#F1E9DA]/50">{item.hostname || "—"}</p></td>
            <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/80">{item.cpuCores} CPU · {item.ramGb} GB RAM · {item.storageGb} GB</td>
            <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/80">{item.operatingSystem || "—"}<p className="text-[11px] text-[#F1E9DA]/50">{item.region || "—"}</p></td>
            <td className="px-5 py-4 font-mono text-sm font-semibold text-[#F1E9DA] tabular-nums">₹{Number(item.providerCost).toLocaleString("en-IN")} <span className="text-xs font-normal text-[#F1E9DA]/50">{item.currency}</span></td>
            <td className="px-5 py-4"><span className="inline-block rounded-full border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-[#C6A66B]">{item.status}</span></td>
            <td className="px-5 py-4"><select disabled={locked} className={`${input} min-w-36`} value={item.status} onChange={e => changeStatus(item, e.target.value as InventoryStatus)}><option value={item.status}>{item.status}</option>{statuses.filter(s => s !== item.status).map(s=><option key={s} value={s}>{s}</option>)}</select>{locked && <p className="mt-1 font-mono text-[11px] text-amber-400">Lifecycle locked</p>}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    </div>
    {modal && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => !saving && setModal(false)}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 text-[#F1E9DA] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#332f2a] pb-3">
          <div><h2 className="font-serif text-xl font-bold text-[#F1E9DA]">Add VPS Inventory</h2><p className="mt-0.5 font-mono text-xs text-[#F1E9DA]/50">Access details are encrypted by the backend before storage.</p></div>
          <button type="button" onClick={() => setModal(false)} className="rounded-lg p-1.5 text-[#F1E9DA]/50 transition hover:bg-[#292521] hover:text-[#F1E9DA]"><X size={18}/></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Provider *<select required className={`${input} mt-1`} value={form.providerId} onChange={e => setForm({...form,providerId:e.target.value,currency:providers.find(p=>p.id===e.target.value)?.currency || "INR"})}><option value="">Select provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Provider VPS ID *<input required className={`${input} mt-1`} value={form.providerVpsId} onChange={e=>setForm({...form,providerVpsId:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">IP Address<input className={`${input} mt-1`} value={form.ipAddress} onChange={e=>setForm({...form,ipAddress:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Hostname<input className={`${input} mt-1`} value={form.hostname} onChange={e=>setForm({...form,hostname:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">CPU Cores *<input required type="number" min="1" className={`${input} mt-1`} value={form.cpuCores} onChange={e=>setForm({...form,cpuCores:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">RAM (GB) *<input required type="number" min="1" className={`${input} mt-1`} value={form.ramGb} onChange={e=>setForm({...form,ramGb:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Storage (GB) *<input required type="number" min="1" className={`${input} mt-1`} value={form.storageGb} onChange={e=>setForm({...form,storageGb:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Bandwidth (GB)<input type="number" min="0" className={`${input} mt-1`} value={form.bandwidthGb} onChange={e=>setForm({...form,bandwidthGb:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Region<input className={`${input} mt-1`} value={form.region} onChange={e=>setForm({...form,region:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Operating System<input className={`${input} mt-1`} value={form.operatingSystem} onChange={e=>setForm({...form,operatingSystem:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Provider Cost (₹) *<input required type="number" min="0" step="0.01" className={`${input} mt-1 font-mono`} value={form.providerCost} onChange={e=>setForm({...form,providerCost:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Currency<select className={`${input} mt-1`} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option>INR</option></select></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">Expiry Date<input type="date" className={`${input} mt-1`} value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/></label>
          <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70 sm:col-span-2">Access Details (encrypted server-side)<textarea rows={3} className={`${input} mt-1 font-mono`} value={form.accessDetails} onChange={e=>setForm({...form,accessDetails:e.target.value})} placeholder="Credentials or access information"/></label>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-[#332f2a] pt-3">
          <button type="button" onClick={()=>setModal(false)} className="rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2 font-mono text-xs font-semibold text-[#F1E9DA] transition hover:bg-[#292521]">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-[#C6A66B] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-sm transition hover:bg-[#d8b87d] disabled:opacity-50">{saving?"Saving...":"Save Inventory"}</button>
        </div>
      </form>
    </div>}
  </div>;
}
