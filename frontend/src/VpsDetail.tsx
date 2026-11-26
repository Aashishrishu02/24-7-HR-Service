import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Cpu,
  HardDrive,
  KeyRound,
  Network,
  Power,
  RefreshCw,
  Server,
  Shield,
} from "lucide-react";
import api from "./api";

type VPS = {
  id: string;
  provider: string;
  providerVpsId?: string | null;
  ipAddress: string;
  hostname: string | null;
  operatingSystem: string | null;
  ram: number | null;
  status: string;
  expiresAt: string | null;
  autoRenew?: boolean;
  autoRenewConsentAt?: string | null;
  gracePeriodExpiresAt?: string | null;
  inventory?: {
    cpuCores?: number | null;
    ramGb?: number | null;
    storageGb?: number | null;
    bandwidthGb?: number | null;
    region?: string | null;
    operatingSystem?: string | null;
  } | null;
};

type Tab = "overview" | "performance" | "storage" | "network" | "settings" | "billing";

function flattenData(value: any, prefix = ""): Array<[string, string]> {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") {
    return prefix ? [[prefix, String(value)]] : [];
  }

  const entries: Array<[string, string]> = [];
  Object.entries(value).forEach(([key, child]) => {
    if (/password|token|secret|credential|privatekey/i.test(key)) return;
    const label = prefix ? `${prefix} / ${key}` : key;

    if (child !== null && typeof child === "object") {
      entries.push(...flattenData(child, label));
    } else if (child !== null && child !== undefined) {
      entries.push([label, String(child)]);
    }
  });
  return entries;
}

function DataRows({ data }: { data: any }) {
  const rows = flattenData(data);
  if (!rows.length) {
    return <p className="text-sm text-[#F1E9DA]/50">Data unavailable from provider.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(([key, value], index) => (
        <div key={`${key}-${index}`} className="rounded-xl border border-[#332f2a] bg-[#171717] p-3">
          <p className="break-all text-[10px] uppercase tracking-wider text-[#F1E9DA]/45">{key}</p>
          <p className="mt-1 break-all text-sm font-medium text-[#F1E9DA]">{value}</p>
        </div>
      ))}
    </div>
  );
}

