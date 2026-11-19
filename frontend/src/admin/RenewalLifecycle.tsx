
import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Settings,
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Play,
  Calendar,
  Shield,
  Save,
} from "lucide-react";
import adminApi from "../adminApi";

type SubTab = "SETTINGS" | "UPCOMING" | "HISTORY" | "INSUFFICIENT" | "SUSPENDED";

type RenewalSettings = {
  renewalWindowDays: number;
  gracePeriodDays: number;
  preExpiryNotificationDays: number[];
  lowBalanceNotificationHours: number;
  suspensionPolicy: string;
  terminationPolicy: string;
  renewalPricingModel: string;
  hostHeavenMarkupPercent: number;
  hostHeavenProfitMarginPercent: number;
};

type UpcomingRenewal = {
  id: string;
  ipAddress: string;
  hostname: string | null;
  status: string;
  expiresAt: string;
  autoRenew: boolean;
  autoRenewConsentAt: string | null;
  gracePeriodDays: number;
  user: { id: string; name: string | null; email: string };
  order: { plan?: { name: string; price: number | string } | null } | null;
  renewalAttempts?: { status: string; attemptedAt: string }[];
};

type RenewalAttempt = {
  id: string;
  vpsId: string;
  userId: string;
  status: string;
  renewalAmount: number | string;
  walletBalance: number | string | null;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
  errorMessage: string | null;
  attemptedAt: string;
  user: { id: string; name: string | null; email: string };
  vps: { id: string; ipAddress: string; hostname: string | null; status: string };
};

type SuspendedInstance = {
  id: string;
  ipAddress: string;
  hostname: string | null;
  status: string;
  expiresAt: string | null;
  suspendedAt: string | null;
  gracePeriodExpiresAt: string | null;
  providerSuspended: boolean;
  user: { id: string; name: string | null; email: string };
};

