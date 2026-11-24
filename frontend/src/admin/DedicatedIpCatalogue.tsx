import { useEffect, useState } from "react";
import {
  RefreshCw,
  Save,
  Database,
  Server,
  AlertCircle,
} from "lucide-react";
import adminApi from "../adminApi";

type Provider = {
  id: string;
  name: string;
  code: string;
};

type NexaPlan = {
  planId?: string | number;
  planName?: string;
  categoryName?: string;
  tierLabel?: string;
  tier?: string;
  controlMode?: string;
  countryName?: string;
  location?: string;
  duration?: string | number;
  speed?: string;
  apiPrice?: number | string;
  regularPrice?: number | string;
  currency?: string;
  inStock?: boolean;
  stock?: string | number;
  pools?: Array<{
    poolId?: string | number;
    poolName?: string;
    subnet?: string;
    location?: string;
    apiPrice?: number | string;
    currency?: string;
    inStock?: boolean;
    stock?: string | number;
  }>;
};

type NexaSyncStatus = {
  status: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  syncedPlanCount: number;
  syncedPoolCount: number;
  isSyncInProgress: boolean;
  migrationRequired?: boolean;
};

export default function DedicatedIpCatalogue() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [plans, setPlans] = useState<NexaPlan[]>([]);
  const [margin, setMargin] = useState<number | "">(20);
  const [dedicatedIpEnabled, setDedicatedIpEnabled] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<NexaSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [catalogueError, setCatalogueError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadPage = async () => {
      setLoading(true);
      setError("");

      try {
        const [providersResponse, settingsResponse] = await Promise.all([
          adminApi.get("/admin/providers"),
          adminApi.get("/admin/vps/renewal/settings"),
        ]);

        if (cancelled) return;

        const providers: Provider[] = providersResponse.data?.providers || [];
        const nexa = providers.find(
          (item) => item.code?.toUpperCase() === "NEXAVPS",
        );

        setMargin(
          Number(settingsResponse.data?.nexaVpsProfitMarginPercent ?? 20),
        );
        setDedicatedIpEnabled(
          settingsResponse.data?.dedicatedIpEnabled === true,
        );

        if (!nexa) {
          setError("Nexa VPS provider was not found.");
          return;
        }

        setProvider(nexa);

        const [catalogueResult, statusResult] = await Promise.allSettled([
          adminApi.get(`/admin/providers/${nexa.id}/catalogue`),
          adminApi.get(`/admin/providers/${nexa.id}/sync-status`),
        ]);

        if (cancelled) return;

        if (catalogueResult.status === "fulfilled") {
          const receivedPlans = catalogueResult.value.data?.plans;
          setPlans(Array.isArray(receivedPlans) ? receivedPlans : []);
        } else {
          setCatalogueError(
            "Unable to load the live Nexa catalogue. Please try again later.",
          );
        }

        if (statusResult.status === "fulfilled") {
          setSyncStatus(statusResult.value.data);
        } else {
          setSyncError(
            "Unable to retrieve sync status. Please check the backend and database connection.",
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err.response?.data?.message || "Unable to load Dedicated IP settings.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveMargin = async (event: React.FormEvent) => {
    event.preventDefault();

    const value = Number(margin);

    if (
      margin === "" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 80
    ) {
      setError("Nexa profit margin must be between 0% and 80%.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await adminApi.put("/admin/vps/renewal/settings", {
        nexaVpsProfitMarginPercent: value,
      });

      setMargin(value);
      setMessage("Nexa Dedicated IP profit margin saved successfully.");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Failed to save Nexa profit margin.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async () => {
    const nextValue = !dedicatedIpEnabled;
    setAvailabilitySaving(true);
    setError("");
    setMessage("");

    try {
      await adminApi.put("/admin/vps/renewal/settings", {
        dedicatedIpEnabled: nextValue,
      });
      setDedicatedIpEnabled(nextValue);
      setMessage(
        nextValue
          ? "Dedicated IP is now enabled on the customer website."
          : "Dedicated IP is now hidden from the customer website.",
      );
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Failed to update Dedicated IP website availability.",
      );
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const handleSyncCatalogue = async () => {
    if (
      syncing ||
      !provider ||
      !syncStatus ||
      syncStatus.migrationRequired !== false ||
      syncStatus.isSyncInProgress
    ) {
      return;
    }

    setSyncing(true);
    setSyncError("");
    setMessage("");

    try {
      const response = await adminApi.post(
        `/admin/providers/${provider.id}/sync-catalogue`,
      );

      if (response.data?.success !== true) {
        throw new Error(
          response.data?.message || "Dedicated IP catalogue sync failed.",
        );
      }

      const [catalogueResult, statusResult] = await Promise.all([
        adminApi.get(`/admin/providers/${provider.id}/catalogue`),
        adminApi.get(`/admin/providers/${provider.id}/sync-status`),
      ]);

      setPlans(
        Array.isArray(catalogueResult.data?.plans)
          ? catalogueResult.data.plans
          : [],
      );
      setSyncStatus(statusResult.data);
      setMessage("Dedicated IP catalogue synchronized successfully.");
    } catch (err: any) {
      setSyncError(
        err.response?.data?.message ||
          err.message ||
          "Dedicated IP catalogue synchronization failed.",
      );

      try {
        const statusResult = await adminApi.get(
          `/admin/providers/${provider.id}/sync-status`,
        );
        setSyncStatus(statusResult.data);
      } catch {
        // Keep the existing sync status if refresh fails.
      }
    } finally {
      setSyncing(false);
    }
  };

  const inStockCount = plans.filter((plan) => plan.inStock === true).length;
  const outOfStockCount = plans.filter((plan) => plan.inStock === false).length;

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString() : "Never";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">Dedicated IP Catalogue</h1>
        <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">
          Manage Nexa Dedicated IP pricing, synchronization and client-facing availability.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-4 font-mono text-xs text-red-300">
          <AlertCircle size={16} className="shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-[#C6A66B]/30 bg-[#C6A66B]/10 p-4 font-mono text-xs text-[#C6A66B]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C6A66B]" />
          <span>{message}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-16 text-center font-mono text-xs text-[#F1E9DA]/50">
          <RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]" size={22} />
          Loading Dedicated IP catalogue records...
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-base font-bold text-[#F1E9DA]">
                  Customer Website Availability
                </h2>
                <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">
                  Control whether the Dedicated IP section is visible to public and authenticated clients.
                  When enabled, synced in-stock plans appear automatically.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dedicatedIpEnabled ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <p className={`font-mono text-xs font-semibold ${
                    dedicatedIpEnabled ? "text-emerald-400" : "text-amber-400"
                  }`}>
                    {dedicatedIpEnabled ? "CURRENTLY ACTIVE — VISIBLE TO CLIENTS" : "CURRENTLY DISABLED — HIDDEN FROM WEBSITE"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleAvailability}
                disabled={availabilitySaving}
                aria-pressed={dedicatedIpEnabled}
                className={`rounded-xl px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-wider transition disabled:cursor-wait disabled:opacity-50 ${
                  dedicatedIpEnabled
                    ? "border border-red-500/30 bg-red-950/20 text-red-300 hover:bg-red-900/30"
                    : "bg-[#C6A66B] text-[#171717] hover:bg-[#d8b87d]"
                }`}
              >
                {availabilitySaving
                  ? "Saving..."
                  : dedicatedIpEnabled
                    ? "Turn Off"
                    : "Turn On"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#332f2a] bg-[#171717] text-[#C6A66B]">
                <Save size={16} />
              </div>
              <h2 className="font-serif text-base font-bold text-[#F1E9DA]">Nexa Margin Settings</h2>
            </div>

            <form
              onSubmit={handleSaveMargin}
              className="flex flex-col gap-4 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
                  Dedicated IP Profit Margin (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={80}
                  step={0.01}
                  value={margin}
                  onChange={(event) =>
                    setMargin(
                      event.target.value === "" ? "" : Number(event.target.value),
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-sm text-[#F1E9DA] outline-none transition focus:border-[#C6A66B] focus:ring-1 focus:ring-[#C6A66B]"
                  required
                />
                <p className="mt-1.5 font-mono text-[11px] text-[#F1E9DA]/40">
                  Customer Price = Provider Cost / (1 - Margin / 100). Valid range: 0–80%.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C6A66B] px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d] disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? "Saving..." : "Save Margin"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#332f2a] bg-[#171717] text-[#C6A66B]">
                <Database size={16} />
              </div>
              <h2 className="font-serif text-base font-bold text-[#F1E9DA]">Catalogue Synchronization</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">Sync Status</p>
                <p className="mt-2 font-mono text-sm font-bold text-[#F1E9DA]">
                  {syncStatus?.status || "UNAVAILABLE"}
                </p>
              </div>
              <div className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">Synced Plans</p>
                <p className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA]">
                  {syncStatus?.syncedPlanCount ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">Synced Pools</p>
                <p className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA]">
                  {syncStatus?.syncedPoolCount ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">Last Successful Sync</p>
                <p className="mt-2 font-mono text-xs font-medium text-[#F1E9DA]/70">
                  {formatDate(syncStatus?.lastSuccessAt ?? null)}
                </p>
              </div>
            </div>

            {syncStatus?.lastError && (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 font-mono text-xs text-red-300">
                Last sync error: {syncStatus.lastError}
              </p>
            )}

            {syncError && (
              <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 font-mono text-xs text-amber-400">
                <AlertCircle size={15} />
                {syncError}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#332f2a] pt-4">
              <p className="font-sans text-xs text-[#F1E9DA]/50 max-w-xl">
                {syncStatus?.migrationRequired === true
                  ? "Migration pending: Dedicated IP database tables are unavailable. Sync remains locked."
                  : !syncStatus
                    ? "Sync is locked because migration status could not be verified."
                    : "Fetches Nexa plans and pools and updates the local catalogue. No purchases or wallet deductions are made."}
              </p>
              <button
                type="button"
                disabled={
                  loading ||
                  !provider ||
                  !syncStatus ||
                  syncStatus.migrationRequired !== false ||
                  syncStatus.isSyncInProgress ||
                  syncing
                }
                onClick={handleSyncCatalogue}
                title={
                  syncStatus?.migrationRequired === true
                    ? "Unavailable until the Dedicated IP database migration is applied."
                    : "Synchronize the Nexa Dedicated IP catalogue."
                }
                className="inline-flex items-center gap-2 rounded-xl border border-[#C6A66B]/50 bg-[#C6A66B]/10 px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B] transition hover:bg-[#C6A66B]/20 disabled:cursor-not-allowed disabled:border-[#332f2a] disabled:bg-[#171717] disabled:text-[#F1E9DA]/30"
              >
                <RefreshCw size={14} className={syncing || syncStatus?.isSyncInProgress ? "animate-spin" : ""} />
                {syncing || syncStatus?.isSyncInProgress ? "Syncing..." : "Sync Now"}
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#332f2a] bg-[#171717] text-[#C6A66B]">
                  <Server size={16} />
                </div>
                <h2 className="font-serif text-base font-bold text-[#F1E9DA]">Live Nexa Catalogue Preview</h2>
              </div>
              <span className="font-mono text-xs text-[#C6A66B]">
                {provider?.name || "Nexa VPS"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
                <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Total Live Plans</p>
                <p className="mt-2 font-serif text-3xl font-bold text-[#F1E9DA]">{plans.length}</p>
              </div>
              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
                <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">In Stock</p>
                <p className="mt-2 font-serif text-3xl font-bold text-emerald-400">{inStockCount}</p>
              </div>
              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
                <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Out of Stock</p>
                <p className="mt-2 font-serif text-3xl font-bold text-red-400">{outOfStockCount}</p>
              </div>
            </div>

            {catalogueError && (
              <p className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 font-mono text-xs text-red-300">
                {catalogueError}
              </p>
            )}

            {!catalogueError && plans.length === 0 ? (
              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-12 text-center font-mono text-xs text-[#F1E9DA]/50">
                No live plans returned by Nexa.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left font-sans text-sm">
                    <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                      <tr>
                        <th className="px-5 py-3.5">Plan</th>
                        <th className="px-5 py-3.5">Category / Tier</th>
                        <th className="px-5 py-3.5">Location</th>
                        <th className="px-5 py-3.5">Duration / Speed</th>
                        <th className="px-5 py-3.5">API Cost</th>
                        <th className="px-5 py-3.5">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#332f2a]">
                      {plans.map((plan, index) => (
                        <tr key={String(plan.planId ?? index)} className="transition hover:bg-[#292521]/60">
                          <td className="px-5 py-4">
                            <p className="font-medium text-[#F1E9DA]">
                              {plan.planName || `Plan ${index + 1}`}
                            </p>
                            <p className="font-mono text-xs text-[#F1E9DA]/40">
                              ID: {plan.planId ?? "—"}
                            </p>
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">
                            {plan.categoryName || "—"}
                            <p className="text-[#F1E9DA]/40">
                              {plan.tierLabel || plan.tier || "—"} · {plan.controlMode || "—"}
                            </p>
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">
                            {[plan.location, plan.countryName].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">
                            {plan.duration ?? "—"} / {plan.speed || "—"}
                          </td>
                          <td className="px-5 py-4 font-mono text-sm font-semibold text-[#C6A66B]">
                            {plan.currency || "INR"} {plan.apiPrice ?? "—"}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
                              plan.inStock
                                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                : "border border-red-500/30 bg-red-500/10 text-red-400"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${plan.inStock ? "bg-emerald-400" : "bg-red-400"}`} />
                              {plan.inStock ? "In Stock" : "Out of Stock"}
                            </span>
                            {plan.stock !== undefined && (
                              <p className="mt-1 font-mono text-[10px] text-[#F1E9DA]/40">
                                Qty: {plan.stock}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
