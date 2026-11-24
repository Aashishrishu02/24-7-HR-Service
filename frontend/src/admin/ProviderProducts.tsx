import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plus,
  RefreshCw,
  Pencil,
  Power,
  Server,
  X,
  AlertCircle,
  Search,
  Cpu,
  HardDrive,
  MemoryStick,
} from "lucide-react";
import adminApi from "../adminApi";

type Provider = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
};

type ProductType = "VPS_HOSTING" | "LINUX_IP_VPS";

type ProviderProduct = {
  id: string;
  providerId: string;
  externalProductId: string;
  name: string;
  productType: ProductType;
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  bandwidthGb: number | null;
  region: string | null;
  supportedOS: string[];
  isActive: boolean;
  provider?: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
  };
};

type ProductForm = {
  providerId: string;
  externalProductId: string;
  name: string;
  productType: ProductType;
  cpuCores: string;
  ramGb: string;
  storageGb: string;
  bandwidthGb: string;
  region: string;
  supportedOS: string;
  isActive: boolean;
};

const emptyForm: ProductForm = {
  providerId: "",
  externalProductId: "",
  name: "",
  productType: "VPS_HOSTING",
  cpuCores: "2",
  ramGb: "4",
  storageGb: "50",
  bandwidthGb: "",
  region: "",
  supportedOS: "Ubuntu 22.04, Ubuntu 24.04, Debian 12",
  isActive: true,
};

const inputClass =
  "w-full rounded-xl border border-[#332f2a] bg-[#171717] p-3 text-sm text-[#F1E9DA] outline-none placeholder:text-[#F1E9DA]/40 focus:border-[#C6A66B] focus:ring-1 focus:ring-[#C6A66B]/50 disabled:opacity-50";

