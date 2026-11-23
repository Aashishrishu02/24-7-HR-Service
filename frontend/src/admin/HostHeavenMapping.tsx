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
  "w-full rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm text-white outline-none focus:border-blue-500";

export default function HostHeavenMapping() {
  const [mappings, setMappings] = useState<HostHeavenMappingRecord[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [isos, setIsos] = useState<Iso[]>([]);
  const [pricing, setPricing] = useState<CataloguePricing | null>(null);
  const [profitMargin, setProfitMargin] = useState<number>(20);

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
      const [mappingsRes, plansRes, catalogueRes, settingsRes, syncStatusRes] = await Promise.all([
        adminApi.get("/admin/hostheaven/mappings"),
        adminApi.get("/admin/plans"),
        adminApi.get("/admin/hostheaven/catalogue").catch(() => ({
          data: { zones: [], pricing: null },
        })),
        adminApi.get("/admin/vps/renewal/settings").catch(() => ({
          data: { hostHeavenProfitMarginPercent: 20 },
        })),
        adminApi.get("/admin/hostheaven/mappings/sync/status").catch(() => ({
          data: null,
        })),
      ]);

      setMappings(mappingsRes.data.mappings || []);
      const margin = Number(settingsRes.data?.hostHeavenProfitMarginPercent ?? 20);
      setProfitMargin(margin);

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
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Cloud className="text-blue-400" size={26} />
            HostHeaven Dynamic Catalogue & Pricing
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Automatically synchronizes HostHeaven zones, OS, and resource pricing catalogues using the current admin-configured gross profit margin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSyncNow}
            disabled={syncing || loading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Refreshing Catalogue..." : "Refresh Catalogue"}
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={() => {
              setForm(initialForm);
              setModalOpen(true);
              setError("");
            }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
          >
            <Plus size={15} />
            Manual Mapping
          </button>
        </div>
      </div>

      {/* DIRECT LIVE CATALOGUE INFO BANNER */}
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs text-blue-200">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-cyan-400" />
          <div className="space-y-1">
            <p className="font-bold text-white text-sm">
              Direct Live Catalogue Mode: Active
            </p>
            <p className="leading-relaxed text-slate-300">
              HostHeaven services, zones, operating systems, and purchasable configurations are dynamically discovered and presented directly on the 24/7 customer website (<code className="rounded bg-black/30 px-1 py-0.5 text-cyan-300">GET /api/hostheaven/services</code> & <code className="rounded bg-black/30 px-1 py-0.5 text-cyan-300">GET /api/plans</code>).
            </p>
            <p className="leading-relaxed text-slate-400">
              Manual VPSPlan creation and admin product publishing are no longer required. The current admin-configured gross profit margin is applied automatically across all available configurations. Existing mapped plans below remain fully operational for legacy compatibility.
            </p>
          </div>
        </div>
      </div>

      {/* SYNC STATUS BANNER */}
      {syncStatus && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0c1527] p-3.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
                syncStatus.status === "SUCCESS"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : syncStatus.status === "IN_PROGRESS"
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              <Clock size={13} />
              Sync Status: {syncStatus.status}
            </span>

            {syncStatus.lastSyncedAt && (
              <span className="text-slate-400">
                Last Synced:{" "}
                <span className="text-slate-200 font-medium">
                  {new Date(syncStatus.lastSyncedAt).toLocaleString()}
                </span>
              </span>
            )}

            {(syncStatus.stats?.walletBalance !== undefined ||
              syncStatus.rawCatalogue?.wallet?.balance !== undefined) && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 font-mono font-semibold text-emerald-300">
                <Wallet size={13} />
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
            <div className="flex flex-wrap items-center gap-4 text-slate-300">
              <span>
                Zones: <strong className="text-white">{syncStatus.stats.activeZones} Active</strong> / {syncStatus.stats.totalZones} Total
              </span>
              <span>
                ISOs: <strong className="text-white">{syncStatus.stats.totalIsos}</strong>
              </span>
              <span>
                Discovered: <strong className="text-cyan-400">{syncStatus.stats.configurationsFound}</strong>
              </span>
              <span>
                Published: <strong className="text-emerald-400">{syncStatus.stats.verifiedConfigsCount}</strong>
              </span>
            </div>
          )}
        </div>
      )}


      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <CheckCircle2 size={17} />
          {success}
        </div>
      )}

      {/* STATS OVERVIEW */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-4">
          <p className="text-xs text-slate-400">Total Synchronized Plans</p>
          <p className="mt-2 text-2xl font-bold">{mappings.length}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-4">
          <p className="text-xs text-slate-400">Verified & Published</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">{verifiedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-4">
          <p className="text-xs text-slate-400">Pending Verification (Estimated)</p>
          <p className="mt-2 text-2xl font-bold text-amber-400">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-4">
          <p className="text-xs text-slate-400">Current Gross Margin</p>
          <p className="mt-2 text-2xl font-bold text-cyan-400">{profitMargin}%</p>
        </div>
      </div>

      {/* VIEW TABS */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("CONFIGURATIONS")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "CONFIGURATIONS"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          <Layers size={16} />
          Synchronized VPS Plans & Pricing ({mappings.length})
        </button>

        <button
          onClick={() => setActiveTab("RAW_CATALOGUE")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "RAW_CATALOGUE"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          <Database size={16} />
          Raw HostHeaven Catalogues (Zones, OS, Pricing)
        </button>
      </div>

      {/* TAB 1: CONFIGURATIONS LIST */}
      {activeTab === "CONFIGURATIONS" && (
        <div className="space-y-4">
          {/* FILTER PILLS */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 mr-1 font-medium">Filter Catalogue:</span>
            <button
              onClick={() => setFilterTab("ALL")}
              className={`rounded-lg px-3 py-1.5 transition ${
                filterTab === "ALL"
                  ? "bg-slate-700 text-white font-semibold"
                  : "bg-slate-900 text-slate-400 hover:bg-slate-800"
              }`}
            >
              All Plans ({mappings.length})
            </button>
            <button
              onClick={() => setFilterTab("VERIFIED")}
              className={`rounded-lg px-3 py-1.5 transition ${
                filterTab === "VERIFIED"
                  ? "bg-emerald-600 text-white font-semibold"
                  : "bg-slate-900 text-emerald-400 hover:bg-slate-800"
              }`}
            >
              Verified & Published ({verifiedCount})
            </button>
            <button
              onClick={() => setFilterTab("PENDING")}
              className={`rounded-lg px-3 py-1.5 transition ${
                filterTab === "PENDING"
                  ? "bg-amber-600 text-white font-semibold"
                  : "bg-slate-900 text-amber-400 hover:bg-slate-800"
              }`}
            >
              Pending Verification ({pendingCount})
            </button>
            <button
              onClick={() => setFilterTab("INACTIVE")}
              className={`rounded-lg px-3 py-1.5 transition ${
                filterTab === "INACTIVE"
                  ? "bg-red-700 text-white font-semibold"
                  : "bg-slate-900 text-red-400 hover:bg-slate-800"
              }`}
            >
              Inactive ({inactiveCount})
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#111a2b]">
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="mx-auto mb-3 animate-spin" />
                Loading catalogue configurations...
              </div>
            ) : filteredMappings.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Server className="mx-auto mb-3" size={34} />
                No plans match the selected filter. Click "Sync Catalogue Now" to auto-discover plans from HostHeaven.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-[#0d1525] text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3">VPS Plan Specs</th>
                      <th className="px-4 py-3">Zone & OS</th>
                      <th className="px-4 py-3">Monthly HostHeaven Provider Cost</th>
                      <th className="px-4 py-3">Customer Selling Price ({profitMargin}% Margin)</th>
                      <th className="px-4 py-3">Resource Rate Breakdown</th>
                      <th className="px-4 py-3">Publishing Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredMappings.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-white">
                            {m.plan?.name || "Unnamed VPS Plan"}
                          </p>
                          <p className="text-xs text-slate-400">
                            {m.plan?.cpuCores} vCPU · {m.plan?.ramGb} GB RAM · {m.plan?.storageGb} GB NVMe
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-block rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
                              {m.planType} TIER
                            </span>
                            {m.isMixedConfiguration && (
                              <span className="inline-block rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300 border border-red-500/30">
                                MIXED RESOURCE ERROR (INVALID)
                              </span>
                            )}
                            <span className="inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                              Duration: {m.plan?.durationDays ?? 30} Days ({(m.plan?.durationDays ?? 30) === 365 ? 12 : Math.max(1, Math.round((m.plan?.durationDays ?? 30) / 30))} mo)
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-200">
                            {m.zoneName || m.zoneId}
                          </p>
                          <p className="text-xs text-slate-400">
                            {m.isoName || m.zoneIsoId}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <p className="text-[11px] font-semibold text-slate-400">
                            Monthly Provider Cost:
                          </p>
                          <div className="font-mono text-base font-bold text-white mt-0.5">
                            ₹{Number(m.providerCost).toFixed(2)}
                            <span className="text-xs font-normal text-slate-400">/mo</span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            {m.pricingDetails?.pricingSource === "AUTHORITATIVE_MONTHLY" ? (
                              <span className="inline-block rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">
                                Authoritative Monthly
                              </span>
                            ) : (
                              <span className="inline-block rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-500/30">
                                Calculated (720h)
                              </span>
                            )}
                            {m.isCostVerified ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                                <ShieldCheck size={12} />
                                Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                                <AlertTriangle size={12} />
                                ESTIMATED
                              </span>
                            )}
                          </div>
                          {m.lastSyncedAt && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Synced: {new Date(m.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <p className="text-[11px] font-semibold text-slate-400">
                            Customer Monthly Price:
                          </p>
                          <p className="font-mono text-base font-bold text-emerald-400 mt-0.5">
                            ₹{Number(m.calculatedSellingPrice).toFixed(2)}
                            <span className="text-xs font-normal text-emerald-300/70">/mo</span>
                          </p>
                          <p className="text-[11px] text-cyan-400 mt-0.5">
                            Gross Profit: ₹{Number(m.grossProfit).toFixed(2)} ({profitMargin}%)
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            ₹{Number(m.providerCost).toFixed(2)} / (1 - {profitMargin / 100}) = ₹{Number(m.calculatedSellingPrice).toFixed(2)}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-xs text-slate-300 min-w-[200px]">
                          <details className="group">
                            <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 select-none">
                              <span>Hourly Resource Rates</span>
                              <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="mt-2 space-y-1 rounded-lg border border-slate-800 bg-[#09101d] p-2.5 font-mono text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">CPU:</span>
                                <span className="text-cyan-300">₹{m.pricingDetails?.rates?.cpu ?? 0}/hr</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">RAM:</span>
                                <span className="text-cyan-300">₹{m.pricingDetails?.rates?.ram ?? 0}/hr</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Disk:</span>
                                <span className="text-cyan-300">₹{m.pricingDetails?.rates?.disk ?? 0}/hr</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Bandwidth:</span>
                                <span className="text-cyan-300">₹{m.pricingDetails?.rates?.bandwidth ?? 0}/hr</span>
                              </div>
                              <div className="border-t border-slate-700/80 pt-1 text-slate-300 font-semibold flex justify-between">
                                <span>Total Rate:</span>
                                <span className="text-cyan-200">₹{m.pricingDetails?.totalHourlyRate ?? 0}/hr</span>
                              </div>
                              <div className="text-[10px] text-slate-400 pt-0.5">
                                ₹{m.pricingDetails?.totalHourlyRate ?? 0}/hr × 720 hrs = ₹{Number(m.providerCost).toFixed(2)}/mo
                              </div>
                            </div>
                          </details>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {m.cpuName} · {m.ramName} · {m.diskName}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          {m.isCostVerified && m.isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 size={12} />
                              Live on Website
                            </span>
                          ) : !m.isCostVerified ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <AlertCircle size={12} />
                              Hidden (Unverified)
                            </span>
                          ) : (
                            <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                              Deactivated
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {!m.isCostVerified && (
                              <button
                                title="Confirm Provider Cost & Publish"
                                onClick={() => openConfirmModal(m)}
                                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                              >
                                <ShieldCheck size={14} />
                                Confirm Cost
                              </button>
                            )}

                            <button
                              title={m.isActive ? "Deactivate" : "Activate"}
                              onClick={() => toggleStatus(m)}
                              className="rounded-lg border border-slate-700 p-2 text-amber-400 hover:bg-slate-700 transition"
                            >
                              <Power size={14} />
                            </button>

                            <button
                              title="Delete Mapping"
                              onClick={() => handleDelete(m)}
                              className="rounded-lg border border-slate-700 p-2 text-red-400 hover:bg-slate-700 transition"
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
          <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-3">
              <Cloud size={18} className="text-blue-400" />
              Available HostHeaven Zones ({zones.length} Total)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {zones.map((z) => {
                const isActive = (z as any).status === "ACTIVE" || z.status === "active";
                return (
                  <div
                    key={z.id}
                    className={`rounded-lg border p-3 text-xs ${
                      isActive
                        ? "border-emerald-500/40 bg-emerald-950/10 text-slate-200"
                        : "border-slate-800 bg-[#0a1220] text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-white">{z.name}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          isActive
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-slate-800 text-slate-500"
                        }`}
                      >
                        {isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-400">Location: {z.location || "India"}</p>
                    <p className="font-mono text-[11px] text-slate-500">ID: {z.id}</p>
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
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3">
                  <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Catalog Pricing Isolation Rule:</span> Standard Cloud and Slot IP catalogues are mutually exclusive. All resources in a VM must come from the same family. Mixing standard items with Slot IP items produces invalid combinations (such as ₹1,067.49, ₹715.86, ₹977.49) which are strictly rejected by the backend.
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                  {/* Standard Shared */}
                  <div className="rounded-xl border border-blue-900/50 bg-[#111a2b] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-blue-300">Standard Cloud VPS (Modular)</h3>
                      <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                        ₹805.86 / mo
                      </span>
                    </div>
                    <div className="space-y-2.5 text-xs text-slate-300">
                      <div>
                        <span className="font-semibold text-slate-400">CPU:</span>{" "}
                        {stdCpu.map((c) => `${c.cores}C (₹${c.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">RAM:</span>{" "}
                        {stdRam.map((r) => `${r.ram}GB (₹${r.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">Disk:</span>{" "}
                        {stdDisk.map((d) => `${d.disk}GB (₹${d.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">Bandwidth:</span>{" "}
                        {stdBw.map((b) => `${b.bandwidth}GB (₹${b.price}/hr)`).join(" · ")}
                      </div>
                      <div className="border-t border-slate-800 pt-2 font-mono text-[11px] text-slate-400">
                        <div>Rate: 0.10 + 0.1954 + 0.20 + 0.40 = 0.8954 ₹/hr</div>
                        <div className="text-emerald-400 mt-1 font-semibold">
                          0.8954 × 720h = ₹644.69/mo → ₹805.86
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Slot IP Shared */}
                  <div className="rounded-xl border border-purple-900/50 bg-[#111a2b] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-purple-300">Slot IP Cloud VPS (Bundled)</h3>
                      <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                        ₹437.50 / mo
                      </span>
                    </div>
                    <div className="space-y-2.5 text-xs text-slate-300">
                      <div>
                        <span className="font-semibold text-slate-400">CPU:</span>{" "}
                        {slotCpu.map((c) => `${c.label || c.cores + 'C'} (₹${c.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">RAM (Bundled):</span>{" "}
                        {slotRam.map((r) => `${r.label || r.ram + 'GB'} (₹${r.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">Disk:</span>{" "}
                        {slotDisk.map((d) => `${d.label || d.disk + 'GB'} (₹${d.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">Bandwidth:</span>{" "}
                        {slotBw.map((b) => `${b.label || b.bandwidth + 'GB'} (₹${b.price}/hr)`).join(" · ")}
                      </div>
                      <div className="border-t border-slate-800 pt-2 font-mono text-[11px] text-slate-400">
                        <div>Rate: 0 + 0.4861 + 0 + 0 = 0.4861 ₹/hr</div>
                        <div className="text-emerald-400 mt-1 font-semibold">
                          0.4861 × 720h = ₹349.99/mo → ₹437.50
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dedicated */}
                  <div className="rounded-xl border border-cyan-900/50 bg-[#111a2b] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-cyan-300">Dedicated Cloud VPS</h3>
                      <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                        ₹1,624.95 / mo
                      </span>
                    </div>
                    <div className="space-y-2.5 text-xs text-slate-300">
                      <div>
                        <span className="font-semibold text-slate-400">CPU:</span>{" "}
                        {pricing.dedicated.cpu.map((c) => `${c.cores}C (₹${c.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">RAM:</span>{" "}
                        {pricing.dedicated.ram.map((r) => `${r.ram}GB (₹${r.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">Disk:</span>{" "}
                        {pricing.dedicated.disk.map((d) => `${d.disk}GB (₹${d.price}/hr)`).join(" · ")}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">Bandwidth:</span>{" "}
                        {pricing.dedicated.bandwidth.map((b) => `${b.bandwidth}GB (₹${b.price}/hr)`).join(" · ")}
                      </div>
                      <div className="border-t border-slate-800 pt-2 font-mono text-[11px] text-slate-400">
                        <div>Rate: 0.6251 + 0.7264 + 0.2724 + 0.1816 = 1.8055 ₹/hr</div>
                        <div className="text-emerald-400 mt-1 font-semibold">
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
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={() => !confirmingCost && setConfirmModalOpen(false)}
        >
          <form
            onSubmit={handleConfirmCostSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-[#111a2b] p-6 text-white"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck size={20} className="text-emerald-400" />
                Confirm Provider Cost & Publish Plan
              </h2>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-lg p-1.5 hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#091122] p-4 text-xs space-y-1.5">
              <p className="font-semibold text-white text-sm">
                {targetMappingToConfirm.plan?.name}
              </p>
              <p className="text-slate-400">
                Zone: {targetMappingToConfirm.zoneName} · {targetMappingToConfirm.planType} Tier
              </p>
              <p className="text-slate-400">
                Catalogue Resource Sum: ₹{targetMappingToConfirm.providerCost} (Estimated rate)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">
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
              <p className="mt-1.5 text-xs text-slate-400">
                Enter your contracted upstream provider invoice rate in ₹ INR. Customer selling price will be automatically calculated using the {profitMargin}% margin policy.
              </p>
            </div>

            {/* LIVE PREVIEW CARD */}
            {confirmCostInput && !isNaN(Number(confirmCostInput)) && Number(confirmCostInput) > 0 && (
              <div className="rounded-xl border border-emerald-900/60 bg-[#081e18] p-3 text-xs">
                <p className="font-semibold text-emerald-300">Dynamic Customer Pricing Preview</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-slate-400">Selling Price:</span>
                  <span className="font-mono text-base font-bold text-emerald-400">
                    ₹{((Number(confirmCostInput) / (1 - profitMargin / 100))).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-cyan-300 mt-1">
                  <span>Gross Profit per Sale:</span>
                  <span>
                    +₹{((Number(confirmCostInput) / (1 - profitMargin / 100)) - Number(confirmCostInput)).toFixed(2)} ({profitMargin}%)
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={confirmingCost || !confirmCostInput}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
              >
                {confirmingCost ? "Confirming..." : "Verify & Publish to Website"}
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MANUAL ADD MAPPING MODAL (PRESERVED) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4"
          onClick={() => !saving && setModalOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-[#111a2b] p-6 text-white"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Cloud size={20} className="text-blue-400" />
                  Create HostHeaven Plan Mapping
                </h2>
                <p className="text-xs text-slate-400">
                  Select catalogue resources. Customer price is automatically computed at {profitMargin}% margin.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
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

              <label className="block text-sm">
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
              <label className="block text-sm">
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

              <label className="block text-sm">
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

            <div className="border-t border-slate-800 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Resource Catalogue Selection ({form.planType})
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* CPU */}
                <label className="block text-sm">
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
                <label className="block text-sm">
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
                <label className="block text-sm">
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
                <label className="block text-sm">
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
              <div className="mt-4 rounded-xl border border-slate-700/80 bg-[#0a1222] p-3.5">
                <label className="block text-sm font-medium text-slate-200">
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
                <p className="mt-1.5 text-xs text-slate-400">
                  Sum of catalogue resource rates: <span className="font-semibold text-slate-300">₹{calculation.autoCost}</span>. Enter verified contract or invoice cost in ₹ INR to override, or leave blank to use the catalogue sum.
                </p>
              </div>
            </div>

            {/* LIVE PRICE CALCULATION SUMMARY CARD */}
            <div className="rounded-xl border border-blue-800/60 bg-[#0b162c] p-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span className="font-semibold text-blue-300 flex items-center gap-1.5">
                  <Layers size={14} />
                  Live Pricing Breakdown ({calculation.durationDays} Days / {calculation.months} Mo)
                </span>
                <span className="rounded bg-cyan-500/20 px-2 py-0.5 font-bold text-cyan-300">
                  {profitMargin}% Gross Margin Enforced
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-slate-400">Monthly Cost</p>
                  <p className="mt-0.5 text-base font-bold text-slate-200">
                    ₹{calculation.monthlyCost.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Total Provider Cost</p>
                  <p className="mt-0.5 text-base font-bold text-slate-200">
                    ₹{calculation.providerCost.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Customer Selling Price</p>
                  <p className="mt-0.5 text-base font-bold text-emerald-400">
                    ₹{calculation.sellingPrice.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Gross Profit (₹)</p>
                  <p className="mt-0.5 text-base font-bold text-cyan-400">
                    +₹{calculation.grossProfit.toLocaleString()}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-[11px] text-slate-400">
                Formula: ₹{calculation.providerCost.toLocaleString()} / (1 - {profitMargin / 100}) ={" "}
                <span className="font-semibold text-emerald-300">
                  ₹{calculation.sellingPrice.toLocaleString()}
                </span>
                . Upon saving, the customer-facing plan price will be automatically updated.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm pt-1">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600"
              />
              Enable mapping immediately in customer VPS catalogue
            </label>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={saving || calculation.providerCost <= 0}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? "Saving Mapping..." : "Save HostHeaven Mapping"}
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
