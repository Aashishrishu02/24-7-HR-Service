
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
      });

      setSettings((previous) => ({
        ...previous,
        ...res.data,
      }));

      setMessage("Renewal and lifecycle settings updated successfully!");
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6">
        <div>
          <h2 className="font-serif text-xl font-bold text-[#F1E9DA] flex items-center gap-2.5">
            <RefreshCw className="text-[#C6A66B]" size={20} />
            Auto-Renewal & Lifecycle Engine
          </h2>
          <p className="font-sans text-xs text-[#F1E9DA]/60 mt-1">
            Scheduled wallet renewal, grace period management, provider timeouts, and customer notification tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={actionLoading !== null}
            onClick={() => handleTriggerCycle("RENEWAL")}
            className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d] disabled:opacity-50"
          >
            <Play size={13} /> Run Renewal Cycle
          </button>

          <button
            disabled={actionLoading !== null}
            onClick={() => handleTriggerCycle("LIFECYCLE")}
            className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA] transition hover:bg-[#292521] disabled:opacity-50"
          >
            <Clock size={13} /> Lifecycle Check
          </button>

          <button
            disabled={actionLoading !== null}
            onClick={() => handleTriggerCycle("SCHEDULER")}
            className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521] disabled:opacity-50"
          >
            <RefreshCw size={13} /> Full Scheduler
          </button>
        </div>
      </div>

      {/* Alerts */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-[#C6A66B]/30 bg-[#C6A66B]/10 p-4 font-mono text-xs text-[#C6A66B]">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-4 font-mono text-xs text-red-300">
          <AlertCircle size={16} className="text-red-400" /> {error}
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#332f2a] pb-3">
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
            className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${
              tab === key
                ? "bg-[#C6A66B] text-[#171717]"
                : "border border-[#332f2a] bg-[#201d1a] text-[#F1E9DA]/70 hover:bg-[#292521] hover:text-[#F1E9DA]"
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
          className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 space-y-6"
        >
          <div className="flex items-center gap-2.5 border-b border-[#332f2a] pb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#332f2a] bg-[#171717] text-[#C6A66B]">
              <Settings size={16} />
            </div>
            <h3 className="font-serif text-base font-bold text-[#F1E9DA]">
              Platform Auto-Renewal & Grace Period Configuration
            </h3>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
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
                className="mt-2 w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-sm text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
                required
              />
              <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/40">
                The scheduler will attempt to renew servers that expire within this window (e.g. 7 days before expiry).
              </p>
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
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
                className="mt-2 w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-sm text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
                required
              />
              <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/40">
                Number of days an expired server is kept in stopped/suspended state before permanent termination.
              </p>
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
                Pre-Expiry Email Milestones (Days)
              </label>
              <input
                type="text"
                value={preExpiryInput}
                onChange={(e) => setPreExpiryInput(e.target.value)}
                placeholder="7, 3, 1"
                className="mt-2 w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-sm text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
                required
              />
              <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/40">
                Comma-separated days before expiry to send reminder notifications to the customer.
              </p>
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
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
                className="mt-2 w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-sm text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
                required
              />
              <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/40">
                Minimum cooldown period before repeating low wallet balance alerts.
              </p>
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
                Suspension Policy
              </label>
              <select
                value={settings.suspensionPolicy}
                onChange={(e) =>
                  setSettings({ ...settings, suspensionPolicy: e.target.value })
                }
                className="mt-2 w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-xs text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
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
              <label className="block font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
                Termination Policy
              </label>
              <select
                value={settings.terminationPolicy}
                onChange={(e) =>
                  setSettings({ ...settings, terminationPolicy: e.target.value })
                }
                className="mt-2 w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-2.5 font-mono text-xs text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
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

          <div className="border-t border-[#332f2a] pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d] disabled:opacity-50"
            >
              <Save size={14} /> {loading ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: UPCOMING RENEWALS */}
      {tab === "UPCOMING" && (
        <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
          <div className="flex items-center justify-between border-b border-[#332f2a] px-6 py-4">
            <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">
              Expiring Instances within {settings.renewalWindowDays} Days Window
            </h3>
            <span className="font-mono text-xs text-[#F1E9DA]/50">Total: {upcoming.length}</span>
          </div>

          {upcoming.length === 0 ? (
            <p className="p-12 text-center font-mono text-xs text-[#F1E9DA]/50">
              No VPS instances currently expiring in this window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-sm">
                <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                  <tr>
                    <th className="px-5 py-3.5">IP Address / Host</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Expiry Date</th>
                    <th className="px-5 py-3.5">Auto-Renew</th>
                    <th className="px-5 py-3.5">Price</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#332f2a]">
                  {upcoming.map((vps) => (
                    <tr key={vps.id} className="transition hover:bg-[#292521]/60">
                      <td className="px-5 py-4 font-mono font-semibold text-[#C6A66B]">
                        {vps.ipAddress}
                        <span className="block text-[11px] text-[#F1E9DA]/40">
                          {vps.hostname || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[#F1E9DA] font-medium">{vps.user.name || "Customer"}</span>
                        <span className="block font-mono text-[11px] text-[#F1E9DA]/50">
                          {vps.user.email}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">{new Date(vps.expiresAt).toLocaleDateString()}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                            vps.autoRenew && vps.autoRenewConsentAt
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border border-[#332f2a] bg-[#171717] text-[#F1E9DA]/50"
                          }`}
                        >
                          {vps.autoRenew && vps.autoRenewConsentAt ? "CONSENTED" : "OPTED OUT"}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm font-bold text-[#C6A66B]">
                        ₹{vps.order?.plan?.price || 999}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-[#F1E9DA]/60">
                          {vps.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          disabled={actionLoading === `RENEW-${vps.id}`}
                          onClick={() => handleRetryAction(vps.id, "RENEW")}
                          className="rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-xs font-semibold text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521] disabled:opacity-50"
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
        <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
          <div className="flex flex-col gap-3 border-b border-[#332f2a] p-5 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">
              Renewal Execution Audit Logs
            </h3>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[#F1E9DA]/50">Filter:</span>

              {["ALL", "SUCCESS", "INSUFFICIENT_FUNDS", "FAILED"].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setHistoryFilter(s);
                    fetchHistory(s);
                  }}
                  className={`rounded-lg px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider transition ${
                    historyFilter === s
                      ? "bg-[#C6A66B] text-[#171717]"
                      : "border border-[#332f2a] bg-[#171717] text-[#F1E9DA]/60 hover:text-[#F1E9DA]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {history.length === 0 ? (
            <p className="p-12 text-center font-mono text-xs text-[#F1E9DA]/50">
              No renewal attempt records found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-sm">
                <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                  <tr>
                    <th className="px-5 py-3.5">Date & Time</th>
                    <th className="px-5 py-3.5">VPS Instance</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Renewal Amount</th>
                    <th className="px-5 py-3.5">Wallet Balance</th>
                    <th className="px-5 py-3.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#332f2a]">
                  {history.map((att) => (
                    <tr key={att.id} className="transition hover:bg-[#292521]/60">
                      <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/60">
                        {new Date(att.attemptedAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 font-mono font-medium text-[#C6A66B]">
                        {att.vps?.ipAddress || "—"}
                        <span className="block text-[11px] text-[#F1E9DA]/40">
                          {att.vps?.hostname}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">{att.user?.email || "—"}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                            att.status === "SUCCESS"
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : att.status === "INSUFFICIENT_FUNDS"
                              ? "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                              : "border border-red-500/30 bg-red-500/10 text-red-400"
                          }`}
                        >
                          {att.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-[#F1E9DA]">
                        ₹{att.renewalAmount}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">
                        ₹{att.walletBalance ?? "—"}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/50 max-w-xs truncate">
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
        <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
          <div className="border-b border-[#332f2a] p-5">
            <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">
              Failed Renewals Due to Insufficient Wallet Balance
            </h3>
            <p className="font-sans text-xs text-[#F1E9DA]/50 mt-0.5">
              Customers who have auto-renewal enabled but require additional wallet funds.
            </p>
          </div>

          {insufficientCases.length === 0 ? (
            <p className="p-12 text-center font-mono text-xs text-[#F1E9DA]/50">
              No insufficient wallet balance cases.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-sm">
                <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                  <tr>
                    <th className="px-5 py-3.5">Date Attempted</th>
                    <th className="px-5 py-3.5">VPS IP</th>
                    <th className="px-5 py-3.5">Customer Email</th>
                    <th className="px-5 py-3.5">Required Price</th>
                    <th className="px-5 py-3.5">Customer Balance</th>
                    <th className="px-5 py-3.5">Shortfall</th>
                    <th className="px-5 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#332f2a]">
                  {insufficientCases.map((c) => {
                    const price = Number(c.renewalAmount);
                    const bal = Number(c.walletBalance ?? 0);
                    const shortfall = Math.max(0, price - bal);

                    return (
                      <tr key={c.id} className="transition hover:bg-[#292521]/60">
                        <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/60">
                          {new Date(c.attemptedAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 font-mono font-semibold text-[#C6A66B]">
                          {c.vps?.ipAddress}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">{c.user?.email}</td>
                        <td className="px-5 py-4 font-mono text-sm font-semibold text-[#F1E9DA]">₹{price}</td>
                        <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">₹{bal}</td>
                        <td className="px-5 py-4 font-mono text-sm font-bold text-red-400">₹{shortfall}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-400">
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
        <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
          <div className="border-b border-[#332f2a] p-5">
            <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">
              Suspended Instances in Grace Period
            </h3>
            <p className="font-sans text-xs text-[#F1E9DA]/50 mt-0.5">
              Servers suspended after expiry. Data is preserved until grace period expires.
            </p>
          </div>

          {suspended.length === 0 ? (
            <p className="p-12 text-center font-mono text-xs text-[#F1E9DA]/50">
              No instances currently suspended.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-sm">
                <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                  <tr>
                    <th className="px-5 py-3.5">IP Address</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Suspended At</th>
                    <th className="px-5 py-3.5">Grace Period Ends</th>
                    <th className="px-5 py-3.5">Provider Suspended</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#332f2a]">
                  {suspended.map((vps) => {
                    const graceOver =
                       vps.gracePeriodExpiresAt &&
                      new Date(vps.gracePeriodExpiresAt).getTime() <= Date.now();

                    return (
                      <tr key={vps.id} className="transition hover:bg-[#292521]/60">
                        <td className="px-5 py-4 font-mono font-semibold text-[#C6A66B]">
                          {vps.ipAddress}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">{vps.user?.email}</td>
                        <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/60">
                          {vps.suspendedAt
                            ? new Date(vps.suspendedAt).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                              graceOver
                                ? "border border-red-500/30 bg-red-500/10 text-red-400"
                                : "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {vps.gracePeriodExpiresAt
                              ? new Date(vps.gracePeriodExpiresAt).toLocaleString()
                              : "—"}
                            {graceOver ? " (EXPIRED)" : ""}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                              vps.providerSuspended
                                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                : "border border-[#332f2a] bg-[#171717] text-[#F1E9DA]/50"
                            }`}
                          >
                            {vps.providerSuspended
                              ? "CONFIRMED"
                              : "PENDING RECONCILE"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right space-x-2">
                          <button
                            disabled={actionLoading === `SUSPEND-${vps.id}`}
                            onClick={() => handleRetryAction(vps.id, "SUSPEND")}
                            className="rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-xs font-semibold text-amber-400 transition hover:bg-[#292521] disabled:opacity-50"
                          >
                            Retry Stop
                          </button>

                          <button
                            disabled={actionLoading === `RENEW-${vps.id}`}
                            onClick={() => handleRetryAction(vps.id, "RENEW")}
                            className="rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-xs font-semibold text-[#C6A66B] transition hover:bg-[#292521] disabled:opacity-50"
                          >
                            Renew
                          </button>

                          {graceOver && (
                            <button
                              disabled={actionLoading === `TERMINATE-${vps.id}`}
                              onClick={() => handleRetryAction(vps.id, "TERMINATE")}
                              className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-1.5 font-mono text-xs font-semibold text-red-400 transition hover:bg-red-900/30 disabled:opacity-50"
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
