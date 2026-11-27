import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Save,
  Server,
  AlertCircle,
  CheckCircle2,
  Power,
} from "lucide-react";
import adminApi from "../adminApi";

type SmartVpsPlan = {
  ramGb: number;
  availableCount: number;
  enabled: boolean;
  providerCost: number | null;
  sellingPrice: number | null;
  currency: string;
  customerVisible: boolean;
};

type SmartVpsOverview = {
  provider: string;
  providerStatus: string;
  refreshedAt: string | null;
  profitMarginPercent: number;
  plans: SmartVpsPlan[];
};

const money = (value: number | null) =>
  value === null
    ? "Not configured"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(value);

export default function SmartVPS() {
  const [overview, setOverview] = useState<SmartVpsOverview | null>(null);
  const [plans, setPlans] = useState<SmartVpsPlan[]>([]);
  const [margin, setMargin] = useState<number | "">(20);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);
  const [savingMargin, setSavingMargin] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadOverview = useCallback(async () => {
    setError("");

    try {
      const [overviewResponse, settingsResponse] = await Promise.all([
        adminApi.get("/admin/smartvps"),
        adminApi.get("/admin/vps/renewal/settings"),
      ]);

      const data: SmartVpsOverview = overviewResponse.data;
      setOverview(data);
      setPlans(Array.isArray(data.plans) ? data.plans : []);
      setMargin(
        Number(
          settingsResponse.data?.smartVpsProfitMarginPercent ??
            data.profitMarginPercent ??
            20,
        ),
      );
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to load SmartVPS stock and settings.",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialLoad = async () => {
      setLoading(true);
      await loadOverview();
      if (!cancelled) setLoading(false);
    };

    void initialLoad();

    return () => {
      cancelled = true;
    };
  }, [loadOverview]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setMessage("");
    await loadOverview();
    setRefreshing(false);
  };

  const updatePlan = (
    ramGb: number,
    changes: Partial<SmartVpsPlan>,
  ) => {
    setPlans((current) =>
      current.map((plan) =>
        plan.ramGb === ramGb ? { ...plan, ...changes } : plan,
      ),
    );
  };

  const handleSavePlans = async () => {
    setSavingPlans(true);
    setError("");
    setMessage("");

    try {
      await adminApi.put("/admin/smartvps/plans", {
        plans: plans.map((plan) => ({
          ramGb: plan.ramGb,
          providerCost: plan.providerCost,
          enabled: plan.enabled,
        })),
      });

      setMessage("SmartVPS RAM plan settings saved successfully.");
      await loadOverview();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Failed to save SmartVPS plan settings.",
      );
    } finally {
      setSavingPlans(false);
    }
  };

  const handleSaveMargin = async (event: React.FormEvent) => {
    event.preventDefault();

    const value = Number(margin);

    if (
      margin === "" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 80
    ) {
      setError("SmartVPS profit margin must be between 0% and 80%.");
      return;
    }

    setSavingMargin(true);
    setError("");
    setMessage("");

    try {
      await adminApi.put("/admin/vps/renewal/settings", {
        smartVpsProfitMarginPercent: value,
      });

      setMargin(value);
      setMessage("SmartVPS profit margin saved successfully.");
      await loadOverview();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Failed to save SmartVPS profit margin.",
      );
    } finally {
      setSavingMargin(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-[#F1E9DA]/60">
        <RefreshCw size={18} className="animate-spin text-[#C6A66B]" />
        Loading SmartVPS configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#C6A66B]/20 bg-[#C6A66B]/10 text-[#C6A66B]">
              <Server size={21} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-[#F1E9DA]">
                SmartVPS Management
              </h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/45">
                Ocean VPS · Independent catalogue and pricing
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {overview?.providerStatus || "Unknown"}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-xs font-bold text-[#C6A66B] transition hover:border-[#C6A66B]/50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh Live Stock"}
          </button>
        </div>
      </div>

      {overview?.refreshedAt && (
        <p className="font-mono text-[10px] text-[#F1E9DA]/40">
          Last stock refresh:{" "}
          {new Date(overview.refreshedAt).toLocaleString("en-IN")}
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          <CheckCircle2 size={17} />
          {message}
        </div>
      )}

      <form
        onSubmit={handleSaveMargin}
        className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5"
      >
        <div className="mb-4">
          <h3 className="font-serif text-lg font-bold text-[#F1E9DA]">
            SmartVPS Profit Margin
          </h3>
          <p className="mt-1 text-xs text-[#F1E9DA]/50">
            Admin-controlled gross margin. This setting is independent of Nexa
            and HostHeaven.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block max-w-xs flex-1">
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/55">
              Profit margin percentage (0–80%)
            </span>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="80"
                step="0.01"
                value={margin}
                onChange={(event) =>
                  setMargin(
                    event.target.value === ""
                      ? ""
                      : Number(event.target.value),
                  )
                }
                className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 pr-10 font-mono text-sm text-[#F1E9DA] outline-none focus:border-[#C6A66B]/60"
              />
              <span className="absolute right-4 top-3 font-mono text-sm text-[#C6A66B]">
                %
              </span>
            </div>
          </label>

          <button
            type="submit"
            disabled={savingMargin}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8ba82] disabled:opacity-50"
          >
            <Save size={14} />
            {savingMargin ? "Saving..." : "Save Margin"}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-[#F1E9DA]/40">
          Selling price = Provider cost ÷ (1 − margin ÷ 100)
        </p>
      </form>

      <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
        <div className="border-b border-[#332f2a] p-5">
          <h3 className="font-serif text-lg font-bold text-[#F1E9DA]">
            RAM-wise Stock and Pricing
          </h3>
          <p className="mt-1 text-xs text-[#F1E9DA]/50">
            Configure provider cost and customer visibility for each RAM plan.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="bg-[#171717]">
              <tr className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/45">
                <th className="px-5 py-4">RAM</th>
                <th className="px-5 py-4">Live Available</th>
                <th className="px-5 py-4">Provider Cost (₹)</th>
                <th className="px-5 py-4">Customer Price</th>
                <th className="px-5 py-4">Enable Plan</th>
                <th className="px-5 py-4">Catalogue Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#332f2a]">
              {plans.map((plan) => {
                const calculatedPrice =
                  plan.providerCost !== null &&
                  Number.isFinite(Number(margin)) &&
                  Number(margin) < 100
                    ? Number(
                        (
                          plan.providerCost /
                          (1 - Number(margin) / 100)
                        ).toFixed(2),
                      )
                    : null;

                const visible =
                  plan.enabled &&
                  plan.availableCount > 0 &&
                  plan.providerCost !== null;

                return (
                  <tr key={plan.ramGb} className="hover:bg-[#292521]/40">
                    <td className="px-5 py-4 font-mono text-sm font-bold text-[#C6A66B]">
                      {plan.ramGb} GB
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-sm font-semibold text-[#F1E9DA]">
                        {plan.availableCount}
                      </span>
                      <span className="ml-2 text-[10px] text-[#F1E9DA]/40">
                        units
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={plan.providerCost ?? ""}
                        onChange={(event) =>
                          updatePlan(plan.ramGb, {
                            providerCost:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          })
                        }
                        placeholder="Enter cost"
                        className="w-36 rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-2 font-mono text-xs text-[#F1E9DA] outline-none focus:border-[#C6A66B]/60"
                      />
                    </td>
                    <td className="px-5 py-4 font-mono text-sm font-semibold text-[#F1E9DA]">
                      {money(calculatedPrice)}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={plan.enabled}
                        onClick={() =>
                          updatePlan(plan.ramGb, {
                            enabled: !plan.enabled,
                          })
                        }
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition ${
                          plan.enabled
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-[#332f2a] bg-[#171717] text-[#F1E9DA]/45"
                        }`}
                      >
                        <Power size={13} />
                        {plan.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${
                          visible
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                            : "border-amber-500/25 bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {visible ? "Customer visible" : "Hidden"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {plans.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm text-[#F1E9DA]/45"
                  >
                    No SmartVPS RAM plans were returned by the backend.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-[#332f2a] p-5 sm:flex-row sm:items-center">
          <p className="text-xs text-[#F1E9DA]/45">
            Only enabled plans with live stock and a configured provider cost
            qualify for the customer catalogue.
          </p>
          <button
            type="button"
            onClick={handleSavePlans}
            disabled={savingPlans || plans.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8ba82] disabled:opacity-50"
          >
            <Save size={14} />
            {savingPlans ? "Saving..." : "Save Plan Settings"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200/80">
        SmartVPS catalogue configuration does not activate customer purchases.
        A separate verified payment and provisioning flow is still required
        before enabling Buy Now for SmartVPS.
      </div>
    </div>
  );
}
