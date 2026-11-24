import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plus,
  RefreshCw,
  X,
  AlertCircle,
  CheckCircle2,
  Server,
  Cloud,
  Power,
  Trash2,
  Layers,
  ArrowRight,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Database,
  Wallet,
  ChevronDown,
} from "lucide-react";
import adminApi from "../adminApi";

type Plan = {
  id: string;
  name: string;
  productType: string;
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  bandwidthGb?: number | null;
  price: string | number;
  durationDays: number;
  isActive: boolean;
};

type Zone = {
  id: string;
  name: string;
  location?: string;
  country?: string;
  status?: string;
};

type Iso = {
  id: string;
  isoName: string;
  osType: string;
  version?: string;
};

type PricingItem = {
  id: string;
  label: string;
  cores?: number;
  ram?: number;
  disk?: number;
  bandwidth?: number;
  price: number;
};

type CataloguePricing = {
  shared: {
    cpu: PricingItem[];
    ram: PricingItem[];
    disk: PricingItem[];
    bandwidth: PricingItem[];
  };
  dedicated: {
    cpu: PricingItem[];
    ram: PricingItem[];
    disk: PricingItem[];
    bandwidth: PricingItem[];
  };
};

type HostHeavenMappingRecord = {
  id: string;
  planId: string;
  externalConfigId?: string;
  isCostVerified: boolean;
  costStatus: string;
  isMixedConfiguration?: boolean;
  lastSyncedAt?: string;
  zoneId: string;
  zoneName?: string;
  zoneIsoId: string;
  isoName?: string;
  planType: "SHARED" | "DEDICATED";
  cpuPricingId: string;
  cpuName?: string;
  ramPricingId: string;
  ramName?: string;
  diskPricingId: string;
  diskName?: string;
  bandwidthPricingId: string;
  bandwidthName?: string;
  providerCost: string | number;
  profitMarginPercent: number;
  calculatedSellingPrice: number;
  grossProfit: number;
  billingDurationDays?: number;
  billingDurationMonths?: number;
  pricingDetails?: {
    billingUnit?: string;
    pricingSource?: string;
    rates?: {
      cpu: number;
      ram: number;
      disk: number;
      bandwidth: number;
    };
    totalHourlyRate?: number;
    hoursPerMonth?: number;
    monthlyProviderCost?: number;
    totalProviderCost?: number;
    formula?: string;
  };
  currency: string;
  isActive: boolean;
  createdAt: string;
  plan?: Plan;
};

type FormState = {
  planId: string;
  zoneId: string;
  zoneName: string;
  zoneIsoId: string;
  isoName: string;
  planType: "SHARED" | "DEDICATED";
  cpuPricingId: string;
  cpuName: string;
  cpuPrice: number | "";
  ramPricingId: string;
  ramName: string;
  ramPrice: number | "";
  diskPricingId: string;
  diskName: string;
  diskPrice: number | "";
  bandwidthPricingId: string;
  bandwidthName: string;
  bandwidthPrice: number | "";
  customProviderCost: string;
  isActive: boolean;
};

const initialForm: FormState = {
  planId: "",
  zoneId: "",
  zoneName: "",
  zoneIsoId: "",
  isoName: "",
  planType: "SHARED",
  cpuPricingId: "",
  cpuName: "",
  cpuPrice: "",
  ramPricingId: "",
  ramName: "",
  ramPrice: "",
  diskPricingId: "",
  diskName: "",
  diskPrice: "",
  bandwidthPricingId: "",
  bandwidthName: "",
  bandwidthPrice: "",
  customProviderCost: "",
  isActive: true,
};

const inputClass =
  "w-full rounded-xl border border-[#332f2a] bg-[#171717] p-3 font-sans text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 outline-none transition focus:border-[#C6A66B] focus:ring-1 focus:ring-[#C6A66B]";

