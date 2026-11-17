
import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  RefreshCw,
  Pencil,
  Power,
  Server,
  X,
  AlertCircle,
} from "lucide-react";
import adminApi from "../adminApi";

type Provider = {
  id: string;
  name: string;
  code: string;
  baseUrl: string | null;
  isActive: boolean;
  apiPurchaseEnabled: boolean;
  priority: number;
  maxPurchaseAmount: string | number | null;
  currency: string;
  credentialsConfigured?: {
    username: boolean;
    password: boolean;
    apiKey: boolean;
    apiSecret: boolean;
  };
};

type ProviderForm = {
  name: string;
  code: string;
  baseUrl: string;
  priority: string;
  maxPurchaseAmount: string;
  currency: string;
  apiPurchaseEnabled: boolean;
  isActive: boolean;
  username: string;
  password: string;
  apiKey: string;
  apiSecret: string;
};

const emptyForm: ProviderForm = {
  name: "",
  code: "",
  baseUrl: "",
  priority: "100",
  maxPurchaseAmount: "",
  currency: "INR",
  apiPurchaseEnabled: false,
  isActive: true,
  username: "",
  password: "",
  apiKey: "",
  apiSecret: "",
};

export default function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form, setForm] = useState<ProviderForm>(emptyForm);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await adminApi.get("/admin/providers");
      setProviders(response.data.providers || []);
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to load providers."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const updateField = <K extends keyof ProviderForm>(
    field: K,
    value: ProviderForm[K]
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setModalOpen(true);
  };

  const openEdit = (provider: Provider) => {
    setEditing(provider);
    setForm({
      ...emptyForm,
      name: provider.name,
      code: provider.code,
      baseUrl: provider.baseUrl || "",
      priority: String(provider.priority),
      maxPurchaseAmount:
        provider.maxPurchaseAmount == null
          ? ""
          : String(provider.maxPurchaseAmount),
      currency: provider.currency || "INR",
      apiPurchaseEnabled: provider.apiPurchaseEnabled,
      isActive: provider.isActive,
    });
    setError("");
    setSuccess("");
    setModalOpen(true);
  };

  const saveProvider = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      baseUrl: form.baseUrl.trim() || null,
      priority: Number(form.priority),
      maxPurchaseAmount: form.maxPurchaseAmount
        ? Number(form.maxPurchaseAmount)
        : null,
      currency: form.currency.trim().toUpperCase(),
      apiPurchaseEnabled: form.apiPurchaseEnabled,
      isActive: form.isActive,
    };

    if (form.username) payload.username = form.username;
    if (form.password) payload.password = form.password;
    if (form.apiKey) payload.apiKey = form.apiKey;
    if (form.apiSecret) payload.apiSecret = form.apiSecret;

    try {
      if (editing) {
        await adminApi.patch(`/admin/providers/${editing.id}`, payload);
        setSuccess("Provider updated successfully.");
      } else {
        await adminApi.post("/admin/providers", payload);
        setSuccess("Provider created successfully.");
      }

      setModalOpen(false);
      setForm(emptyForm);
      await loadProviders();
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to save provider."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (provider: Provider) => {
    const action = provider.isActive ? "deactivate" : "activate";

    if (!window.confirm(`Are you sure you want to ${action} ${provider.name}?`)) {
      return;
    }

    try {
      await adminApi.patch(`/admin/providers/${provider.id}/status`, {
        isActive: !provider.isActive,
      });
      await loadProviders();
      setSuccess(`Provider ${action}d successfully.`);
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to update provider status."
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Provider Management</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage VPS infrastructure providers and API configuration.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadProviders}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
          >
            <Plus size={17} />
            Add Provider
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-5">
          <p className="text-sm text-slate-400">Total Providers</p>
          <p className="mt-3 text-3xl font-bold">{providers.length}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-5">
          <p className="text-sm text-slate-400">Active Providers</p>
          <p className="mt-3 text-3xl font-bold text-emerald-400">
            {providers.filter((p) => p.isActive).length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-5">
          <p className="text-sm text-slate-400">API Purchase Enabled</p>
          <p className="mt-3 text-3xl font-bold text-blue-400">
            {providers.filter((p) => p.apiPurchaseEnabled).length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#111a2b]">
        <div className="border-b border-slate-800 p-4">
          <h2 className="font-semibold">Configured Providers</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="mx-auto mb-3 animate-spin" />
            Loading providers...
          </div>
        ) : providers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Server className="mx-auto mb-3" size={34} />
            No providers configured yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-[#0d1525] text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-4">Provider</th>
                  <th className="px-5 py-4">Code</th>
                  <th className="px-5 py-4">Priority</th>
                  <th className="px-5 py-4">Max Purchase</th>
                  <th className="px-5 py-4">API Purchase</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {providers.map((provider) => (
                  <tr key={provider.id} className="hover:bg-slate-800/40">
                    <td className="px-5 py-4">
                      <p className="font-semibold">{provider.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {provider.baseUrl || "No API URL"}
                      </p>
                    </td>

                    <td className="px-5 py-4 font-mono text-blue-300">
                      {provider.code}
                    </td>

                    <td className="px-5 py-4">{provider.priority}</td>

                    <td className="px-5 py-4">
                      {provider.maxPurchaseAmount == null
                        ? "Not set"
                        : `${provider.currency} ${provider.maxPurchaseAmount}`}
                    </td>

                    <td className="px-5 py-4">
                      <span className={provider.apiPurchaseEnabled
                        ? "text-emerald-400"
                        : "text-slate-500"
                      }>
                        {provider.apiPurchaseEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <span className={provider.isActive
                        ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400"
                        : "rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-400"
                      }>
                        {provider.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          title="Edit provider"
                          onClick={() => openEdit(provider)}
                          className="rounded-lg border border-slate-700 p-2 text-blue-400 hover:bg-slate-700"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          title={provider.isActive ? "Deactivate" : "Activate"}
                          onClick={() => toggleStatus(provider)}
                          className="rounded-lg border border-slate-700 p-2 text-amber-400 hover:bg-slate-700"
                        >
                          <Power size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#111a2b] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  {editing ? "Edit Provider" : "Add Provider"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Provider credentials are encrypted by the backend.
                </p>
              </div>

              <button onClick={() => setModalOpen(false)}>
                <X />
              </button>
            </div>

            <form onSubmit={saveProvider} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs text-slate-400">Provider Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm outline-none focus:border-blue-500"
                    placeholder="SmartVPS"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs text-slate-400">Unique Code</label>
                  <input
                    required
                    disabled={!!editing}
                    value={form.code}
                    onChange={(e) => updateField("code", e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm outline-none focus:border-blue-500 disabled:opacity-50"
                    placeholder="SMARTVPS"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs text-slate-400">Base API URL</label>
                <input
                  type="url"
                  value={form.baseUrl}
                  onChange={(e) => updateField("baseUrl", e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm outline-none focus:border-blue-500"
                  placeholder="https://provider.example"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs text-slate-400">Priority</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.priority}
                    onChange={(e) => updateField("priority", e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs text-slate-400">Maximum Purchase Cost</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.maxPurchaseAmount}
                    onChange={(e) => updateField("maxPurchaseAmount", e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm"
                    placeholder="5000"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs text-slate-400">Currency</label>
                  <input
                    value={form.currency}
                    onChange={(e) => updateField("currency", e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm"
                    placeholder="INR"
                  />
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <h3 className="mb-3 font-semibold">API Credentials</h3>
                <p className="mb-4 text-xs text-slate-500">
                  Leave blank when editing to retain existing credentials.
                </p>

                {([
                  ["username", "Username"],
                  ["password", "Password"],
                  ["apiKey", "API Key"],
                  ["apiSecret", "API Secret"],
                ] as const).map(([field, label]) => (
                  <div key={field} className="mb-3">
                    <label className="mb-2 block text-xs text-slate-400">{label}</label>
                    <input
                      type={field.toLowerCase().includes("password") || field === "apiSecret" ? "password" : "text"}
                      autoComplete="off"
                      value={form[field]}
                      onChange={(e) => updateField(field, e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm outline-none focus:border-blue-500"
                      placeholder={`Enter ${label.toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-slate-800 pt-4">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => updateField("isActive", e.target.checked)}
                  />
                  Provider Active
                </label>

                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.apiPurchaseEnabled}
                    onChange={(e) => updateField("apiPurchaseEnabled", e.target.checked)}
                  />
                  Allow Automatic API Purchase
                </label>
                <p className="text-xs text-amber-400">
                  Keep automatic purchase disabled until provider API integration is verified.
                </p>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 pt-5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editing ? "Update Provider" : "Create Provider"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