export default function RenewalLifecycle() {
  const [tab, setTab] = useState<SubTab>("SETTINGS");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Settings State
  const [settings, setSettings] = useState<RenewalSettings>({
    renewalWindowDays: 7,
    gracePeriodDays: 3,
    preExpiryNotificationDays: [7, 3, 1],
    lowBalanceNotificationHours: 24,
    suspensionPolicy: "AUTO_SUSPEND_ON_EXPIRY",
    terminationPolicy: "AUTO_TERMINATE_AFTER_GRACE",
    renewalPricingModel: "PLAN_SELLING_PRICE",
    hostHeavenMarkupPercent: 25,
    hostHeavenProfitMarginPercent: 20,
  });

  const [preExpiryInput, setPreExpiryInput] = useState("7, 3, 1");

  // Data States
  const [upcoming, setUpcoming] = useState<UpcomingRenewal[]>([]);
  const [history, setHistory] = useState<RenewalAttempt[]>([]);
  const [historyFilter, setHistoryFilter] = useState("ALL");
  const [insufficientCases, setInsufficientCases] = useState<RenewalAttempt[]>([]);
  const [suspended, setSuspended] = useState<SuspendedInstance[]>([]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await adminApi.get("/admin/vps/renewal/settings");

      if (res.data) {
        setSettings((previous) => ({
          ...previous,
          ...res.data,
          hostHeavenProfitMarginPercent: Number(
            res.data.hostHeavenProfitMarginPercent ?? 20,
          ),
          hostHeavenMarkupPercent: Number(
            res.data.hostHeavenMarkupPercent ?? 25,
          ),
        }));

        if (Array.isArray(res.data.preExpiryNotificationDays)) {
          setPreExpiryInput(res.data.preExpiryNotificationDays.join(", "));
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load renewal settings");
    }
  }, []);

  const fetchUpcoming = useCallback(async () => {
    try {
      const res = await adminApi.get("/admin/vps/renewal/upcoming");
      setUpcoming(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load upcoming renewals");
    }
  }, []);

  const fetchHistory = useCallback(async (status?: string) => {
    try {
      const query = status && status !== "ALL" ? `?status=${status}` : "";
      const res = await adminApi.get(`/admin/vps/renewal/history${query}`);
      setHistory(res.data?.attempts || []);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load renewal history");
    }
  }, []);

  const fetchInsufficient = useCallback(async () => {
    try {
      const res = await adminApi.get("/admin/vps/renewal/insufficient-balance");
      setInsufficientCases(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load insufficient balance cases");
    }
  }, []);

  const fetchSuspended = useCallback(async () => {
    try {
      const res = await adminApi.get("/admin/vps/lifecycle/suspended");
      setSuspended(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load suspended instances");
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
    void fetchUpcoming();
    void fetchHistory();
    void fetchInsufficient();
    void fetchSuspended();
  }, [fetchSettings, fetchUpcoming, fetchHistory, fetchInsufficient, fetchSuspended]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      isNaN(Number(settings.hostHeavenProfitMarginPercent)) ||
      settings.hostHeavenProfitMarginPercent < 0 ||
      settings.hostHeavenProfitMarginPercent > 80
    ) {
      setError("HostHeaven profit margin must be between 0% and 80%.");
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const res = await adminApi.put("/admin/vps/renewal/settings", {
        renewalWindowDays: Number(settings.renewalWindowDays),
        gracePeriodDays: Number(settings.gracePeriodDays),
        preExpiryNotificationDays: preExpiryInput,
        lowBalanceNotificationHours: Number(settings.lowBalanceNotificationHours),
        suspensionPolicy: settings.suspensionPolicy,
        terminationPolicy: settings.terminationPolicy,
        renewalPricingModel: settings.renewalPricingModel,
        hostHeavenProfitMarginPercent: Number(settings.hostHeavenProfitMarginPercent),
        hostHeavenMarkupPercent: Number(settings.hostHeavenMarkupPercent),
      });

      setSettings((previous) => ({
        ...previous,
        ...res.data,
        hostHeavenProfitMarginPercent: Number(
          res.data.hostHeavenProfitMarginPercent ?? 20,
        ),
        hostHeavenMarkupPercent: Number(
          res.data.hostHeavenMarkupPercent ?? 25,
        ),
      }));

      setMessage("Renewal, lifecycle and HostHeaven pricing settings updated successfully!");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerCycle = async (type: "RENEWAL" | "LIFECYCLE" | "SCHEDULER") => {
    setActionLoading(type);
    setMessage("");
    setError("");

    try {
      let endpoint = "/admin/vps/renewal/trigger";

      if (type === "LIFECYCLE") endpoint = "/admin/vps/lifecycle/trigger";
      if (type === "SCHEDULER") endpoint = "/admin/vps/lifecycle/scheduler/trigger";

      const res = await adminApi.post(endpoint);

      setMessage(`Execution successful: ${JSON.stringify(res.data)}`);

      await Promise.all([
        fetchUpcoming(),
        fetchHistory(historyFilter),
        fetchInsufficient(),
        fetchSuspended(),
      ]);
    } catch (err: any) {
      setError(err.response?.data?.message || `Failed to run ${type} cycle`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryAction = async (
    vpsId: string,
    action: "RENEW" | "SUSPEND" | "TERMINATE",
  ) => {
    setActionLoading(`${action}-${vpsId}`);
    setMessage("");
    setError("");

    try {
      let endpoint = `/admin/vps/renewal/${vpsId}/retry`;

      if (action === "SUSPEND") {
        endpoint = `/admin/vps/lifecycle/${vpsId}/retry-suspend`;
      }

      if (action === "TERMINATE") {
        endpoint = `/admin/vps/lifecycle/${vpsId}/retry-terminate`;
      }

      const res = await adminApi.post(endpoint);

      setMessage(`Action ${action} completed: ${res.data?.message || "Success"}`);

      await Promise.all([
        fetchUpcoming(),
        fetchHistory(historyFilter),
        fetchInsufficient(),
        fetchSuspended(),
      ]);
    } catch (err: any) {
      setError(err.response?.data?.message || `Failed to execute ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Execution Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-800 bg-[#0d1525] p-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <RefreshCw className="text-blue-400" size={22} />
            Auto-Renewal & Lifecycle Engine
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Scheduled wallet renewal, grace period management, provider timeouts, and customer notification tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={actionLoading !== null}
            onClick={() => handleTriggerCycle("RENEWAL")}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            <Play size={14} /> Run Renewal Cycle
          </button>

          <button
            disabled={actionLoading !== null}
            onClick={() => handleTriggerCycle("LIFECYCLE")}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            <Clock size={14} /> Run Lifecycle Check
          </button>

          <button
            disabled={actionLoading !== null}
            onClick={() => handleTriggerCycle("SCHEDULER")}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={14} /> Run Full Scheduler
          </button>
        </div>
      </div>

      {/* Alerts */}
      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { key: "SETTINGS", label: "Settings", icon: Settings },
          { key: "UPCOMING", label: `Upcoming Renewals (${upcoming.length})`, icon: Calendar },
          { key: "HISTORY", label: "Renewal History", icon: Clock },
          { key: "INSUFFICIENT", label: `Insufficient Balance (${insufficientCases.length})`, icon: AlertTriangle },
          { key: "SUSPENDED", label: `Suspended & Grace Period (${suspended.length})`, icon: Shield },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as SubTab)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              tab === key
                ? "bg-blue-600 text-white"
                : "border border-slate-800 bg-[#0d1525] text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* TAB 1: SETTINGS */}
      {tab === "SETTINGS" && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-2xl border border-slate-800 bg-[#0d1525] p-6 space-y-6"
        >
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Settings size={18} className="text-blue-400" />
            Platform Auto-Renewal & Grace Period Configuration
          </h3>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-300">
                Renewal Window (Days Before Expiry)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={settings.renewalWindowDays}
                onChange={(e) =>
                  setSettings({ ...settings, renewalWindowDays: Number(e.target.value) })
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                The scheduler will attempt to renew servers that expire within this window (e.g. 7 days before expiry).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">
                Grace Period Duration (Days After Expiry)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={settings.gracePeriodDays}
                onChange={(e) =>
                  setSettings({ ...settings, gracePeriodDays: Number(e.target.value) })
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Number of days an expired server is kept in stopped/suspended state before permanent termination.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">
                Pre-Expiry Email Milestones (Days)
              </label>
              <input
                type="text"
                value={preExpiryInput}
                onChange={(e) => setPreExpiryInput(e.target.value)}
                placeholder="7, 3, 1"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Comma-separated days before expiry to send reminder notifications to the customer.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">
                Low-Balance Warning Throttle (Hours)
              </label>
              <input
                type="number"
                min={1}
                max={168}
                value={settings.lowBalanceNotificationHours}
                onChange={(e) =>
                  setSettings({ ...settings, lowBalanceNotificationHours: Number(e.target.value) })
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Minimum cooldown period before repeating low wallet balance alerts.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">
                HostHeaven Profit Margin (%)
              </label>
              <input
                type="number"
                min={0}
                max={80}
                step={1}
                value={settings.hostHeavenProfitMarginPercent}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    hostHeavenProfitMarginPercent: Number(e.target.value),
                  })
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Gross profit margin on provider cost. Formula: sellingPrice = providerCost / (1 - margin/100). Default: 20% (₹1,000 cost → ₹1,250 customer price).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">
                Suspension Policy
              </label>
              <select
                value={settings.suspensionPolicy}
                onChange={(e) =>
                  setSettings({ ...settings, suspensionPolicy: e.target.value })
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="AUTO_SUSPEND_ON_EXPIRY">
                  AUTO_SUSPEND_ON_EXPIRY (Automatically stop server upon expiry)
                </option>
                <option value="MANUAL_SUSPEND">
                  MANUAL_SUSPEND (Do not automatically suspend)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">
                Termination Policy
              </label>
              <select
                value={settings.terminationPolicy}
                onChange={(e) =>
                  setSettings({ ...settings, terminationPolicy: e.target.value })
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="AUTO_TERMINATE_AFTER_GRACE">
                  AUTO_TERMINATE_AFTER_GRACE (Verify provider & terminate after grace)
                </option>
                <option value="MANUAL_TERMINATE">
                  MANUAL_TERMINATE (Require admin manual approval)
                </option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <Save size={16} /> {loading ? "Saving..." : "Save Configuration"}
          </button>
        </form>
      )}

      {/* TAB 2: UPCOMING RENEWALS */}
      {tab === "UPCOMING" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0d1525] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-white text-sm">
              Expiring Instances within {settings.renewalWindowDays} Days Window
            </h3>
            <span className="text-xs text-slate-400">Total: {upcoming.length}</span>
          </div>

          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No VPS instances currently expiring in this window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5">IP Address / Host</th>
                    <th>Customer</th>
                    <th>Expiry Date</th>
                    <th>Auto-Renew</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {upcoming.map((vps) => (
                    <tr key={vps.id} className="hover:bg-slate-800/20">
                      <td className="py-3 font-semibold text-cyan-300">
                        {vps.ipAddress}
                        <span className="block text-[10px] text-slate-500">
                          {vps.hostname || "—"}
                        </span>
                      </td>
                      <td>
                        {vps.user.name || "Customer"}
                        <span className="block text-[10px] text-slate-500">
                          {vps.user.email}
                        </span>
                      </td>
                      <td>{new Date(vps.expiresAt).toLocaleDateString()}</td>
                      <td>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            vps.autoRenew && vps.autoRenewConsentAt
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-slate-700 text-slate-300"
                          }`}
                        >
                          {vps.autoRenew && vps.autoRenewConsentAt ? "CONSENTED" : "OPTED OUT"}
                        </span>
                      </td>
                      <td className="font-semibold text-emerald-300">
                        ₹{vps.order?.plan?.price || 999}
                      </td>
                      <td>
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                          {vps.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          disabled={actionLoading === `RENEW-${vps.id}`}
                          onClick={() => handleRetryAction(vps.id, "RENEW")}
                          className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          {actionLoading === `RENEW-${vps.id}` ? "Renewing…" : "Renew Now"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: RENEWAL HISTORY */}
      {tab === "HISTORY" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0d1525] p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-bold text-white text-sm">
              Renewal Execution Audit Logs
            </h3>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filter:</span>

              {["ALL", "SUCCESS", "INSUFFICIENT_FUNDS", "FAILED"].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setHistoryFilter(s);
                    fetchHistory(s);
                  }}
                  className={`rounded px-2.5 py-1 text-[11px] font-bold transition ${
                    historyFilter === s
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {history.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No renewal attempt records found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5">Date & Time</th>
                    <th>VPS Instance</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Renewal Amount</th>
                    <th>Wallet Balance</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {history.map((att) => (
                    <tr key={att.id} className="hover:bg-slate-800/20">
                      <td className="py-2.5 text-slate-400">
                        {new Date(att.attemptedAt).toLocaleString()}
                      </td>
                      <td className="font-medium text-cyan-300">
                        {att.vps?.ipAddress || "—"}
                        <span className="block text-[10px] text-slate-500">
                          {att.vps?.hostname}
                        </span>
                      </td>
                      <td>{att.user?.email || "—"}</td>
                      <td>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            att.status === "SUCCESS"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : att.status === "INSUFFICIENT_FUNDS"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {att.status}
                        </span>
                      </td>
                      <td className="font-semibold text-white">
                        ₹{att.renewalAmount}
                      </td>
                      <td className="text-slate-300">
                        ₹{att.walletBalance ?? "—"}
                      </td>
                      <td className="text-[11px] text-slate-400 max-w-xs truncate">
                        {att.errorMessage ||
                          (att.status === "SUCCESS" ? "Renewed successfully" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INSUFFICIENT BALANCE CASES */}
      {tab === "INSUFFICIENT" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0d1525] p-5">
          <div className="mb-4">
            <h3 className="font-bold text-white text-sm">
              Failed Renewals Due to Insufficient Wallet Balance
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Customers who have auto-renewal enabled but require additional wallet funds.
            </p>
          </div>

          {insufficientCases.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No insufficient wallet balance cases.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5">Date Attempted</th>
                    <th>VPS IP</th>
                    <th>Customer Email</th>
                    <th>Required Price</th>
                    <th>Customer Balance</th>
                    <th>Shortfall</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {insufficientCases.map((c) => {
                    const price = Number(c.renewalAmount);
                    const bal = Number(c.walletBalance ?? 0);
                    const shortfall = Math.max(0, price - bal);

                    return (
                      <tr key={c.id} className="hover:bg-slate-800/20">
                        <td className="py-2.5 text-slate-400">
                          {new Date(c.attemptedAt).toLocaleString()}
                        </td>
                        <td className="font-semibold text-cyan-300">
                          {c.vps?.ipAddress}
                        </td>
                        <td>{c.user?.email}</td>
                        <td className="font-semibold text-white">₹{price}</td>
                        <td className="text-slate-300">₹{bal}</td>
                        <td className="font-bold text-red-400">₹{shortfall}</td>
                        <td>
                          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                            INSUFFICIENT
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SUSPENDED & GRACE PERIOD */}
      {tab === "SUSPENDED" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0d1525] p-5">
          <div className="mb-4">
            <h3 className="font-bold text-white text-sm">
              Suspended Instances in Grace Period
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Servers suspended after expiry. Data is preserved until grace period expires.
            </p>
          </div>

          {suspended.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No instances currently suspended.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5">IP Address</th>
                    <th>Customer</th>
                    <th>Suspended At</th>
                    <th>Grace Period Ends</th>
                    <th>Provider Suspended</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {suspended.map((vps) => {
                    const graceOver =
                      vps.gracePeriodExpiresAt &&
                      new Date(vps.gracePeriodExpiresAt).getTime() <= Date.now();

                    return (
                      <tr key={vps.id} className="hover:bg-slate-800/20">
                        <td className="py-3 font-semibold text-cyan-300">
                          {vps.ipAddress}
                        </td>
                        <td>{vps.user?.email}</td>
                        <td className="text-slate-400">
                          {vps.suspendedAt
                            ? new Date(vps.suspendedAt).toLocaleDateString()
                            : "—"}
                        </td>
                        <td>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              graceOver
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {vps.gracePeriodExpiresAt
                              ? new Date(vps.gracePeriodExpiresAt).toLocaleString()
                              : "—"}
                            {graceOver ? " (EXPIRED)" : ""}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              vps.providerSuspended
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-slate-700 text-slate-300"
                            }`}
                          >
                            {vps.providerSuspended
                              ? "CONFIRMED"
                              : "PENDING RECONCILE"}
                          </span>
                        </td>
                        <td className="text-right space-x-2">
                          <button
                            disabled={actionLoading === `SUSPEND-${vps.id}`}
                            onClick={() => handleRetryAction(vps.id, "SUSPEND")}
                            className="rounded bg-amber-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-500 disabled:opacity-50"
                          >
                            Retry Stop
                          </button>

                          <button
                            disabled={actionLoading === `RENEW-${vps.id}`}
                            onClick={() => handleRetryAction(vps.id, "RENEW")}
                            className="rounded bg-blue-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                          >
                            Renew
                          </button>

                          {graceOver && (
                            <button
                              disabled={actionLoading === `TERMINATE-${vps.id}`}
                              onClick={() => handleRetryAction(vps.id, "TERMINATE")}
                              className="rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-500 disabled:opacity-50"
                            >
                              Terminate
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
