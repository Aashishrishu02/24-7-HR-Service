
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Power,
  Server,
  AlertCircle,
  CheckCircle2,
  Activity,
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

  const [nexaBalance, setNexaBalance] = useState<
    Record<string, { balance?: any; currency?: string; message?: string; fetchedAt?: string }>
  >({});
  const [balanceLoadingId, setBalanceLoadingId] = useState<string | null>(null);

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

  const handleRefreshNexaBalance = async (provider: Provider) => {
    setBalanceLoadingId(provider.id);

    setNexaBalance((prev) => ({
      ...prev,
      [provider.id]: { message: "" },
    }));

    try {
      const response = await adminApi.get(
        `/admin/providers/${provider.id}/balance`,
      );

      const data = response.data;
      const wallet = data.balance;
      const account = wallet?.account ?? data.account;

      const walletAmount =
        account?.wallet_balance ??
        (typeof wallet === "number" || typeof wallet === "string"
          ? wallet
          : wallet?.balance ??
            wallet?.amount ??
            wallet?.wallet_balance ??
            wallet?.available_balance ??
            wallet?.availableBalance);

      const walletCurrency =
        account?.currency ??
        wallet?.currency ??
        data.currency ??
        provider.currency ??
        "INR";

      setNexaBalance((prev) => ({
        ...prev,
        [provider.id]: {
          balance: walletAmount,
          currency: walletCurrency,
          message:
            walletAmount === undefined || walletAmount === null
              ? "Balance amount was not found in the provider response."
              : undefined,
          fetchedAt: new Date().toLocaleTimeString(),
        },
      }));
    } catch (err: any) {
      setNexaBalance((prev) => ({
        ...prev,
        [provider.id]: {
          message:
            err.response?.data?.message || "Unable to fetch Nexa wallet balance.",
          fetchedAt: new Date().toLocaleTimeString(),
        },
      }));
    } finally {
      setBalanceLoadingId(null);
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

      const nexaProvider = loadedProviders.find(
        (provider) => provider.code.toUpperCase() === "NEXAVPS",
      );

      if (nexaProvider) {

        try {
          const statusResponse = await adminApi.get(
            `/admin/providers/${nexaProvider.id}/connection-status`,
          );
          const saved = statusResponse.data;

          if (saved && saved.testedAt) {
            setTestResults((prev) => ({
              ...prev,
              [nexaProvider.id]: {
                success: Boolean(saved.success),
                connected: Boolean(saved.connected),
                message: saved.message || "Connection status restored",
                balance: saved.wallet?.balance,
                currency: saved.wallet?.currency || nexaProvider.currency || "INR",
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
    void loadProviders();
  }, [loadProviders]);

  // Re-check Nexa connectivity every five minutes while this page is open.
  useEffect(() => {
    const nexaProviders = providers.filter(
      (provider) => provider.code.toUpperCase() === "NEXAVPS",
    );

    if (nexaProviders.length === 0) return;

    const interval = window.setInterval(() => {
      nexaProviders.forEach(async (provider) => {
        try {
          const response = await adminApi.post(
            `/admin/providers/${provider.id}/test-connection`,
          );
          const data = response.data || {};

          setTestResults((prev) => ({
            ...prev,
            [provider.id]: {
              success: Boolean(data.success),
              connected: Boolean(data.connected),
              message: data.message || (data.connected ? "Connection active" : "Connection failed"),
              balance: data.wallet?.balance,
              currency: data.wallet?.currency || provider.currency || "INR",
              testedAt: new Date().toLocaleString(),
            },
          }));
        } catch (err: any) {
          setTestResults((prev) => ({
            ...prev,
            [provider.id]: {
              success: false,
              connected: false,
              message: err.response?.data?.message || "Automatic Nexa health check failed",
              testedAt: new Date().toLocaleString(),
            },
          }));
        }
      });
    }, 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [providers]);

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
    <div className="rounded-xl border border-[#332f2a] bg-[#171717] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-[#C6A66B]" />
        <h4 className="font-serif text-sm font-bold text-[#F1E9DA]">{title}</h4>
      </div>

      {!items || items.length === 0 ? (
        <p className="font-mono text-xs text-[#F1E9DA]/40">No pricing data returned.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 border-b border-[#332f2a]/60 pb-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-medium text-[#F1E9DA]">
                  {item.label}
                </p>
                <p className="font-mono text-[11px] text-[#F1E9DA]/50">
                  {item.cores !== undefined && `${item.cores} CPU • `}
                  {item.ram !== undefined && `${item.ram} GB RAM • `}
                  {item.disk !== undefined && `${item.disk} GB Disk`}
                  {item.bandwidth !== undefined &&
                    `${item.bandwidth} GB Bandwidth`}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-bold text-[#C6A66B]">
                  ₹{(Number(item.price) * 720).toFixed(2)}
                  <span className="font-sans text-[11px] font-normal text-[#F1E9DA]/50">/mo</span>
                </p>
                <p className="font-mono text-[11px] text-[#F1E9DA]/40">
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
          <h1 className="font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">
            Integrated VPS Providers
          </h1>
          <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">
            Status, connectivity diagnostics, and wallet balances for
            backend-configured infrastructure providers.
          </p>
        </div>

        <button
          onClick={loadProviders}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-2.5 font-mono text-xs font-bold text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521] disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={loading ? "animate-spin" : ""}
          />
          Refresh Providers
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-4 font-mono text-xs text-red-300">
          <AlertCircle size={16} className="shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-[#C6A66B]/30 bg-[#C6A66B]/10 p-4 font-mono text-xs text-[#C6A66B]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C6A66B]" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Integrated Providers</p>
          <p className="mt-3 font-serif text-3xl font-bold text-[#F1E9DA]">{providers.length}</p>
        </div>

        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Active in Platform</p>
          <p className="mt-3 font-serif text-3xl font-bold text-emerald-400">
            {providers.filter((p) => p.isActive).length}
          </p>
        </div>

        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Verified Connected</p>
          <p className="mt-3 font-serif text-3xl font-bold text-[#C6A66B]">
            {connectedCount} / {providers.length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
        <div className="border-b border-[#332f2a] px-6 py-4">
          <h2 className="font-serif text-base font-bold text-[#F1E9DA]">Backend Providers Status</h2>
        </div>

        {loading ? (
          <div className="p-16 text-center font-mono text-xs text-[#F1E9DA]/50">
            <RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]" size={22} />
            Loading provider connections...
          </div>
        ) : providers.length === 0 ? (
          <div className="p-16 text-center font-mono text-xs text-[#F1E9DA]/50">
            <Server className="mx-auto mb-3 text-[#F1E9DA]/30" size={34} />
            No integrated providers found in the database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left font-sans text-sm">
              <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                <tr>
                  <th className="px-6 py-4">Provider</th>
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Configuration Target</th>
                  <th className="px-6 py-4">
                    Connection & Wallet Status
                  </th>
                  <th className="px-6 py-4">Platform State</th>
                  <th className="px-6 py-4">Diagnostics</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#332f2a]">
                {providers.map((provider) => {
                  const test = testResults[provider.id];

                  return (
                    <tr
                      key={provider.id}
                      className="transition hover:bg-[#292521]/60"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-[#F1E9DA]">
                            {provider.name}
                          </p>
                          <span className="rounded-md border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#C6A66B]">
                            Backend Adapter
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-xs text-[#F1E9DA]/40">
                          Priority: {provider.priority}
                        </p>
                      </td>

                      <td className="px-6 py-4 font-mono font-bold text-[#C6A66B]">
                        {provider.code}
                      </td>

                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-[#F1E9DA]/70">
                          {provider.code === "HOSTHEAVEN"
                            ? "HOSTHEAVEN_BASE_URL"
                            : provider.code === "SMARTVPS"
                              ? "SMARTVPS_BASE_URL"
                              : "Server Environment"}
                        </span>
                        <p className="mt-0.5 max-w-[220px] truncate font-mono text-[11px] text-[#F1E9DA]/40">
                          {provider.baseUrl || "Default adapter URL"}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        {test ? (
                          test.connected ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-400">
                                <CheckCircle2 size={12} />
                                Connected & Verified
                              </span>

                              {test.balance !== undefined &&
                                provider.code.toUpperCase() !== "NEXAVPS" && (
                                  <p className="mt-1.5 font-mono text-xs font-semibold text-[#C6A66B]">
                                    Wallet: {test.currency}{" "}
                                    {Number(test.balance).toLocaleString("en-IN")}
                                  </p>
                                )}

                              {test.testedAt && (
                                <p className="mt-0.5 font-mono text-[10px] text-[#F1E9DA]/40">
                                  Checked at {test.testedAt}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-red-400">
                                <AlertCircle size={12} />
                                {test.message}
                              </span>
                              {test.testedAt && (
                                <p className="mt-0.5 font-mono text-[10px] text-[#F1E9DA]/40">
                                  Checked at {test.testedAt}
                                </p>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono text-xs text-[#F1E9DA]/40">
                            <ShieldAlert size={13} />
                            Untested in current session
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {provider.code.toUpperCase() === "NEXAVPS" && (() => {
                          const wallet = nexaBalance[provider.id];
                          const walletValue = wallet?.balance;

                          return (
                            <div className="space-y-2">
                              {wallet && wallet.message ? (
                                <p className="font-mono text-xs text-red-300">{wallet.message}</p>
                              ) : wallet && wallet.balance !== undefined ? (
                                <div>
                                  <p className="font-mono text-sm font-semibold text-[#C6A66B]">
                                    <Wallet size={13} className="mr-1 inline" />
                                    {wallet.currency}{" "}
                                    {walletValue !== undefined
                                      ? Number(walletValue).toLocaleString("en-IN")
                                      : "Balance data received"}
                                  </p>
                                  {wallet.fetchedAt && (
                                    <p className="font-mono text-[10px] text-[#F1E9DA]/40">
                                      Checked at {wallet.fetchedAt}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="font-mono text-xs text-[#F1E9DA]/40">
                                  Wallet balance not fetched
                                </p>
                              )}

                              <button
                                onClick={() => handleRefreshNexaBalance(provider)}
                                disabled={balanceLoadingId === provider.id}
                                className="flex items-center gap-1.5 rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-xs font-semibold text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521] disabled:opacity-50"
                              >
                                <RefreshCw
                                  size={12}
                                  className={balanceLoadingId === provider.id ? "animate-spin" : ""}
                                />
                                {balanceLoadingId === provider.id ? "Fetching..." : "Refresh Wallet"}
                              </button>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
                            provider.isActive
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border border-red-500/30 bg-red-500/10 text-red-400"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${provider.isActive ? "bg-emerald-400" : "bg-red-400"}`} />
                          {provider.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            title="Test Live Connection"
                            disabled={testingId === provider.id}
                            onClick={() => handleTestConnection(provider)}
                            className="flex items-center gap-1.5 rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-xs font-semibold text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521] disabled:opacity-50"
                          >
                            <Activity
                              size={13}
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
                            className={`rounded-lg border border-[#332f2a] bg-[#171717] p-2 transition ${
                              provider.isActive
                                ? "text-red-400 hover:border-red-500/40 hover:bg-red-950/20"
                                : "text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-950/20"
                            }`}
                          >
                            <Power size={14} />
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
        <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
          <div className="flex flex-col justify-between gap-3 border-b border-[#332f2a] p-6 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#332f2a] bg-[#171717] text-[#C6A66B]">
                  <Database size={16} />
                </div>
                <h2 className="font-serif text-lg font-bold text-[#F1E9DA]">
                  HostHeaven Live Catalogue
                </h2>
              </div>
              <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">
                Live zones, provider pricing and wallet data from HostHeaven.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={loadHostHeavenCatalogue}
                disabled={catalogueLoading}
                className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d] disabled:opacity-50"
              >
                <RefreshCw
                  size={13}
                  className={catalogueLoading ? "animate-spin" : ""}
                />
                {catalogueLoading ? "Loading..." : "Refresh Catalogue"}
              </button>

              {catalogue && (
                <button
                  onClick={() => setCatalogueVisible(!catalogueVisible)}
                  className="rounded-xl border border-[#332f2a] bg-[#171717] p-2 text-[#F1E9DA]/70 transition hover:bg-[#292521] hover:text-[#F1E9DA]"
                  title="Toggle catalogue"
                >
                  {catalogueVisible ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
              )}
            </div>
          </div>

          {catalogueError && (
            <div className="m-5 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-4 font-mono text-xs text-red-300">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
              <span>{catalogueError}</span>
            </div>
          )}

          {!catalogue && !catalogueLoading && !catalogueError && (
            <div className="p-12 text-center">
              <Globe size={32} className="mx-auto mb-3 text-[#F1E9DA]/30" />
              <p className="font-serif font-bold text-[#F1E9DA]">
                Catalogue not loaded
              </p>
              <p className="mt-1 font-mono text-xs text-[#F1E9DA]/50">
                Click Refresh Catalogue to fetch live HostHeaven data.
              </p>
            </div>
          )}

          {catalogueLoading && !catalogue && (
            <div className="p-16 text-center font-mono text-xs text-[#F1E9DA]/50">
              <RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]" size={22} />
              Fetching live catalogue from HostHeaven...
            </div>
          )}

          {catalogue && catalogueVisible && (
            <div className="space-y-6 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Wallet size={16} />
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider">
                      HostHeaven Provider Wallet
                    </p>
                  </div>
                  <p className="mt-3 font-serif text-3xl font-bold text-[#F1E9DA]">
                    {catalogue.wallet?.currency || "INR"}{" "}
                    {Number(
                      catalogue.wallet?.balance ?? 0,
                    ).toLocaleString("en-IN")}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/40">
                    Live provider wallet balance
                  </p>
                </div>

                <div className="rounded-xl border border-[#332f2a] bg-[#171717] p-5">
                  <div className="flex items-center gap-2 text-[#C6A66B]">
                    <Globe size={16} />
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider">
                      Available Zones
                    </p>
                  </div>
                  <p className="mt-3 font-serif text-3xl font-bold text-[#F1E9DA]">
                    {catalogue.zones?.length ?? 0}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/40">
                    Zones returned by HostHeaven API
                  </p>
                </div>
              </div>

              <section>
                <h3 className="mb-3.5 flex items-center gap-2 font-serif text-sm font-bold text-[#F1E9DA]">
                  <Globe size={15} className="text-[#C6A66B]" />
                  Live Hosting Zones
                </h3>

                {!catalogue.zones || catalogue.zones.length === 0 ? (
                  <p className="rounded-xl border border-[#332f2a] p-5 text-center font-mono text-xs text-[#F1E9DA]/50">
                    No zones returned by the provider.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {catalogue.zones.map((zone) => (
                      <div
                        key={zone.id}
                        className="rounded-xl border border-[#332f2a] bg-[#171717] p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-[#F1E9DA]">
                              {zone.name}
                            </p>
                            <p className="mt-0.5 font-sans text-xs text-[#F1E9DA]/60">
                              {zone.location || "Location not provided"}
                              {zone.country ? `, ${zone.country}` : ""}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                              zone.isAvailable === false
                                ? "border border-red-500/30 bg-red-500/10 text-red-400"
                                : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            }`}
                          >
                            {zone.isAvailable === false
                              ? "Unavailable"
                              : "Available"}
                          </span>
                        </div>
                        <p className="mt-3 break-all font-mono text-[10px] text-[#F1E9DA]/40">
                          ID: {zone.id}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-3 font-serif text-sm font-bold text-[#F1E9DA]">
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
                <h3 className="mb-3 font-serif text-sm font-bold text-[#F1E9DA]">
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

              <p className="font-mono text-xs text-[#F1E9DA]/40">
                Data is fetched directly from the HostHeaven backend
                integration. Provider prices shown here are provider costs,
                not client selling prices.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
