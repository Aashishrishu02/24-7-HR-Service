import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, RefreshCw, X, AlertCircle } from "lucide-react";
import adminApi from "../adminApi";

type Plan = { id: string; name: string; productType: string; cpuCores: number; ramGb: number; storageGb: number; bandwidthGb?: number | null; price: string | number; isActive: boolean };
type Provider = { id: string; name: string; code: string; isActive: boolean; apiPurchaseEnabled: boolean };
type Product = { id: string; providerId: string; name: string; externalProductId: string; productType: string; cpuCores: number; ramGb: number; storageGb: number; bandwidthGb?: number | null; supportedOS: string[]; isActive: boolean };
type Mapping = { id: string; planId: string; providerId: string; providerProductId: string; priority: number; isEnabled: boolean; autoPurchaseEnabled: boolean; maxAllowedCost?: string | number | null; plan: Plan; provider: Provider; providerProduct: Product };
type FormState = { planId: string; providerId: string; providerProductId: string; priority: string; isEnabled: boolean; autoPurchaseEnabled: boolean; maxAllowedCost: string };
const initial: FormState = { planId:"", providerId:"", providerProductId:"", priority:"100", isEnabled:true, autoPurchaseEnabled:false, maxAllowedCost:"" };
const input = "w-full rounded-xl border border-[#332f2a] bg-[#171717] p-3 font-mono text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 outline-none transition focus:border-[#C6A66B] focus:ring-1 focus:ring-[#C6A66B]";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">VPS Plan Provider Mapping</h1>
          <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">
            Connect customer plans to eligible provider products and define fallback priority.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-2 font-mono text-xs font-bold text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521]"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={() => {
              setForm(initial);
              setModal(true);
              setError("");
            }}
            className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d]"
          >
            <Plus size={16} /> Add Mapping
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-4 font-mono text-xs text-red-300">
          <AlertCircle size={16} className="text-red-400" />
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-[#C6A66B]/30 bg-[#C6A66B]/10 p-4 font-mono text-xs text-[#C6A66B]">
          {success}
        </div>
      )}

      <div className="flex justify-end">
        <select
          className={`${input} max-w-xs`}
          value={enabledFilter}
          onChange={(e) => setEnabledFilter(e.target.value)}
        >
          <option value="">All mappings</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
        {loading ? (
          <div className="p-16 text-center font-mono text-xs text-[#F1E9DA]/50">
            <RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]" size={22} />
            Loading mappings...
          </div>
        ) : mappings.length === 0 ? (
          <div className="p-16 text-center font-mono text-xs text-[#F1E9DA]/50">
            No mappings configured yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left font-sans text-sm">
              <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                <tr>
                  {["VPS Plan", "Provider", "Provider Product", "Priority", "Mapping", "Auto Purchase", "Actions"].map((x) => (
                    <th key={x} className="px-5 py-3.5">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#332f2a]">
                {mappings.map((m) => (
                  <tr key={m.id} className="transition hover:bg-[#292521]/60">
                    <td className="px-5 py-4">
                      <p className="font-medium text-[#F1E9DA]">{m.plan?.name || "—"}</p>
                      <p className="font-mono text-xs text-[#F1E9DA]/50">{m.plan?.productType}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-[#F1E9DA]">{m.provider?.name || "—"}</p>
                      <p className="font-mono text-xs text-[#C6A66B]">{m.provider?.code}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-[#F1E9DA]">{m.providerProduct?.name || "—"}</p>
                      <p className="font-mono text-xs text-[#F1E9DA]/50">{m.providerProduct?.externalProductId}</p>
                    </td>
                    <td className="px-5 py-4">
                      <input
                        aria-label="Priority"
                        type="number"
                        min="0"
                        defaultValue={m.priority}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (n !== m.priority && n >= 0) update(m, { priority: n });
                        }}
                        className={`${input} w-20 py-1.5`}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <select
                        className={`${input} py-1.5`}
                        value={String(m.isEnabled)}
                        onChange={(e) => update(m, { isEnabled: e.target.value === "true" })}
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`font-mono text-xs font-semibold ${m.autoPurchaseEnabled ? "text-amber-400" : "text-emerald-400"}`}>
                        {m.autoPurchaseEnabled ? "Enabled" : "Off"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        disabled={!m.provider?.apiPurchaseEnabled || m.autoPurchaseEnabled}
                        onClick={() => update(m, { autoPurchaseEnabled: true })}
                        title={!m.provider?.apiPurchaseEnabled ? "Provider API purchasing is disabled" : ""}
                        className="rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-xs text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521] disabled:opacity-40"
                      >
                        Enable API Purchase
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => !saving && setModal(false)}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#332f2a] pb-4">
              <div>
                <h2 className="font-serif text-xl font-bold text-[#F1E9DA]">Create Plan Mapping</h2>
                <p className="font-sans text-xs text-[#F1E9DA]/50">Only compatible active provider products are selectable.</p>
              </div>
              <button type="button" onClick={() => setModal(false)} className="rounded-lg p-1.5 text-[#F1E9DA]/50 hover:bg-[#171717] hover:text-[#F1E9DA]">
                <X size={18} />
              </button>
            </div>

            <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
              VPS Plan *
              <select
                required
                className={`${input} mt-1.5 font-sans`}
                value={form.planId}
                onChange={(e) => setForm({ ...form, planId: e.target.value, providerProductId: "" })}
              >
                <option value="">Select plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.productType} · {p.cpuCores} CPU / {p.ramGb} GB RAM
                  </option>
                ))}
              </select>
            </label>

            <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
              Provider *
              <select
                required
                className={`${input} mt-1.5 font-sans`}
                value={form.providerId}
                onChange={(e) => setForm({ ...form, providerId: e.target.value, providerProductId: "" })}
              >
                <option value="">Select provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
              Compatible Provider Product *
              <select
                required
                disabled={!form.providerId || !form.planId}
                className={`${input} mt-1.5 font-sans`}
                value={form.providerProductId}
                onChange={(e) => setForm({ ...form, providerProductId: e.target.value })}
              >
                <option value="">Select product</option>
                {eligibleProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.cpuCores} CPU / {p.ramGb} GB RAM / {p.storageGb} GB
                  </option>
                ))}
              </select>
              {form.planId && form.providerId && eligibleProducts.length === 0 && (
                <p className="mt-1 font-mono text-xs text-amber-400">No active product meets this plan's type and specifications.</p>
              )}
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                Priority (lower = first) *
                <input
                  required
                  type="number"
                  min="0"
                  className={`${input} mt-1.5 font-mono`}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                />
              </label>
              <label className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                Maximum provider cost (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={`${input} mt-1.5 font-mono`}
                  value={form.maxAllowedCost}
                  onChange={(e) => setForm({ ...form, maxAllowedCost: e.target.value })}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 font-sans text-sm text-[#F1E9DA]">
              <input
                type="checkbox"
                checked={form.isEnabled}
                onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
                className="rounded accent-[#C6A66B]"
              />
              Mapping enabled
            </label>

            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 font-mono text-xs text-amber-200">
              Automatic provider purchasing is intentionally OFF until provider API documentation and credentials are verified.
            </div>

            <div className="flex justify-end gap-2 border-t border-[#332f2a] pt-4">
              <button
                type="button"
                onClick={() => setModal(false)}
                className="rounded-xl border border-[#332f2a] bg-[#171717] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/70 hover:bg-[#292521]"
              >
                Cancel
              </button>
              <button
                disabled={saving || !eligibleProducts.some((p) => p.id === form.providerProductId)}
                className="rounded-xl bg-[#C6A66B] px-6 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Create Mapping"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