export default function VpsDetail({
  vps,
  loading,
  onBack,
  onRefresh,
  onRenew,
}: {
  vps: VPS | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onRenew: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [providerDetails, setProviderDetails] = useState<any>(null);
  const [lockStatus, setLockStatus] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [storage, setStorage] = useState<any>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [isoId, setIsoId] = useState("");
  const [isos, setIsos] = useState<Array<{ id: string; isoName: string; osType: string }>>([]);
  const [smartOs, setSmartOs] = useState("ubuntu");

  const isHostHeaven = vps?.provider === "HOSTHEAVEN";
  const isSmartVps = vps?.provider === "SMARTVPS";

  useEffect(() => {
    let cancelled = false;

    async function loadProviderData() {
      if (!vps) return;

      setProviderDetails(null);
      setLockStatus(null);
      setMetrics(null);
      setStorage(null);
      setError("");
      setNotice("");
      setProviderLoading(true);

      try {
        if (vps.provider === "HOSTHEAVEN") {
          const results = await Promise.allSettled([
            api.get(`/hostheaven/vms/${vps.id}/details`),
            api.get(`/hostheaven/vms/${vps.id}/lock-status`),
            api.get(`/hostheaven/vms/${vps.id}/metrics?timeframe=hour`),
            api.get(`/hostheaven/vms/${vps.id}/storage`),
            api.get("/hostheaven/zones"),
          ]);

          if (cancelled) return;

          if (results[0].status === "fulfilled") setProviderDetails(results[0].value.data);
          if (results[1].status === "fulfilled") setLockStatus(results[1].value.data);
          if (results[2].status === "fulfilled") setMetrics(results[2].value.data);
          if (results[3].status === "fulfilled") setStorage(results[3].value.data);

          if (results.slice(0, 4).every((result) => result.status === "rejected")) {
            setError("Unable to retrieve HostHeaven server information. Please try refreshing.");
          }

          if (results[4].status === "fulfilled") {
            const zones = Array.isArray(results[4].value.data) ? results[4].value.data : [];
            if (zones.length) {
              const isoResult = await api.get(`/hostheaven/zones/${zones[0].id}/isos`);
              if (!cancelled) {
                const availableIsos = Array.isArray(isoResult.data) ? isoResult.data : [];
                setIsos(availableIsos);
                setIsoId(availableIsos[0]?.id || "");
              }
            }
          }
        } else if (vps.provider === "SMARTVPS") {
          const result = await api.get(`/vps/${vps.id}/status`);
          if (!cancelled) setProviderDetails(result.data);
        }
      } catch {
        if (!cancelled && vps.provider === "SMARTVPS") {
          setError("Live server status is currently unavailable.");
        }
      } finally {
        if (!cancelled) setProviderLoading(false);
      }
    }

    void loadProviderData();
    return () => {
      cancelled = true;
    };
  }, [vps?.id, vps?.provider]);

  const runPowerAction = async (action: "start" | "stop" | "reboot") => {
    if (!vps) return;
    setActionLoading(true);
    setError("");
    setNotice("");

    try {
      if (isHostHeaven) {
        await api.post(`/hostheaven/vms/${vps.id}/control`, { action });
      } else if (isSmartVps && action !== "reboot") {
        await api.post(`/vps/${vps.id}/${action}`);
      } else {
        setError("This power action is not supported by the current provider integration.");
        return;
      }

      setNotice(`${action[0].toUpperCase()}${action.slice(1)} command submitted.`);
      await onRefresh();
    } catch (err: any) {
      setError(err.response?.data?.message || `Unable to ${action} this server.`);
    } finally {
      setActionLoading(false);
    }
  };

  const changePassword = async () => {
    if (!vps || password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      await api.put(`/hostheaven/vms/${vps.id}/password`, { password });
      setPassword("");
      setNotice("Password change request submitted.");
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to change server password.");
    } finally {
      setActionLoading(false);
    }
  };

  const rebuildServer = async () => {
    if (!vps || !isoId) {
      setError("Select an available operating system ISO first.");
      return;
    }
    if (!window.confirm("OS reinstall will erase data on the server. Continue?")) return;

    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      await api.post(`/hostheaven/vms/${vps.id}/rebuild`, { isoId });
      setNotice("OS reinstall request submitted to HostHeaven.");
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to submit OS reinstall request.");
    } finally {
      setActionLoading(false);
    }
  };

  const changeSmartOs = async () => {
    if (!vps) return;
    if (!window.confirm("Changing the operating system may erase server data. Continue?")) return;

    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      await api.post(`/vps/${vps.id}/change-os`, { os: smartOs });
      setNotice("Operating system change request submitted.");
      await onRefresh();
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to change operating system.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !vps) {
    return (
      <section className="pt-10">
        <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm text-[#C6A66B]">
          <ArrowLeft size={16} /> Back to My Servers
        </button>
        <p className="py-12 text-center text-sm text-[#F1E9DA]/60">
          {loading ? "Loading your server…" : "Server not found in your account."}
        </p>
      </section>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: any }> = [
    { id: "overview", label: "Overview", icon: Server },
    { id: "performance", label: "Performance", icon: Activity },
    { id: "storage", label: "Storage", icon: HardDrive },
    { id: "network", label: "Network", icon: Network },
    { id: "settings", label: "Settings", icon: Shield },
    { id: "billing", label: "Billing", icon: CalendarClock },
  ];

  const statusText = providerDetails?.status || vps.status;

  return (
    <section className="pt-10">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#C6A66B] hover:text-[#d8ba82]">
        <ArrowLeft size={16} /> Back to My Servers
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 sm:p-7">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-[#C6A66B]">
            Server control panel · {vps.provider}
          </p>
          <h1 className="mt-2 break-all font-serif text-2xl font-bold text-[#F1E9DA]">
            {vps.hostname || "VPS Server"}
          </h1>
          <p className="mt-2 font-mono text-sm text-[#F1E9DA]/60">{vps.ipAddress}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-3 py-1 text-xs text-[#C6A66B]">{statusText}</span>
            <span className="rounded-full border border-[#332f2a] bg-[#171717] px-3 py-1 text-xs text-[#F1E9DA]/70">{vps.provider}</span>
          </div>
        </div>
        <button onClick={() => void onRefresh()} className="inline-flex items-center gap-2 rounded-xl border border-[#332f2a] px-4 py-3 text-xs font-bold text-[#C6A66B]">
          <RefreshCw size={14} /> Refresh server list
        </button>
      </div>

      {(notice || error) && (
        <div className={`mt-4 rounded-xl border p-3 text-sm ${error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
          {error || notice}
        </div>
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto border-b border-[#332f2a] pb-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${tab === id ? "bg-[#C6A66B] text-[#171717]" : "text-[#F1E9DA]/60 hover:bg-[#201d1a]"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 sm:p-6">
        {tab === "overview" && (
          <>
            <h2 className="font-serif text-xl font-bold text-[#F1E9DA]">Server overview</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["IP address", vps.ipAddress],
                ["Hostname", vps.hostname || "—"],
                ["Operating system", vps.operatingSystem || vps.inventory?.operatingSystem || "—"],
                ["CPU cores", vps.inventory?.cpuCores ?? "—"],
                ["RAM", vps.inventory?.ramGb ?? vps.ram ?? "—", "GB"],
                ["Storage", vps.inventory?.storageGb ?? "—", "GB"],
                ["Bandwidth", vps.inventory?.bandwidthGb ?? "—", "GB"],
                ["Region", vps.inventory?.region || "—"],
                ["Expiry", vps.expiresAt ? new Date(vps.expiresAt).toLocaleDateString() : "—"],
              ].map(([label, value, unit]) => (
                <div key={String(label)} className="rounded-xl border border-[#332f2a] bg-[#171717] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/45">{label}</p>
                  <p className="mt-2 break-all text-sm font-semibold text-[#F1E9DA]">{value} {unit || ""}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold text-[#F1E9DA]">Power controls</h3>
              <div className="flex flex-wrap gap-2">
                <button disabled={actionLoading} onClick={() => void runPowerAction("start")} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-300 disabled:opacity-50">
                  <Power size={14} /> Start
                </button>
                <button disabled={actionLoading} onClick={() => void runPowerAction("stop")} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300 disabled:opacity-50">
                  <Power size={14} /> Stop
                </button>
                {isHostHeaven && (
                  <button disabled={actionLoading} onClick={() => void runPowerAction("reboot")} className="inline-flex items-center gap-2 rounded-lg border border-[#C6A66B]/30 px-4 py-3 text-xs font-bold text-[#C6A66B] disabled:opacity-50">
                    <RefreshCw size={14} /> Reboot
                  </button>
                )}
              </div>
              {actionLoading && <p className="mt-2 text-xs text-[#F1E9DA]/50">Submitting command…</p>}
            </div>
          </>
        )}

        {tab === "performance" && (
          <>
            <h2 className="mb-4 flex items-center gap-2 font-serif text-xl font-bold text-[#F1E9DA]"><Cpu size={19} /> Performance metrics</h2>
            {isHostHeaven ? (
              providerLoading ? <p className="text-sm text-[#F1E9DA]/50">Loading provider metrics…</p> : <DataRows data={metrics} />
            ) : (
              <p className="text-sm text-[#F1E9DA]/50">Live CPU and memory performance metrics are not available through the current {vps.provider} integration.</p>
            )}
          </>
        )}

        {tab === "storage" && (
          <>
            <h2 className="mb-4 flex items-center gap-2 font-serif text-xl font-bold text-[#F1E9DA]"><HardDrive size={19} /> Storage information</h2>
            {isHostHeaven ? <DataRows data={storage} /> : <p className="text-sm text-[#F1E9DA]/50">Live disk usage data is unavailable through the current provider integration.</p>}
          </>
        )}

        {tab === "network" && (
          <>
            <h2 className="mb-4 flex items-center gap-2 font-serif text-xl font-bold text-[#F1E9DA]"><Network size={19} /> Network information</h2>
            <div className="mb-4 rounded-xl border border-[#332f2a] bg-[#171717] p-4">
              <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/45">Public IP address</p>
              <p className="mt-1 font-mono text-lg font-bold text-[#C6A66B]">{vps.ipAddress}</p>
            </div>
            {isHostHeaven ? <DataRows data={metrics} /> : <p className="text-sm text-[#F1E9DA]/50">Live network traffic statistics are unavailable through the current provider integration.</p>}
          </>
        )}

        {tab === "settings" && (
          <>
            <h2 className="font-serif text-xl font-bold text-[#F1E9DA]">Server settings</h2>
            {isHostHeaven ? (
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#F1E9DA]"><KeyRound size={15} /> Change server password</h3>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} placeholder="New password (minimum 8 characters)" className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA] outline-none focus:border-[#C6A66B]" />
                  <button disabled={actionLoading || password.length < 8} onClick={() => void changePassword()} className="mt-3 rounded-xl bg-[#C6A66B] px-4 py-3 text-xs font-bold text-[#171717] disabled:opacity-50">Update password</button>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-bold text-[#F1E9DA]">Reinstall operating system</h3>
                  {isos.length ? (
                    <>
                      <select value={isoId} onChange={(event) => setIsoId(event.target.value)} className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA]">
                        {isos.map((iso) => <option key={iso.id} value={iso.id}>{iso.isoName}</option>)}
                      </select>
                      <button disabled={actionLoading || !isoId} onClick={() => void rebuildServer()} className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300 disabled:opacity-50">Reinstall OS</button>
                    </>
                  ) : <p className="text-sm text-[#F1E9DA]/50">No operating system ISO is currently available from HostHeaven.</p>}
                  <p className="mt-2 text-xs text-red-300">Warning: reinstalling may erase server data.</p>
                </div>
                <div className="lg:col-span-2">
                  <h3 className="mb-3 text-sm font-bold text-[#F1E9DA]">Provider lock status</h3>
                  <DataRows data={lockStatus} />
                </div>
              </div>
            ) : isSmartVps ? (
              <div className="mt-5 max-w-md">
                <p className="mb-3 text-sm text-[#F1E9DA]/60">Change OS using the SmartVPS integration.</p>
                <select value={smartOs} onChange={(event) => setSmartOs(event.target.value)} className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA]">
                  <option value="ubuntu">Ubuntu</option>
                  <option value="centos">CentOS</option>
                  <option value="2012">Windows Server 2012</option>
                  <option value="2016">Windows Server 2016</option>
                  <option value="2019">Windows Server 2019</option>
                  <option value="2022">Windows Server 2022</option>
                  <option value="11">Windows 11</option>
                </select>
                <button disabled={actionLoading} onClick={() => void changeSmartOs()} className="mt-3 rounded-xl bg-[#C6A66B] px-4 py-3 text-xs font-bold text-[#171717] disabled:opacity-50">Submit OS change</button>
                <p className="mt-2 text-xs text-red-300">OS change may erase server data.</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#F1E9DA]/50">Server settings and provider controls are not available for {vps.provider} yet.</p>
            )}
          </>
        )}

        {tab === "billing" && (
          <>
            <h2 className="mb-4 flex items-center gap-2 font-serif text-xl font-bold text-[#F1E9DA]"><CalendarClock size={19} /> Billing & renewal</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#332f2a] bg-[#171717] p-4">
                <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/45">Expiry date</p>
                <p className="mt-2 text-sm font-semibold text-[#F1E9DA]">{vps.expiresAt ? new Date(vps.expiresAt).toLocaleString() : "Not available"}</p>
              </div>
              <div className="rounded-xl border border-[#332f2a] bg-[#171717] p-4">
                <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/45">Auto-renewal</p>
                <p className="mt-2 text-sm font-semibold text-[#F1E9DA]">{vps.autoRenew && vps.autoRenewConsentAt ? "Enabled" : "Disabled"}</p>
              </div>
              {vps.gracePeriodExpiresAt && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 sm:col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-red-300">Grace period ends</p>
                  <p className="mt-2 text-sm font-semibold text-red-200">{new Date(vps.gracePeriodExpiresAt).toLocaleString()}</p>
                </div>
              )}
            </div>
            <button onClick={() => onRenew(vps.id)} className="mt-5 rounded-xl bg-[#C6A66B] px-5 py-3 text-xs font-bold text-[#171717]">Manage renewal & billing</button>
          </>
        )}
      </div>
      {providerLoading && <p className="mt-3 text-center text-xs text-[#F1E9DA]/40">Refreshing provider information…</p>}
    </section>
  );
}
