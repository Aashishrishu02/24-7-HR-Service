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
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dedicated IP Catalogue</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage Nexa Dedicated IP pricing, catalogue and synchronization.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-[#111a2b] p-8 text-center text-slate-400">
          Loading Dedicated IP catalogue...
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-slate-700 bg-[#111a2b] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-white">
                  Customer Website Availability
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Control whether the Dedicated IP section is visible to customers.
                  When enabled, synced in-stock plans appear automatically.
                </p>
                <p className={`mt-2 text-sm font-semibold ${
                  dedicatedIpEnabled ? "text-emerald-400" : "text-amber-400"
                }`}>
                  {dedicatedIpEnabled ? "Currently ON — visible to customers" : "Currently OFF — hidden from customers"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleAvailability}
                disabled={availabilitySaving}
                aria-pressed={dedicatedIpEnabled}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50 ${
                  dedicatedIpEnabled
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-slate-600 hover:bg-slate-500"
                }`}
              >
                {availabilitySaving
                  ? "Saving..."
                  : dedicatedIpEnabled
                    ? "Turn OFF"
                    : "Turn ON"}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-[#111a2b] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Save size={18} className="text-blue-400" />
              <h2 className="font-semibold text-white">Nexa Pricing Settings</h2>
            </div>

            <form
              onSubmit={handleSaveMargin}
              className="flex flex-col gap-4 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-300">
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
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-500"
                  required
                />
                <p className="mt-2 text-xs text-slate-500">
                  Selling price = Provider cost / (1 - margin / 100). Allowed range: 0–80%.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Margin"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-700 bg-[#111a2b] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Database size={18} className="text-violet-400" />
              <h2 className="font-semibold text-white">Catalogue Synchronization</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-slate-900 p-4">
                <p className="text-xs text-slate-400">Sync Status</p>
                <p className="mt-2 font-semibold text-white">
                  {syncStatus?.status || "UNAVAILABLE"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900 p-4">
                <p className="text-xs text-slate-400">Synced Plans</p>
                <p className="mt-2 text-xl font-bold text-white">
                  {syncStatus?.syncedPlanCount ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900 p-4">
                <p className="text-xs text-slate-400">Synced Pools</p>
                <p className="mt-2 text-xl font-bold text-white">
                  {syncStatus?.syncedPoolCount ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900 p-4">
                <p className="text-xs text-slate-400">Last Successful Sync</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {formatDate(syncStatus?.lastSuccessAt ?? null)}
                </p>
              </div>
            </div>

            {syncStatus?.lastError && (
              <p className="mt-3 text-sm text-red-400">
                Last sync error: {syncStatus.lastError}
              </p>
            )}

            {syncError && (
              <p className="mt-3 flex items-center gap-2 text-sm text-amber-400">
                <AlertCircle size={16} />
                {syncError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
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
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:opacity-60"
              >
                <RefreshCw size={15} />
                {syncing || syncStatus?.isSyncInProgress ? "Syncing..." : "Sync Now"}
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server size={18} className="text-blue-400" />
                <h2 className="font-semibold text-white">Live Nexa Catalogue Preview</h2>
              </div>
              <span className="text-xs text-slate-500">
                {provider?.name || "Nexa VPS"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-700 bg-[#111a2b] p-4">
                <p className="text-xs text-slate-400">Total Live Plans</p>
                <p className="mt-2 text-2xl font-bold text-white">{plans.length}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-[#111a2b] p-4">
                <p className="text-xs text-slate-400">In Stock</p>
                <p className="mt-2 text-2xl font-bold text-emerald-400">{inStockCount}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-[#111a2b] p-4">
                <p className="text-xs text-slate-400">Out of Stock</p>
                <p className="mt-2 text-2xl font-bold text-red-400">{outOfStockCount}</p>
              </div>
            </div>

            {catalogueError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {catalogueError}
              </p>
            )}

            {!catalogueError && plans.length === 0 ? (
              <div className="rounded-xl border border-slate-700 bg-[#111a2b] p-6 text-center text-sm text-slate-400">
                No live plans returned by Nexa.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-800 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Category / Tier</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Duration / Speed</th>
                      <th className="px-4 py-3">API Cost</th>
                      <th className="px-4 py-3">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-[#111a2b]">
                    {plans.map((plan, index) => (
                      <tr key={String(plan.planId ?? index)}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">
                            {plan.planName || `Plan ${index + 1}`}
                          </p>
                          <p className="text-xs text-slate-500">
                            ID: {plan.planId ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {plan.categoryName || "—"}
                          <p className="text-xs text-slate-500">
                            {plan.tierLabel || plan.tier || "—"} · {plan.controlMode || "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {[plan.location, plan.countryName].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {plan.duration ?? "—"} / {plan.speed || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {plan.currency || "INR"} {plan.apiPrice ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={
                            plan.inStock
                              ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400"
                              : "rounded-full bg-red-500/10 px-2 py-1 text-xs text-red-400"
                          }>
                            {plan.inStock ? "In Stock" : "Out of Stock"}
                          </span>
                          {plan.stock !== undefined && (
                            <p className="mt-1 text-xs text-slate-500">
                              Qty: {plan.stock}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