export default function ProviderProducts() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [products, setProducts] = useState<ProviderProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [providerResponse, productResponse] = await Promise.all([
        adminApi.get("/admin/providers"),
        adminApi.get("/admin/provider-products"),
      ]);

      const providerRows = providerResponse.data?.providers ?? providerResponse.data ?? [];
      const productRows = productResponse.data?.products ?? [];

      setProviders(Array.isArray(providerRows) ? providerRows : []);
      setProducts(Array.isArray(productRows) ? productRows : []);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to load providers or provider products. Check backend module registration and API access."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateField = <K extends keyof ProductForm>(
    field: K,
    value: ProductForm[K]
  ) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      providerId: providers.find((provider) => provider.isActive)?.id || "",
    });
    setError("");
    setSuccess("");
    setModalOpen(true);
  };

  const openEdit = (product: ProviderProduct) => {
    setEditing(product);
    setForm({
      providerId: product.providerId,
      externalProductId: product.externalProductId,
      name: product.name,
      productType: product.productType,
      cpuCores: String(product.cpuCores),
      ramGb: String(product.ramGb),
      storageGb: String(product.storageGb),
      bandwidthGb:
        product.bandwidthGb == null ? "" : String(product.bandwidthGb),
      region: product.region || "",
      supportedOS: (product.supportedOS || []).join(", "),
      isActive: product.isActive,
    });
    setError("");
    setSuccess("");
    setModalOpen(true);
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const supportedOS = form.supportedOS
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (supportedOS.length === 0) {
      setError("Add at least one supported operating system.");
      setSaving(false);
      return;
    }

    const payload = {
      ...(editing ? {} : { providerId: form.providerId }),
      externalProductId: form.externalProductId.trim(),
      name: form.name.trim(),
      productType: form.productType,
      cpuCores: Number(form.cpuCores),
      ramGb: Number(form.ramGb),
      storageGb: Number(form.storageGb),
      ...(form.bandwidthGb.trim()
        ? { bandwidthGb: Number(form.bandwidthGb) }
        : {}),
      ...(form.region.trim() ? { region: form.region.trim() } : {}),
      supportedOS,
      isActive: form.isActive,
    };

    try {
      if (editing) {
        await adminApi.patch(
          `/admin/provider-products/${editing.id}`,
          payload
        );
        setSuccess("Provider product updated successfully.");
      } else {
        await adminApi.post("/admin/provider-products", payload);
        setSuccess("Provider product created successfully.");
      }
      setModalOpen(false);
      setForm(emptyForm);
      await loadData();
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to save provider product."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (product: ProviderProduct) => {
    const action = product.isActive ? "deactivate" : "activate";
    if (
      !window.confirm(
        `Are you sure you want to ${action} "${product.name}"?`
      )
    ) {
      return;
    }

    setError("");
    setSuccess("");
    try {
      await adminApi.patch(
        `/admin/provider-products/${product.id}/status`,
        { isActive: !product.isActive }
      );
      setSuccess(`Product ${action}d successfully.`);
      await loadData();
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to update product status."
      );
    }
  };

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.externalProductId.toLowerCase().includes(query) ||
        (product.provider?.name || "").toLowerCase().includes(query);
      const matchesProvider =
        !providerFilter || product.providerId === providerFilter;
      const matchesType =
        !typeFilter || product.productType === typeFilter;
      const matchesStatus =
        !statusFilter ||
        String(product.isActive) === statusFilter;
      return (
        matchesSearch &&
        matchesProvider &&
        matchesType &&
        matchesStatus
      );
    });
  }, [products, search, providerFilter, typeFilter, statusFilter]);

  const activeProviders = providers.filter((provider) => provider.isActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">Provider Products</h1>
          <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">
            Configure VPS products offered by your infrastructure providers.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2 font-mono text-xs font-semibold text-[#F1E9DA] transition hover:bg-[#201d1a] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={openCreate}
            disabled={activeProviders.length === 0}
            className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-sm transition hover:bg-[#d8b87d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={15} />
            Add Product
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 font-mono text-xs text-red-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{Array.isArray(error) ? error.join(", ") : error}</span>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-[#C6A66B]/30 bg-[#C6A66B]/10 p-3.5 font-mono text-xs text-[#C6A66B]">
          {success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Total Products</p>
          <p className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA]">{products.length}</p>
        </div>
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Active Products</p>
          <p className="mt-2 font-serif text-2xl font-bold text-[#C6A66B]">
            {products.filter((product) => product.isActive).length}
          </p>
        </div>
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Inactive Products</p>
          <p className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA]/40">
            {products.filter((product) => !product.isActive).length}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-3.5 text-[#F1E9DA]/40"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product or external ID..."
              className={`${inputClass} pl-10`}
            />
          </div>
          <select
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value)}
            className={inputClass}
          >
            <option value="">All providers</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} ({provider.code})
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className={inputClass}
          >
            <option value="">All product types</option>
            <option value="VPS_HOSTING">VPS Hosting</option>
            <option value="LINUX_IP_VPS">Linux IP VPS</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={inputClass}
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a] shadow-sm">
        <div className="flex items-center justify-between border-b border-[#332f2a] px-5 py-3.5">
          <h2 className="font-serif text-sm font-bold text-[#F1E9DA]">Configured Provider Products</h2>
          <span className="font-mono text-xs text-[#F1E9DA]/50">
            {filteredProducts.length} products
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center font-mono text-xs text-[#F1E9DA]/60">
            <RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]" />
            Loading provider products...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center font-mono text-xs text-[#F1E9DA]/60">
            <Server className="mx-auto mb-3 text-[#C6A66B]/40" size={34} />
            No provider products found.
            <p className="mt-2 text-[11px] text-[#F1E9DA]/40">
              Add a product after configuring an active provider.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/60">
                <tr>
                  <th className="px-5 py-3.5">Product</th>
                  <th className="px-5 py-3.5">Provider</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">CPU</th>
                  <th className="px-5 py-3.5">RAM</th>
                  <th className="px-5 py-3.5">Storage</th>
                  <th className="px-5 py-3.5">Region</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#332f2a]">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="transition hover:bg-[#292521]/60">
                    <td className="px-5 py-4">
                      <p className="font-medium text-[#F1E9DA]">{product.name}</p>
                      <p className="mt-1 font-mono text-xs text-[#F1E9DA]/50">
                        {product.externalProductId}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-[#F1E9DA]">{product.provider?.name || "Unknown provider"}</p>
                      <p className="mt-1 font-mono text-xs text-[#F1E9DA]/50">
                        {product.provider?.code || ""}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/80">
                      {product.productType === "VPS_HOSTING"
                        ? "VPS Hosting"
                        : "Linux IP VPS"}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/80">{product.cpuCores} vCPU</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/80">{product.ramGb} GB</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/80">{product.storageGb} GB</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/80">{product.region || "—"}</td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          product.isActive
                            ? "inline-block rounded-full border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-[#C6A66B]"
                            : "inline-block rounded-full border border-[#332f2a] bg-[#171717] px-2.5 py-1 font-mono text-[10px] text-[#F1E9DA]/40"
                        }
                      >
                        {product.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          title="Edit product"
                          onClick={() => openEdit(product)}
                          className="rounded-xl border border-[#332f2a] bg-[#171717] p-2 text-[#C6A66B] transition hover:bg-[#201d1a]"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          title={product.isActive ? "Deactivate" : "Activate"}
                          onClick={() => toggleStatus(product)}
                          className="rounded-xl border border-[#332f2a] bg-[#171717] p-2 text-amber-400 transition hover:bg-[#201d1a]"
                        >
                          <Power size={15} />
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 text-[#F1E9DA] shadow-2xl">
            <div className="mb-6 flex items-center justify-between border-b border-[#332f2a] pb-3">
              <div>
                <h2 className="font-serif text-xl font-bold text-[#F1E9DA]">
                  {editing ? "Edit Provider Product" : "Add Provider Product"}
                </h2>
                <p className="mt-0.5 font-mono text-xs text-[#F1E9DA]/50">
                  Enter the product specifications exactly as defined by the provider.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-[#F1E9DA]/50 transition hover:bg-[#292521] hover:text-[#F1E9DA]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveProduct} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                    Provider
                  </label>
                  <select
                    required
                    disabled={!!editing}
                    value={form.providerId}
                    onChange={(event) =>
                      updateField("providerId", event.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Select provider</option>
                    {activeProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} ({provider.code})
                      </option>
                    ))}
                    {editing &&
                      !activeProviders.some(
                        (provider) => provider.id === form.providerId
                      ) && (
                        <option value={form.providerId}>
                          {editing.provider?.name || "Current provider"}
                        </option>
                      )}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                    External Product ID
                  </label>
                  <input
                    required
                    value={form.externalProductId}
                    onChange={(event) =>
                      updateField("externalProductId", event.target.value)
                    }
                    className={inputClass}
                    placeholder="e.g. VPS-2C-4G-IN"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                    Product Name
                  </label>
                  <input
                    required
                    minLength={2}
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    className={inputClass}
                    placeholder="2 vCPU / 4 GB RAM VPS"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                    Product Type
                  </label>
                  <select
                    value={form.productType}
                    onChange={(event) =>
                      updateField(
                        "productType",
                        event.target.value as ProductType
                      )
                    }
                    className={inputClass}
                  >
                    <option value="VPS_HOSTING">VPS Hosting</option>
                    <option value="LINUX_IP_VPS">Linux IP VPS</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                    Region
                  </label>
                  <input
                    value={form.region}
                    onChange={(event) => updateField("region", event.target.value)}
                    className={inputClass}
                    placeholder="Mumbai, India"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                    <Cpu size={14} className="text-[#C6A66B]" /> CPU Cores
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={form.cpuCores}
                    onChange={(event) =>
                      updateField("cpuCores", event.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                    <MemoryStick size={14} className="text-[#C6A66B]" /> RAM (GB)
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={form.ramGb}
                    onChange={(event) =>
                      updateField("ramGb", event.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                    <HardDrive size={14} className="text-[#C6A66B]" /> Storage (GB)
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={form.storageGb}
                    onChange={(event) =>
                      updateField("storageGb", event.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                    Bandwidth (GB)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.bandwidthGb}
                    onChange={(event) =>
                      updateField("bandwidthGb", event.target.value)
                    }
                    className={inputClass}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                  Supported Operating Systems
                </label>
                <textarea
                  required
                  rows={3}
                  value={form.supportedOS}
                  onChange={(event) =>
                    updateField("supportedOS", event.target.value)
                  }
                  className={inputClass}
                  placeholder={"Ubuntu 22.04, Ubuntu 24.04, Debian 12"}
                />
                <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/40">
                  Separate OS names with commas or new lines.
                </p>
              </div>

              <label className="flex items-center gap-2.5 border-t border-[#332f2a] pt-4 font-mono text-xs text-[#F1E9DA]/80">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    updateField("isActive", event.target.checked)
                  }
                  className="h-4 w-4 rounded border-[#332f2a] bg-[#171717] accent-[#C6A66B]"
                />
                Product Active
              </label>

              <div className="flex justify-end gap-2.5 border-t border-[#332f2a] pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2 font-mono text-xs font-semibold text-[#F1E9DA] transition hover:bg-[#292521]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || (!editing && !form.providerId)}
                  className="rounded-xl bg-[#C6A66B] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-sm transition hover:bg-[#d8b87d] disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Update Product"
                      : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