export default function HostHeavenMapping() {
  const [mappings, setMappings] = useState<HostHeavenMappingRecord[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [isos, setIsos] = useState<Iso[]>([]);
  const [pricing, setPricing] = useState<CataloguePricing | null>(null);
  const [profitMargin, setProfitMargin] = useState<number>(20);
  const [marginInput, setMarginInput] = useState("20");
  const [savingMargin, setSavingMargin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingIsos, setLoadingIsos] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    status: string;
    lastSyncedAt: string | null;
    error: string | null;
    isSyncInProgress: boolean;
    stats: any;
    rawCatalogue: any;
  } | null>(null);

  // Tab & Filter states
  const [activeTab, setActiveTab] = useState<"CONFIGURATIONS" | "RAW_CATALOGUE">("CONFIGURATIONS");
  const [filterTab, setFilterTab] = useState<"ALL" | "VERIFIED" | "PENDING" | "INACTIVE">("ALL");

  // Confirm Provider Cost Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [targetMappingToConfirm, setTargetMappingToConfirm] = useState<HostHeavenMappingRecord | null>(null);
  const [confirmCostInput, setConfirmCostInput] = useState<string>("");
  const [confirmingCost, setConfirmingCost] = useState(false);

  const [form, setForm] = useState<FormState>(initialForm);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [mappingsRes, plansRes, catalogueRes, syncStatusRes] = await Promise.all([
        adminApi.get("/admin/hostheaven/mappings"),
        adminApi.get("/admin/plans"),
        adminApi.get("/admin/hostheaven/catalogue").catch(() => ({
          data: { zones: [], pricing: null },
        })),
        adminApi.get("/admin/hostheaven/mappings/sync/status").catch(() => ({
          data: null,
        })),
      ]);

      setMappings(mappingsRes.data.mappings || []);
      const margin = Number(mappingsRes.data?.currentProfitMarginPercent ?? 20);
      setProfitMargin(margin);
      setMarginInput(String(margin));

      const allPlans: Plan[] = plansRes.data.plans || [];
      setPlans(allPlans.filter((p) => p.isActive));

      const catZones: Zone[] = catalogueRes.data?.zones || [];
      setZones(catZones);

      if (catalogueRes.data?.pricing) {
        setPricing(catalogueRes.data.pricing);
      }

      if (syncStatusRes.data) {
        setSyncStatus(syncStatusRes.data);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to load HostHeaven mapping data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveProfitMargin = async () => {
    const margin = Number(marginInput);

    if (
      marginInput.trim() === "" ||
      !Number.isFinite(margin) ||
      margin < 0 ||
      margin > 80
    ) {
      setError("HostHeaven profit margin must be between 0% and 80%.");
      return;
    }

    setSavingMargin(true);
    setError("");
    setSuccess("");

    try {
      const res = await adminApi.put(
        "/admin/hostheaven/mappings/profit-margin",
        { profitMarginPercent: margin },
      );

      const savedMargin = Number(res.data?.profitMarginPercent ?? margin);
      setProfitMargin(savedMargin);
      setMarginInput(String(savedMargin));
      setSuccess(
        `HostHeaven profit margin updated to ${savedMargin}%.`,
      );
      await loadData();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Failed to update HostHeaven profit margin.",
      );
    } finally {
      setSavingMargin(false);
    }
  };

  // Trigger manual sync
  const handleSyncNow = async () => {
    setSyncing(true);
    setError("");
    setSuccess("");
    try {
      const res = await adminApi.post("/admin/hostheaven/mappings/sync");
      if (res.data.success) {
        setSuccess(res.data.message || "HostHeaven catalogue synchronized successfully.");
      } else {
        setError(res.data.message || res.data.error || "Sync could not be completed.");
      }
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to trigger catalogue synchronization.");
    } finally {
      setSyncing(false);
    }
  };

  // Open confirm cost modal
  const openConfirmModal = (mapping: HostHeavenMappingRecord) => {
    setTargetMappingToConfirm(mapping);
    setConfirmCostInput(String(mapping.providerCost || ""));
    setConfirmModalOpen(true);
  };

  // Submit confirmed cost
  const handleConfirmCostSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetMappingToConfirm) return;
    const cost = Number(confirmCostInput);
    if (isNaN(cost) || cost <= 0) {
      setError("Please enter a valid provider cost in INR.");
      return;
    }

    setConfirmingCost(true);
    setError("");
    setSuccess("");
    try {
      const res = await adminApi.post(
        `/admin/hostheaven/mappings/${targetMappingToConfirm.id}/confirm-cost`,
        { providerCost: cost },
      );
      setSuccess(
        `Provider cost confirmed! Customer price published at ₹${res.data.customerSellingPrice.toLocaleString()} (${profitMargin}% margin).`,
      );
      setConfirmModalOpen(false);
      setTargetMappingToConfirm(null);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to confirm provider cost.");
    } finally {
      setConfirmingCost(false);
    }
  };

  // Load ISOs when zone changes in modal
  const handleZoneChange = async (zoneId: string) => {
    const matchedZone = zones.find((z) => z.id === zoneId);
    setForm((prev) => ({
      ...prev,
      zoneId,
      zoneName: matchedZone?.name || "",
      zoneIsoId: "",
      isoName: "",
    }));

    if (!zoneId) {
      setIsos([]);
      return;
    }

    setLoadingIsos(true);
    try {
      const res = await adminApi.get(
        `/admin/hostheaven/zones/${encodeURIComponent(zoneId)}/isos`,
      );
      setIsos(res.data || []);
    } catch {
      setIsos([]);
    } finally {
      setLoadingIsos(false);
    }
  };

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === form.planId),
    [plans, form.planId],
  );

  const currentPricing = useMemo(() => {
    if (!pricing) return null;
    return form.planType === "DEDICATED" ? pricing.dedicated : pricing.shared;
  }, [pricing, form.planType]);

  const calculation = useMemo(() => {
    const durationDays = selectedPlan?.durationDays || 30;
    const months = durationDays === 365 ? 12 : Math.max(1, Math.round(durationDays / 30));
    const totalHourlyRate =
      (form.cpuPrice || 0) +
      (form.ramPrice || 0) +
      (form.diskPrice || 0) +
      (form.bandwidthPrice || 0);

    const monthlyCost = Math.round((totalHourlyRate * 720 + Number.EPSILON) * 100) / 100;
    const autoCost = Math.round((monthlyCost * months + Number.EPSILON) * 100) / 100;
    const providerCost =
      form.customProviderCost !== "" && !isNaN(Number(form.customProviderCost))
        ? Math.max(0, Math.round((Number(form.customProviderCost) + Number.EPSILON) * 100) / 100)
        : autoCost;

    const marginDecimal = profitMargin / 100;
    const sellingPrice =
      marginDecimal < 1
        ? Math.round(((providerCost / (1 - marginDecimal)) + Number.EPSILON) * 100) / 100
        : providerCost * 1.25;

    const grossProfit = Math.round((sellingPrice - providerCost + Number.EPSILON) * 100) / 100;

    return {
      durationDays,
      months,
      totalHourlyRate,
      monthlyCost,
      autoCost,
      providerCost,
      profitMarginPercent: profitMargin,
      sellingPrice,
      grossProfit,
    };
  }, [
    selectedPlan,
    form.cpuPrice,
    form.ramPrice,
    form.diskPrice,
    form.bandwidthPrice,
    form.customProviderCost,
    profitMargin,
  ]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.planId) {
      setError("Please select a VPS Plan.");
      return;
    }
    if (!form.zoneId || !form.zoneIsoId) {
      setError("Please select both a HostHeaven Zone and Operating System ISO.");
      return;
    }
    if (
      !form.cpuPricingId ||
      !form.ramPricingId ||
      !form.diskPricingId ||
      !form.bandwidthPricingId
    ) {
      setError("Please select all 4 resource catalogue items (CPU, RAM, Disk, Bandwidth).");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await adminApi.post("/admin/hostheaven/mappings", {
        planId: form.planId,
        zoneId: form.zoneId,
        zoneName: form.zoneName,
        zoneIsoId: form.zoneIsoId,
        isoName: form.isoName,
        planType: form.planType,
        cpuPricingId: form.cpuPricingId,
        cpuName: form.cpuName,
        ramPricingId: form.ramPricingId,
        ramName: form.ramName,
        diskPricingId: form.diskPricingId,
        diskName: form.diskName,
        bandwidthPricingId: form.bandwidthPricingId,
        bandwidthName: form.bandwidthName,
        providerCost: calculation.providerCost,
        isActive: form.isActive,
      });

      setSuccess(
        `HostHeaven mapping saved! Customer selling price updated to ₹${calculation.sellingPrice.toLocaleString()} (${profitMargin}% margin).`,
      );
      setModalOpen(false);
      setForm(initialForm);
      await loadData();
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Failed to save HostHeaven plan mapping.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (mapping: HostHeavenMappingRecord) => {
    if (!mapping.isActive && !mapping.isCostVerified) {
      setError("Cannot activate an unverified configuration. Please confirm the provider cost first.");
      return;
    }

    const action = mapping.isActive ? "deactivate" : "activate";
    if (
      !window.confirm(
        `Are you sure you want to ${action} HostHeaven mapping for "${mapping.plan?.name || "this plan"}"?`,
      )
    ) {
      return;
    }

    try {
      await adminApi.patch(`/admin/hostheaven/mappings/${mapping.id}/status`, {
        isActive: !mapping.isActive,
      });
      setSuccess(`Mapping ${action}d successfully.`);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || "Status update failed.");
    }
  };

  const handleDelete = async (mapping: HostHeavenMappingRecord) => {
    if (
      !window.confirm(
        `Delete HostHeaven mapping for "${mapping.plan?.name || "this plan"}"? The VPS plan will be deactivated.`,
      )
    ) {
      return;
    }

    try {
      await adminApi.delete(`/admin/hostheaven/mappings/${mapping.id}`);
      setSuccess("HostHeaven mapping deleted.");
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || "Delete failed.");
    }
  };

  const filteredMappings = useMemo(() => {
    if (filterTab === "VERIFIED") {
      return mappings.filter((m) => m.isCostVerified && m.isActive);
    }
    if (filterTab === "PENDING") {
      return mappings.filter((m) => !m.isCostVerified);
    }
    if (filterTab === "INACTIVE") {
      return mappings.filter((m) => !m.isActive);
    }
    return mappings;
  }, [mappings, filterTab]);

  const verifiedCount = useMemo(() => mappings.filter((m) => m.isCostVerified && m.isActive).length, [mappings]);
  const pendingCount = useMemo(() => mappings.filter((m) => !m.isCostVerified).length, [mappings]);
  const inactiveCount = useMemo(() => mappings.filter((m) => !m.isActive).length, [mappings]);

  return (
    <div className="space-y-6">
      {/* HEADER & SYNC CONTROLS */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">
            <Cloud className="text-[#C6A66B]" size={26} />
            HostHeaven Dynamic Catalogue & Pricing
          </h1>
          <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">
            Automatically synchronizes HostHeaven zones, OS, and resource pricing catalogues using the current admin-configured gross profit margin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSyncNow}
            disabled={syncing || loading}
            className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-sm transition hover:bg-[#d8b87d] disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Refreshing Catalogue..." : "Refresh Catalogue"}
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-xs font-semibold text-[#F1E9DA] transition hover:bg-[#201d1a] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={() => {
              setForm(initialForm);
              setModalOpen(true);
              setError("");
            }}
            className="flex items-center gap-2 rounded-xl border border-[#C6A66B]/50 bg-[#C6A66B]/10 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B] transition hover:bg-[#C6A66B]/20"
          >
            <Plus size={14} />
            Manual Mapping
          </button>
        </div>
      </div>

      {/* SYNC STATUS BANNER */}
      {syncStatus && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
                syncStatus.status === "SUCCESS"
                  ? "border border-[#C6A66B]/30 bg-[#C6A66B]/10 text-[#C6A66B]"
                  : syncStatus.status === "IN_PROGRESS"
                  ? "border border-amber-500/20 bg-amber-500/10 text-amber-400"
                  : "border border-red-500/20 bg-red-500/10 text-red-400"
              }`}
            >
              <Clock size={12} />
              Sync Status: {syncStatus.status}
            </span>

            {syncStatus.lastSyncedAt && (
              <span className="text-[#F1E9DA]/60">
                Last Synced:{" "}
                <span className="font-medium text-[#F1E9DA]">
                  {new Date(syncStatus.lastSyncedAt).toLocaleString()}
                </span>
              </span>
            )}

            {(syncStatus.stats?.walletBalance !== undefined ||
              syncStatus.rawCatalogue?.wallet?.balance !== undefined) && (
              <span className="flex items-center gap-1.5 rounded-full border border-[#C6A66B]/30 bg-[#171717] px-2.5 py-1 font-mono font-semibold text-[#C6A66B]">
                <Wallet size={12} />
                HostHeaven Wallet: ₹
                {Number(
                  syncStatus.stats?.walletBalance ??
                    syncStatus.rawCatalogue?.wallet?.balance ??
                    0,
                ).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>

          {syncStatus.stats && (
            <div className="flex flex-wrap items-center gap-4 text-[#F1E9DA]/70 font-mono text-xs">
              <span>
                Zones: <strong className="text-[#F1E9DA]">{syncStatus.stats.activeZones} Active</strong> / {syncStatus.stats.totalZones} Total
              </span>
              <span>
                ISOs: <strong className="text-[#F1E9DA]">{syncStatus.stats.totalIsos}</strong>
              </span>
              <span>
                Discovered: <strong className="text-[#C6A66B]">{syncStatus.stats.configurationsFound}</strong>
              </span>
              <span>
                Published: <strong className="text-[#C6A66B]">{syncStatus.stats.verifiedConfigsCount}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-mono text-red-300">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-[#C6A66B]/30 bg-[#C6A66B]/10 p-4 text-xs font-mono text-[#C6A66B]">
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}

      {/* HOSTHEAVEN PROFIT MARGIN CONTROL */}
      <div className="rounded-2xl border border-[#C6A66B]/30 bg-[#201d1a] p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <h2 className="font-serif text-lg font-bold text-[#F1E9DA]">
              HostHeaven Profit Margin
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#F1E9DA]/60">
              Configure the gross profit margin used for HostHeaven customer
              pricing across live catalogue, mapped plans and checkout.
              Allowed range: 0% to 80%.
            </p>
            <p className="mt-2 font-mono text-xs text-[#C6A66B]">
              Current active margin: {profitMargin}%
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[260px] sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/60">
                Gross Profit Margin (%)
              </label>
              <input
                type="number"
                min={0}
                max={80}
                step={1}
                value={marginInput}
                onChange={(e) => setMarginInput(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-sm text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveProfitMargin}
              disabled={savingMargin || loading}
              className="rounded-xl bg-[#C6A66B] px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d] disabled:opacity-50"
            >
              {savingMargin ? "Saving..." : "Save Margin"}
            </button>
          </div>
        </div>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Total Synchronized Plans</p>
          <p className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA]">{mappings.length}</p>
        </div>
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Verified & Published</p>
          <p className="mt-2 font-serif text-2xl font-bold text-[#C6A66B]">{verifiedCount}</p>
        </div>
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Pending Verification</p>
          <p className="mt-2 font-serif text-2xl font-bold text-amber-400">{pendingCount}</p>
        </div>
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Gross Margin Policy</p>
          <p className="mt-2 font-serif text-2xl font-bold text-[#C6A66B]">{profitMargin}%</p>
        </div>
      </div>

      {/* VIEW TABS */}
      <div className="flex items-center gap-2 border-b border-[#332f2a] pb-3">
        <button
          onClick={() => setActiveTab("CONFIGURATIONS")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${
            activeTab === "CONFIGURATIONS"
              ? "bg-[#C6A66B] text-[#171717]"
              : "border border-[#332f2a] bg-[#171717] text-[#F1E9DA]/60 hover:bg-[#201d1a] hover:text-[#F1E9DA]"
          }`}
        >
          <Layers size={14} />
          Synchronized VPS Plans & Pricing ({mappings.length})
        </button>

        <button
          onClick={() => setActiveTab("RAW_CATALOGUE")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${
            activeTab === "RAW_CATALOGUE"
              ? "bg-[#C6A66B] text-[#171717]"
              : "border border-[#332f2a] bg-[#171717] text-[#F1E9DA]/60 hover:bg-[#201d1a] hover:text-[#F1E9DA]"
          }`}
        >
          <Database size={14} />
          Raw HostHeaven Catalogues (Zones, OS, Pricing)
        </button>
      </div>

      {/* TAB 1: CONFIGURATIONS LIST */}
      {activeTab === "CONFIGURATIONS" && (
        <div className="space-y-4">
          {/* FILTER PILLS */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="mr-1 font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Filter Catalogue:</span>
            <button
              onClick={() => setFilterTab("ALL")}
              className={`rounded-xl px-3 py-1.5 font-mono text-xs transition ${
                filterTab === "ALL"
                  ? "bg-[#C6A66B] font-bold text-[#171717]"
                  : "border border-[#332f2a] bg-[#171717] text-[#F1E9DA]/60 hover:bg-[#201d1a] hover:text-[#F1E9DA]"
              }`}
            >
              All Plans ({mappings.length})
            </button>
            <button
              onClick={() => setFilterTab("VERIFIED")}
              className={`rounded-xl px-3 py-1.5 font-mono text-xs transition ${
                filterTab === "VERIFIED"
                  ? "border border-[#C6A66B]/50 bg-[#C6A66B]/20 font-bold text-[#C6A66B]"
                  : "border border-[#332f2a] bg-[#171717] text-[#C6A66B]/70 hover:bg-[#201d1a] hover:text-[#C6A66B]"
              }`}
            >
              Verified & Published ({verifiedCount})
            </button>
            <button
              onClick={() => setFilterTab("PENDING")}
              className={`rounded-xl px-3 py-1.5 font-mono text-xs transition ${
                filterTab === "PENDING"
                  ? "border border-amber-500/50 bg-amber-500/20 font-bold text-amber-400"
                  : "border border-[#332f2a] bg-[#171717] text-amber-400/70 hover:bg-[#201d1a] hover:text-amber-400"
              }`}
            >
              Pending Verification ({pendingCount})
            </button>
            <button
              onClick={() => setFilterTab("INACTIVE")}
              className={`rounded-xl px-3 py-1.5 font-mono text-xs transition ${
                filterTab === "INACTIVE"
                  ? "border border-red-500/50 bg-red-500/20 font-bold text-red-400"
                  : "border border-[#332f2a] bg-[#171717] text-red-400/70 hover:bg-[#201d1a] hover:text-red-400"
              }`}
            >
              Inactive ({inactiveCount})
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a] shadow-sm">
            {loading ? (
              <div className="p-12 text-center font-mono text-xs text-[#F1E9DA]/60">
                <RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]" size={24} />
                Loading catalogue configurations...
              </div>
            ) : filteredMappings.length === 0 ? (
              <div className="p-12 text-center font-mono text-xs text-[#F1E9DA]/60">
                <Server className="mx-auto mb-3 text-[#C6A66B]/40" size={34} />
                No plans match the selected filter. Click "Refresh Catalogue" to auto-discover plans from HostHeaven.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/60">
                    <tr>
                      <th className="px-5 py-3.5">VPS Plan Specs</th>
                      <th className="px-5 py-3.5">Zone & OS</th>
                      <th className="px-5 py-3.5">Monthly HostHeaven Cost</th>
                      <th className="px-5 py-3.5">Customer Selling Price ({profitMargin}% Margin)</th>
                      <th className="px-5 py-3.5">Resource Rate Breakdown</th>
                      <th className="px-5 py-3.5">Publishing Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#332f2a]">
                    {filteredMappings.map((m) => (
                      <tr key={m.id} className="transition hover:bg-[#292521]/60">
                        <td className="px-5 py-4">
                          <p className="font-medium text-[#F1E9DA]">
                            {m.plan?.name || "Unnamed VPS Plan"}
                          </p>
                          <p className="font-mono text-xs text-[#F1E9DA]/60">
                            {m.plan?.cpuCores} vCPU · {m.plan?.ramGb} GB RAM · {m.plan?.storageGb} GB NVMe
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-block rounded-md border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#C6A66B]">
                              {m.planType} TIER
                            </span>
                            {m.isMixedConfiguration && (
                              <span className="inline-block rounded-md border border-red-500/30 bg-red-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-red-300">
                                MIXED RESOURCE ERROR (INVALID)
                              </span>
                            )}
                            <span className="inline-block rounded-md border border-[#332f2a] bg-[#171717] px-2 py-0.5 font-mono text-[10px] text-[#F1E9DA]/60">
                              Duration: {m.plan?.durationDays ?? 30} Days ({(m.plan?.durationDays ?? 30) === 365 ? 12 : Math.max(1, Math.round((m.plan?.durationDays ?? 30) / 30))} mo)
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-medium text-[#F1E9DA]">
                            {m.zoneName || m.zoneId}
                          </p>
                          <p className="font-mono text-xs text-[#F1E9DA]/60">
                            {m.isoName || m.zoneIsoId}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                            Monthly Provider Cost:
                          </p>
                          <div className="mt-0.5 font-mono text-base font-bold text-[#F1E9DA]">
                            ₹{Number(m.providerCost).toFixed(2)}
                            <span className="text-xs font-normal text-[#F1E9DA]/50">/mo</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {m.pricingDetails?.pricingSource === "AUTHORITATIVE_MONTHLY" ? (
                              <span className="inline-block rounded-md border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#C6A66B]">
                                Authoritative Monthly
                              </span>
                            ) : (
                              <span className="inline-block rounded-md border border-[#332f2a] bg-[#171717] px-1.5 py-0.5 font-mono text-[10px] text-[#F1E9DA]/60">
                                Calculated (720h)
                              </span>
                            )}
                            {m.isCostVerified ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#C6A66B]">
                                <ShieldCheck size={12} />
                                Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-amber-400">
                                <AlertTriangle size={12} />
                                ESTIMATED
                              </span>
                            )}
                          </div>
                          {m.lastSyncedAt && (
                            <p className="mt-1 font-mono text-[10px] text-[#F1E9DA]/40">
                              Synced: {new Date(m.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                            Customer Monthly Price:
                          </p>
                          <p className="mt-0.5 font-mono text-base font-bold text-[#C6A66B]">
                            ₹{Number(m.calculatedSellingPrice).toFixed(2)}
                            <span className="text-xs font-normal text-[#C6A66B]/70">/mo</span>
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-[#F1E9DA]/70">
                            Gross Profit: ₹{Number(m.grossProfit).toFixed(2)} ({profitMargin}%)
                          </p>
                          <p className="font-mono text-[10px] text-[#F1E9DA]/40">
                            ₹{Number(m.providerCost).toFixed(2)} / (1 - {profitMargin / 100}) = ₹{Number(m.calculatedSellingPrice).toFixed(2)}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-xs min-w-[200px]">
                          <details className="group">
                            <summary className="flex cursor-pointer select-none items-center gap-1 font-mono text-xs font-medium text-[#C6A66B] hover:text-[#d8b87d]">
                              <span>Hourly Resource Rates</span>
                              <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="mt-2 space-y-1 rounded-xl border border-[#332f2a] bg-[#171717] p-3 font-mono text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-[#F1E9DA]/50">CPU:</span>
                                <span className="text-[#F1E9DA]">₹{m.pricingDetails?.rates?.cpu ?? 0}/hr</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[#F1E9DA]/50">RAM:</span>
                                <span className="text-[#F1E9DA]">₹{m.pricingDetails?.rates?.ram ?? 0}/hr</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[#F1E9DA]/50">Disk:</span>
                                <span className="text-[#F1E9DA]">₹{m.pricingDetails?.rates?.disk ?? 0}/hr</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[#F1E9DA]/50">Bandwidth:</span>
                                <span className="text-[#F1E9DA]">₹{m.pricingDetails?.rates?.bandwidth ?? 0}/hr</span>
                              </div>
                              <div className="flex justify-between border-t border-[#332f2a] pt-1.5 font-semibold text-[#F1E9DA]">
                                <span>Total Rate:</span>
                                <span className="text-[#C6A66B]">₹{m.pricingDetails?.totalHourlyRate ?? 0}/hr</span>
                              </div>
                              <div className="pt-0.5 text-[10px] text-[#F1E9DA]/50">
                                ₹{m.pricingDetails?.totalHourlyRate ?? 0}/hr × 720 hrs = ₹{Number(m.providerCost).toFixed(2)}/mo
                              </div>
                            </div>
                          </details>
                          <div className="mt-1 font-mono text-[11px] text-[#F1E9DA]/50">
                            {m.cpuName} · {m.ramName} · {m.diskName}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          {m.isCostVerified && m.isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-[#C6A66B]">
                              <CheckCircle2 size={12} />
                              Live on Website
                            </span>
                          ) : !m.isCostVerified ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-amber-400">
                              <AlertCircle size={12} />
                              Hidden (Unverified)
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-red-400">
                              Deactivated
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!m.isCostVerified && (
                              <button
                                title="Confirm Provider Cost & Publish"
                                onClick={() => openConfirmModal(m)}
                                className="flex items-center gap-1 rounded-xl bg-[#C6A66B] px-3 py-1.5 font-mono text-xs font-bold text-[#171717] transition hover:bg-[#d8b87d]"
                              >
                                <ShieldCheck size={14} />
                                Confirm Cost
                              </button>
                            )}

                            <button
                              title={m.isActive ? "Deactivate" : "Activate"}
                              onClick={() => toggleStatus(m)}
                              className="rounded-xl border border-[#332f2a] bg-[#171717] p-2 text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#201d1a]"
                            >
                              <Power size={14} />
                            </button>

                            <button
                              title="Delete Mapping"
                              onClick={() => handleDelete(m)}
                              className="rounded-xl border border-[#332f2a] bg-[#171717] p-2 text-red-400 transition hover:border-red-500/50 hover:bg-[#201d1a]"
                            >
                              <Trash2 size={14} />
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
        </div>
      )}

      {/* TAB 2: RAW HOSTHEAVEN CATALOGUE INSPECTION */}
      {activeTab === "RAW_CATALOGUE" && (
        <div className="space-y-6">
          {/* ZONES */}
          <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-serif text-lg font-bold text-[#F1E9DA]">
              <Cloud size={18} className="text-[#C6A66B]" />
              Available HostHeaven Zones ({zones.length} Total)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {zones.map((z) => {
                const isActive = (z as any).status === "ACTIVE" || z.status === "active";
                return (
                  <div
                    key={z.id}
                    className={`rounded-xl border p-3.5 text-xs ${
                      isActive
                        ? "border-[#C6A66B]/30 bg-[#171717] text-[#F1E9DA]"
                        : "border-[#332f2a] bg-[#171717] text-[#F1E9DA]/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-[#F1E9DA]">{z.name}</span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                          isActive
                            ? "border border-[#C6A66B]/40 bg-[#C6A66B]/10 text-[#C6A66B]"
                            : "border border-[#332f2a] bg-[#201d1a] text-[#F1E9DA]/40"
                        }`}
                      >
                        {isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-[#F1E9DA]/60">Location: {z.location || "India"}</p>
                    <p className="font-mono text-[11px] text-[#F1E9DA]/40">ID: {z.id}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PRICING MATRIX & ARCHITECTURAL VERIFICATION */}
          {pricing && (() => {
            const isSlot = (item: PricingItem) => (item.label || "").toLowerCase().includes("slot");
            const stdCpu = pricing.shared.cpu.filter((c) => !isSlot(c));
            const stdRam = pricing.shared.ram.filter((r) => !isSlot(r));
            const stdDisk = pricing.shared.disk.filter((d) => !isSlot(d));
            const stdBw = pricing.shared.bandwidth.filter((b) => !isSlot(b));

            const slotCpu = pricing.shared.cpu.filter((c) => isSlot(c));
            const slotRam = pricing.shared.ram.filter((r) => isSlot(r));
            const slotDisk = pricing.shared.disk.filter((d) => isSlot(d));
            const slotBw = pricing.shared.bandwidth.filter((b) => isSlot(b));

            return (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 font-mono text-xs text-amber-200/90">
                  <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-400" />
                  <div>
                    <span className="font-bold">Catalog Pricing Isolation Rule:</span> Standard Cloud and Slot IP catalogues are mutually exclusive. All resources in a VM must come from the same family. Mixing standard items with Slot IP items produces invalid combinations (such as ₹1,067.49, ₹715.86, ₹977.49) which are strictly rejected by the backend.
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                  {/* Standard Shared */}
                  <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">Standard Cloud VPS (Modular)</h3>
                      <span className="rounded-md border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#C6A66B]">
                        ₹805.86 / mo
                      </span>
                    </div>
                    <div className="space-y-2.5 font-mono text-xs text-[#F1E9DA]/80">
                      <div>
                        <span className="text-[#F1E9DA]/50">CPU:</span>{" "}
                        {stdCpu.map((c) => `${c.cores}C (₹${c.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="text-[#F1E9DA]/50">RAM:</span>{" "}
                        {stdRam.map((r) => `${r.ram}GB (₹${r.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="text-[#F1E9DA]/50">Disk:</span>{" "}
                        {stdDisk.map((d) => `${d.disk}GB (₹${d.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="text-[#F1E9DA]/50">Bandwidth:</span>{" "}
                        {stdBw.map((b) => `${b.bandwidth}GB (₹${b.price}/hr)`).join(" · ")}
                      </div>
                      <div className="border-t border-[#332f2a] pt-2.5 text-[11px] text-[#F1E9DA]/60">
                        <div>Rate: 0.10 + 0.1954 + 0.20 + 0.40 = 0.8954 ₹/hr</div>
                        <div className="mt-1 font-bold text-[#C6A66B]">
                          0.8954 × 720h = ₹644.69/mo → ₹805.86
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Slot IP Shared */}
                  <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">Slot IP Cloud VPS (Bundled)</h3>
                      <span className="rounded-md border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#C6A66B]">
                        ₹437.50 / mo
                      </span>
                    </div>
                    <div className="space-y-2.5 font-mono text-xs text-[#F1E9DA]/80">
                      <div>
                        <span className="text-[#F1E9DA]/50">CPU:</span>{" "}
                        {slotCpu.map((c) => `${c.label || c.cores + 'C'} (₹${c.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="text-[#F1E9DA]/50">RAM (Bundled):</span>{" "}
                        {slotRam.map((r) => `${r.label || r.ram + 'GB'} (₹${r.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="text-[#F1E9DA]/50">Disk:</span>{" "}
                        {slotDisk.map((d) => `${d.label || d.disk + 'GB'} (₹${d.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="text-[#F1E9DA]/50">Bandwidth:</span>{" "}
                        {slotBw.map((b) => `${b.label || b.bandwidth + 'GB'} (₹${b.price}/hr)`).join(" · ")}
                      </div>
                      <div className="border-t border-[#332f2a] pt-2.5 text-[11px] text-[#F1E9DA]/60">
                        <div>Rate: 0 + 0.4861 + 0 + 0 = 0.4861 ₹/hr</div>
                        <div className="mt-1 font-bold text-[#C6A66B]">
                          0.4861 × 720h = ₹349.99/mo → ₹437.50
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dedicated */}
                  <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">Dedicated Cloud VPS</h3>
                      <span className="rounded-md border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#C6A66B]">
                        ₹1,624.95 / mo
                      </span>
                    </div>
                    <div className="space-y-2.5 font-mono text-xs text-[#F1E9DA]/80">
                      <div>
                        <span className="text-[#F1E9DA]/50">CPU:</span>{" "}
                        {pricing.dedicated.cpu.map((c) => `${c.cores}C (₹${c.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="text-[#F1E9DA]/50">RAM:</span>{" "}
                        {pricing.dedicated.ram.map((r) => `${r.ram}GB (₹${r.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="text-[#F1E9DA]/50">Disk:</span>{" "}
                        {pricing.dedicated.disk.map((d) => `${d.disk}GB (₹${d.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="text-[#F1E9DA]/50">Bandwidth:</span>{" "}
                        {pricing.dedicated.bandwidth.map((b) => `${b.bandwidth}GB (₹${b.price}/hr)`).join(" · ")}
                      </div>
                      <div className="border-t border-[#332f2a] pt-2.5 text-[11px] text-[#F1E9DA]/60">
                        <div>Rate: 0.6251 + 0.7264 + 0.2724 + 0.1816 = 1.8055 ₹/hr</div>
                        <div className="mt-1 font-bold text-[#C6A66B]">
                          1.8055 × 720h = ₹1,299.96/mo → ₹1,624.95
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* CONFIRM PROVIDER COST MODAL */}
      {confirmModalOpen && targetMappingToConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => !confirmingCost && setConfirmModalOpen(false)}
        >
          <form
            onSubmit={handleConfirmCostSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 text-[#F1E9DA] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#332f2a] pb-3">
              <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-[#F1E9DA]">
                <ShieldCheck size={20} className="text-[#C6A66B]" />
                Confirm Provider Cost & Publish Plan
              </h2>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-lg p-1.5 text-[#F1E9DA]/50 transition hover:bg-[#292521] hover:text-[#F1E9DA]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5 rounded-xl border border-[#332f2a] bg-[#171717] p-4 text-xs font-mono">
              <p className="font-sans text-sm font-semibold text-[#F1E9DA]">
                {targetMappingToConfirm.plan?.name}
              </p>
              <p className="text-[#F1E9DA]/60">
                Zone: {targetMappingToConfirm.zoneName} · {targetMappingToConfirm.planType} Tier
              </p>
              <p className="text-[#F1E9DA]/60">
                Catalogue Resource Sum: ₹{targetMappingToConfirm.providerCost} (Estimated rate)
              </p>
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                Confirmed Monthly Provider Cost (₹ INR) *
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  className={`${inputClass} mt-1.5 font-mono text-base`}
                  placeholder="e.g. 1000.00"
                  value={confirmCostInput}
                  onChange={(e) => setConfirmCostInput(e.target.value)}
                />
              </label>
              <p className="mt-1.5 font-mono text-[11px] text-[#F1E9DA]/50">
                Enter your contracted upstream provider invoice rate in ₹ INR. Customer selling price will be automatically calculated using the {profitMargin}% margin policy.
              </p>
            </div>

            {/* LIVE PREVIEW CARD */}
            {confirmCostInput && !isNaN(Number(confirmCostInput)) && Number(confirmCostInput) > 0 && (
              <div className="rounded-xl border border-[#C6A66B]/30 bg-[#171717] p-4 text-xs">
                <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B]">Dynamic Customer Pricing Preview</p>
                <div className="mt-2 flex items-center justify-between font-mono">
                  <span className="text-[#F1E9DA]/60">Selling Price:</span>
                  <span className="text-base font-bold text-[#C6A66B]">
                    ₹{((Number(confirmCostInput) / (1 - profitMargin / 100))).toFixed(2)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-[#F1E9DA]/70">
                  <span>Gross Profit per Sale:</span>
                  <span className="text-[#C6A66B]">
                    +₹{((Number(confirmCostInput) / (1 - profitMargin / 100)) - Number(confirmCostInput)).toFixed(2)} ({profitMargin}%)
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 border-t border-[#332f2a] pt-3">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2 font-mono text-xs font-semibold text-[#F1E9DA] transition hover:bg-[#292521]"
              >
                Cancel
              </button>
              <button
                disabled={confirmingCost || !confirmCostInput}
                className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-sm transition hover:bg-[#d8b87d] disabled:opacity-50"
              >
                {confirmingCost ? "Confirming..." : "Verify & Publish to Website"}
                <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MANUAL ADD MAPPING MODAL (PRESERVED) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => !saving && setModalOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 text-[#F1E9DA] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#332f2a] pb-3">
              <div>
                <h2 className="flex items-center gap-2 font-serif text-xl font-bold text-[#F1E9DA]">
                  <Cloud size={20} className="text-[#C6A66B]" />
                  Create HostHeaven Plan Mapping
                </h2>
                <p className="mt-0.5 font-mono text-xs text-[#F1E9DA]/50">
                  Select catalogue resources. Customer price is automatically computed at {profitMargin}% margin.
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

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                Target VPS Plan *
                <select
                  required
                  className={`${inputClass} mt-1.5`}
                  value={form.planId}
                  onChange={(e) => setForm({ ...form, planId: e.target.value })}
                >
                  <option value="">Select VPS Plan to Map</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.cpuCores} CPU / {p.ramGb} GB RAM / {p.storageGb} GB
                    </option>
                  ))}
                </select>
              </label>

              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                Plan Architecture Tier *
                <select
                  required
                  className={`${inputClass} mt-1.5`}
                  value={form.planType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      planType: e.target.value as "SHARED" | "DEDICATED",
                      cpuPricingId: "",
                      cpuPrice: "",
                      ramPricingId: "",
                      ramPrice: "",
                      diskPricingId: "",
                      diskPrice: "",
                      bandwidthPricingId: "",
                      bandwidthPrice: "",
                    })
                  }
                >
                  <option value="SHARED">SHARED (Standard Cloud VPS)</option>
                  <option value="DEDICATED">DEDICATED (Dedicated CPU VPS)</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                HostHeaven Zone *
                <select
                  required
                  className={`${inputClass} mt-1.5`}
                  value={form.zoneId}
                  onChange={(e) => handleZoneChange(e.target.value)}
                >
                  <option value="">Select Zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} {z.location ? `(${z.location})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/70">
                Operating System ISO *
                <select
                  required
                  disabled={!form.zoneId || loadingIsos}
                  className={`${inputClass} mt-1.5 disabled:opacity-50`}
                  value={form.zoneIsoId}
                  onChange={(e) => {
                    const iso = isos.find((i) => i.id === e.target.value);
                    setForm({
                      ...form,
                      zoneIsoId: e.target.value,
                      isoName: iso?.isoName || "",
                    });
                  }}
                >
                  <option value="">
                    {loadingIsos ? "Loading ISO templates..." : "Select ISO Template"}
                  </option>
                  {isos.map((iso) => (
                    <option key={iso.id} value={iso.id}>
                      {iso.isoName} ({iso.osType})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="border-t border-[#332f2a] pt-3">
              <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-[#F1E9DA]/50">
                Resource Catalogue Selection ({form.planType})
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* CPU */}
                <label className="block font-mono text-xs text-[#F1E9DA]/70">
                  CPU Option *
                  <select
                    required
                    className={`${inputClass} mt-1`}
                    value={form.cpuPricingId}
                    onChange={(e) => {
                      const item = currentPricing?.cpu.find((c) => c.id === e.target.value);
                      setForm({
                        ...form,
                        cpuPricingId: e.target.value,
                        cpuName: item?.label || "",
                        cpuPrice: item?.price || 0,
                      });
                    }}
                  >
                    <option value="">Select CPU</option>
                    {currentPricing?.cpu.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} (₹{item.price} ₹/hr)
                      </option>
                    ))}
                  </select>
                </label>

                {/* RAM */}
                <label className="block font-mono text-xs text-[#F1E9DA]/70">
                  RAM Option *
                  <select
                    required
                    className={`${inputClass} mt-1`}
                    value={form.ramPricingId}
                    onChange={(e) => {
                      const item = currentPricing?.ram.find((r) => r.id === e.target.value);
                      setForm({
                        ...form,
                        ramPricingId: e.target.value,
                        ramName: item?.label || "",
                        ramPrice: item?.price || 0,
                      });
                    }}
                  >
                    <option value="">Select RAM</option>
                    {currentPricing?.ram.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} (₹{item.price} ₹/hr)
                      </option>
                    ))}
                  </select>
                </label>

                {/* DISK */}
                <label className="block font-mono text-xs text-[#F1E9DA]/70">
                  Storage Disk Option *
                  <select
                    required
                    className={`${inputClass} mt-1`}
                    value={form.diskPricingId}
                    onChange={(e) => {
                      const item = currentPricing?.disk.find((d) => d.id === e.target.value);
                      setForm({
                        ...form,
                        diskPricingId: e.target.value,
                        diskName: item?.label || "",
                        diskPrice: item?.price || 0,
                      });
                    }}
                  >
                    <option value="">Select Disk</option>
                    {currentPricing?.disk.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} (₹{item.price} ₹/hr)
                      </option>
                    ))}
                  </select>
                </label>

                {/* BANDWIDTH */}
                <label className="block font-mono text-xs text-[#F1E9DA]/70">
                  Bandwidth Option *
                  <select
                    required
                    className={`${inputClass} mt-1`}
                    value={form.bandwidthPricingId}
                    onChange={(e) => {
                      const item = currentPricing?.bandwidth.find((b) => b.id === e.target.value);
                      setForm({
                        ...form,
                        bandwidthPricingId: e.target.value,
                        bandwidthName: item?.label || "",
                        bandwidthPrice: item?.price || 0,
                      });
                    }}
                  >
                    <option value="">Select Bandwidth</option>
                    {currentPricing?.bandwidth.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} (₹{item.price} ₹/hr)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* VERIFIED PROVIDER COST OVERRIDE */}
              <div className="mt-4 rounded-xl border border-[#332f2a] bg-[#171717] p-3.5">
                <label className="block font-mono text-xs text-[#F1E9DA]/80">
                  Verified Upstream Provider Cost (₹ INR) *
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className={`${inputClass} mt-1 font-mono`}
                    placeholder={`Catalogue resource sum: ₹${calculation.autoCost}`}
                    value={form.customProviderCost}
                    onChange={(e) =>
                      setForm({ ...form, customProviderCost: e.target.value })
                    }
                  />
                </label>
                <p className="mt-1.5 font-mono text-[11px] text-[#F1E9DA]/50">
                  Sum of catalogue resource rates: <span className="font-semibold text-[#F1E9DA]">₹{calculation.autoCost}</span>. Enter verified contract or invoice cost in ₹ INR to override, or leave blank to use the catalogue sum.
                </p>
              </div>
            </div>

            {/* LIVE PRICE CALCULATION SUMMARY CARD */}
            <div className="rounded-xl border border-[#C6A66B]/30 bg-[#171717] p-4 text-xs">
              <div className="flex items-center justify-between border-b border-[#332f2a] pb-2">
                <span className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B]">
                  <Layers size={14} />
                  Live Pricing Breakdown ({calculation.durationDays} Days / {calculation.months} Mo)
                </span>
                <span className="rounded-md border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#C6A66B]">
                  {profitMargin}% Gross Margin Enforced
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-4 font-mono">
                <div>
                  <p className="text-[#F1E9DA]/50">Monthly Cost</p>
                  <p className="mt-0.5 text-base font-bold text-[#F1E9DA]">
                    ₹{calculation.monthlyCost.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[#F1E9DA]/50">Total Provider Cost</p>
                  <p className="mt-0.5 text-base font-bold text-[#F1E9DA]">
                    ₹{calculation.providerCost.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[#F1E9DA]/50">Customer Selling Price</p>
                  <p className="mt-0.5 text-base font-bold text-[#C6A66B]">
                    ₹{calculation.sellingPrice.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[#F1E9DA]/50">Gross Profit (₹)</p>
                  <p className="mt-0.5 text-base font-bold text-[#C6A66B]">
                    +₹{calculation.grossProfit.toLocaleString()}
                  </p>
                </div>
              </div>

              <p className="mt-2 font-mono text-[11px] text-[#F1E9DA]/50">
                Formula: ₹{calculation.providerCost.toLocaleString()} / (1 - {profitMargin / 100}) ={" "}
                <span className="font-semibold text-[#C6A66B]">
                  ₹{calculation.sellingPrice.toLocaleString()}
                </span>
                . Upon saving, the customer-facing plan price will be automatically updated.
              </p>
            </div>

            <label className="flex items-center gap-2 pt-1 font-mono text-xs text-[#F1E9DA]/80">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-[#332f2a] bg-[#171717] accent-[#C6A66B]"
              />
              Enable mapping immediately in customer VPS catalogue
            </label>

            <div className="flex justify-end gap-2.5 border-t border-[#332f2a] pt-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2 font-mono text-xs font-semibold text-[#F1E9DA] transition hover:bg-[#292521]"
              >
                Cancel
              </button>
              <button
                disabled={saving || calculation.providerCost <= 0}
                className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-sm transition hover:bg-[#d8b87d] disabled:opacity-50"
              >
                {saving ? "Saving Mapping..." : "Save HostHeaven Mapping"}
                <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
