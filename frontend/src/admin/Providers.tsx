
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Power,
  Server,
  AlertCircle,
  CheckCircle2,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Database,
  Globe,
  HardDrive,
  Cpu,
  MemoryStick,
  Network,
  Wallet,
  ChevronDown,
  ChevronUp,
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
};

type PricingItem = {
  id: string;
  label: string;
  cores?: number;
  ram?: number;
  disk?: number;
  bandwidth?: number;
  price: number;
  currency?: string;
};

type Catalogue = {
  zones: Array<{
    id: string;
    name: string;
    location?: string;
    country?: string;
    isAvailable?: boolean;
  }>;
  pricing: {
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
  wallet: {
    id: string;
    balance: number;
    currency: string;
    updatedAt?: string;
  };
};

export default function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const [testResults, setTestResults] = useState<
    Record<
      string,
      {
        success: boolean;
        connected: boolean;
        message: string;
        balance?: number;
        currency?: string;
        testedAt?: string;
      }
    >
  >({});

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState("");
  const [catalogueVisible, setCatalogueVisible] = useState(false);

  const handleTestConnection = async (provider: Provider) => {
    setTestingId(provider.id);
    setError("");
    setSuccess("");

    try {
      const response = await adminApi.post(
        `/admin/providers/${provider.id}/test-connection`,
      );

      const data = response.data;

      setTestResults((prev) => ({
        ...prev,
        [provider.id]: {
          success: Boolean(data.success),
          connected: Boolean(data.connected),
          message:
            data.message ||
            (data.connected ? "Connection active" : "Connection failed"),
          balance: data.wallet?.balance,
          currency: data.wallet?.currency || provider.currency || "INR",
          testedAt: new Date().toLocaleTimeString(),
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider.id]: {
          success: false,
          connected: false,
          message:
            err.response?.data?.message || "Failed to reach provider API",
          testedAt: new Date().toLocaleTimeString(),
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const loadHostHeavenCatalogue = useCallback(async () => {
    setCatalogueLoading(true);
    setCatalogueError("");

    try {
      const response = await adminApi.get("/admin/hostheaven/catalogue");

      setCatalogue(response.data);
      setCatalogueVisible(true);
    } catch (err: any) {
      setCatalogue(null);
      setCatalogueError(
        err.response?.data?.message ||
          "Unable to load HostHeaven catalogue.",
      );
    } finally {
      setCatalogueLoading(false);
    }
  }, []);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await adminApi.get("/admin/providers");
      const loadedProviders: Provider[] = response.data.providers || [];
      setProviders(loadedProviders);

      // Restore the persisted HostHeaven test result after navigation or refresh.
      const hostHeavenProvider = loadedProviders.find(
        (provider) => provider.code.toUpperCase() === "HOSTHEAVEN",
      );

      if (hostHeavenProvider) {
        // Automatically reload catalogue whenever Providers page is opened.
        void loadHostHeavenCatalogue();

        try {
          const statusResponse = await adminApi.get(
            `/admin/providers/${hostHeavenProvider.id}/connection-status`,
          );
          const saved = statusResponse.data;

          if (saved && saved.testedAt) {
            setTestResults((prev) => ({
              ...prev,
              [hostHeavenProvider.id]: {
                success: Boolean(saved.success),
                connected: Boolean(saved.connected),
                message: saved.message || "Connection status restored",
                balance: saved.wallet?.balance,
                currency: saved.wallet?.currency || "INR",
                testedAt: new Date(saved.testedAt).toLocaleString(),
              },
            }));
          }
        } catch {
          // Keep the page usable if saved status cannot be loaded.
        }
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to load providers.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadHostHeavenCatalogue]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const toggleStatus = async (provider: Provider) => {
    const action = provider.isActive ? "deactivate" : "activate";

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${provider.name}?`,
      )
    ) {
      return;
    }

    try {
      await adminApi.patch(`/admin/providers/${provider.id}/status`, {
        isActive: !provider.isActive,
      });

      await loadProviders();
      setSuccess(`Provider ${provider.name} ${action}d successfully.`);
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Unable to update provider status.",
      );
    }
  };

  const connectedCount = Object.values(testResults).filter(
    (r) => r.connected,
  ).length;

  const hostHeaven = providers.find(
    (provider) => provider.code.toUpperCase() === "HOSTHEAVEN",
  );

  const renderPricingGroup = (
    title: string,
    items: PricingItem[] | undefined,
    Icon: typeof Cpu,
  ) => (
    <div className="rounded-lg border border-slate-700 bg-[#0d1525] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={17} className="text-cyan-400" />
        <h4 className="font-semibold text-slate-200">{title}</h4>
      </div>

      {!items || items.length === 0 ? (
        <p className="text-xs text-slate-500">No pricing data returned.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-300">
                  {item.label}
                </p>
                <p className="text-xs text-slate-500">
                  {item.cores !== undefined && `${item.cores} CPU • `}
                  {item.ram !== undefined && `${item.ram} GB RAM • `}
                  {item.disk !== undefined && `${item.disk} GB Disk`}
                  {item.bandwidth !== undefined &&
                    `${item.bandwidth} GB Bandwidth`}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-semibold text-emerald-400">
                  ₹{(Number(item.price) * 720).toFixed(2)}
                  <span className="text-[11px] font-normal text-emerald-300/80">/mo</span>
                </p>
                <p className="font-mono text-xs text-slate-400">
                  ₹{Number(item.price).toFixed(4)}/hr
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">
            Integrated VPS Providers
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Status, connectivity diagnostics, and wallet balances for
            backend-configured infrastructure providers.
          </p>
        </div>

        <button
          onClick={loadProviders}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-blue-900/50 bg-[#07132a] p-4 text-xs text-slate-300">
        <div className="flex items-start gap-2.5">
          <ShieldCheck
            size={18}
            className="mt-0.5 shrink-0 text-cyan-400"
          />
          <div className="space-y-1">
            <p className="font-semibold text-cyan-300">
              Backend-Only Secure Configuration Architecture
            </p>
            <p className="leading-relaxed text-slate-400">
              Provider API credentials and base URLs are configured
              exclusively via backend server environment variables
              (e.g. HOSTHEAVEN_* and SMARTVPS_*). The admin panel
              provides operational status and connection verification
              without storing or editing plain secrets.
            </p>
          </div>
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
          <p className="text-sm text-slate-400">Integrated Providers</p>
          <p className="mt-3 text-3xl font-bold">{providers.length}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-5">
          <p className="text-sm text-slate-400">Active in Platform</p>
          <p className="mt-3 text-3xl font-bold text-emerald-400">
            {providers.filter((p) => p.isActive).length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-5">
          <p className="text-sm text-slate-400">Verified Connected</p>
          <p className="mt-3 text-3xl font-bold text-cyan-400">
            {connectedCount} / {providers.length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#111a2b]">
        <div className="border-b border-slate-800 p-4">
          <h2 className="font-semibold">Backend Providers Status</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="mx-auto mb-3 animate-spin" />
            Loading providers...
          </div>
        ) : providers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Server className="mx-auto mb-3" size={34} />
            No integrated providers found in the database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-[#0d1525] text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-4">Provider</th>
                  <th className="px-5 py-4">Code</th>
                  <th className="px-5 py-4">Configuration Target</th>
                  <th className="px-5 py-4">
                    Connection & Wallet Status
                  </th>
                  <th className="px-5 py-4">Platform State</th>
                  <th className="px-5 py-4">Diagnostics</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {providers.map((provider) => {
                  const test = testResults[provider.id];

                  return (
                    <tr
                      key={provider.id}
                      className="hover:bg-slate-800/40"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">
                            {provider.name}
                          </p>
                          <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
                            Backend Adapter
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Priority: {provider.priority}
                        </p>
                      </td>

                      <td className="px-5 py-4 font-mono font-bold text-blue-300">
                        {provider.code}
                      </td>

                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-slate-400">
                          {provider.code === "HOSTHEAVEN"
                            ? "HOSTHEAVEN_BASE_URL"
                            : provider.code === "SMARTVPS"
                              ? "SMARTVPS_BASE_URL"
                              : "Server Environment"}
                        </span>
                        <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-500">
                          {provider.baseUrl || "Default adapter URL"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        {test ? (
                          test.connected ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                                <CheckCircle2 size={13} />
                                Connected & Verified
                              </span>

                              {test.balance !== undefined && (
                                <p className="mt-1.5 font-mono text-xs text-emerald-300">
                                  Provider Wallet: {test.currency}{" "}
                                  {Number(test.balance).toLocaleString("en-IN")}
                                </p>
                              )}

                              {test.testedAt && (
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                  Checked at {test.testedAt}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400">
                                <AlertCircle size={13} />
                                {test.message}
                              </span>
                              {test.testedAt && (
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                  Checked at {test.testedAt}
                                </p>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <ShieldAlert size={13} />
                            Untested in current session
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={
                            provider.isActive
                              ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400"
                              : "rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400"
                          }
                        >
                          {provider.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            title="Test Live Connection"
                            disabled={testingId === provider.id}
                            onClick={() => handleTestConnection(provider)}
                            className="flex items-center gap-1.5 rounded-lg border border-cyan-800/60 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-900/50 disabled:opacity-50"
                          >
                            <Activity
                              size={14}
                              className={
                                testingId === provider.id
                                  ? "animate-spin"
                                  : ""
                              }
                            />
                            {testingId === provider.id
                              ? "Testing..."
                              : "Test Connection"}
                          </button>

                          <button
                            title={
                              provider.isActive
                                ? "Deactivate in platform"
                                : "Activate in platform"
                            }
                            onClick={() => toggleStatus(provider)}
                            className="rounded-lg border border-slate-700 p-2 text-amber-400 transition hover:bg-slate-700"
                          >
                            <Power size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {hostHeaven && (
        <div className="overflow-hidden rounded-xl border border-cyan-900/50 bg-[#111a2b]">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Database size={19} className="text-cyan-400" />
                <h2 className="text-lg font-semibold">
                  HostHeaven Live Catalogue
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Live zones, provider pricing and wallet data from HostHeaven.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadHostHeavenCatalogue}
                disabled={catalogueLoading}
                className="flex items-center gap-2 rounded-lg border border-cyan-800 bg-cyan-950/40 px-4 py-2 text-sm text-cyan-300 transition hover:bg-cyan-900/50 disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={catalogueLoading ? "animate-spin" : ""}
                />
                {catalogueLoading ? "Loading..." : "Refresh Catalogue"}
              </button>

              {catalogue && (
                <button
                  onClick={() => setCatalogueVisible(!catalogueVisible)}
                  className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
                  title="Toggle catalogue"
                >
                  {catalogueVisible ? (
                    <ChevronUp size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                </button>
              )}
            </div>
          </div>

          {catalogueError && (
            <div className="m-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <span>{catalogueError}</span>
            </div>
          )}

          {!catalogue && !catalogueLoading && !catalogueError && (
            <div className="p-8 text-center">
              <Globe size={30} className="mx-auto mb-3 text-slate-500" />
              <p className="font-medium text-slate-300">
                Catalogue not loaded
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Click Refresh Catalogue to fetch live HostHeaven data.
              </p>
            </div>
          )}

          {catalogueLoading && !catalogue && (
            <div className="p-8 text-center text-slate-400">
              <RefreshCw className="mx-auto mb-3 animate-spin" />
              Fetching live catalogue...
            </div>
          )}

          {catalogue && catalogueVisible && (
            <div className="space-y-6 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Wallet size={19} />
                    <p className="text-sm font-medium">
                      HostHeaven Provider Wallet
                    </p>
                  </div>
                  <p className="mt-3 text-2xl font-bold text-emerald-300">
                    {catalogue.wallet?.currency || "INR"}{" "}
                    {Number(
                      catalogue.wallet?.balance ?? 0,
                    ).toLocaleString("en-IN")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Live provider wallet balance
                  </p>
                </div>

                <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-5">
                  <div className="flex items-center gap-2 text-blue-400">
                    <Globe size={19} />
                    <p className="text-sm font-medium">
                      Available Zones
                    </p>
                  </div>
                  <p className="mt-3 text-2xl font-bold text-blue-300">
                    {catalogue.zones?.length ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Zones returned by HostHeaven API
                  </p>
                </div>
              </div>

              <section>
                <h3 className="mb-3 flex items-center gap-2 font-semibold">
                  <Globe size={17} className="text-cyan-400" />
                  Live Hosting Zones
                </h3>

                {!catalogue.zones || catalogue.zones.length === 0 ? (
                  <p className="rounded-lg border border-slate-700 p-4 text-sm text-slate-500">
                    No zones returned by the provider.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {catalogue.zones.map((zone) => (
                      <div
                        key={zone.id}
                        className="rounded-lg border border-slate-700 bg-[#0d1525] p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-200">
                              {zone.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {zone.location || "Location not provided"}
                              {zone.country ? `, ${zone.country}` : ""}
                            </p>
                          </div>
                          <span
                            className={
                              zone.isAvailable === false
                                ? "rounded-full bg-red-500/10 px-2 py-1 text-[10px] text-red-400"
                                : "rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-400"
                            }
                          >
                            {zone.isAvailable === false
                              ? "Unavailable"
                              : "Available"}
                          </span>
                        </div>
                        <p className="mt-3 break-all font-mono text-[10px] text-slate-500">
                          ID: {zone.id}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-3 font-semibold">
                  Shared VPS Pricing
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {renderPricingGroup(
                    "CPU",
                    catalogue.pricing?.shared?.cpu,
                    Cpu,
                  )}
                  {renderPricingGroup(
                    "RAM",
                    catalogue.pricing?.shared?.ram,
                    MemoryStick,
                  )}
                  {renderPricingGroup(
                    "Disk",
                    catalogue.pricing?.shared?.disk,
                    HardDrive,
                  )}
                  {renderPricingGroup(
                    "Bandwidth",
                    catalogue.pricing?.shared?.bandwidth,
                    Network,
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-3 font-semibold">
                  Dedicated VPS Pricing
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {renderPricingGroup(
                    "CPU",
                    catalogue.pricing?.dedicated?.cpu,
                    Cpu,
                  )}
                  {renderPricingGroup(
                    "RAM",
                    catalogue.pricing?.dedicated?.ram,
                    MemoryStick,
                  )}
                  {renderPricingGroup(
                    "Disk",
                    catalogue.pricing?.dedicated?.disk,
                    HardDrive,
                  )}
                  {renderPricingGroup(
                    "Bandwidth",
                    catalogue.pricing?.dedicated?.bandwidth,
                    Network,
                  )}
                </div>
              </section>

              <p className="text-xs text-slate-500">
                Data is fetched directly from the HostHeaven backend
                integration. Provider prices shown here are provider costs,
                not your platform selling prices.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
