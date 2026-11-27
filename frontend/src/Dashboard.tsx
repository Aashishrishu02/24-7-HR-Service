import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  CreditCard,
  HardDrive,
  History,
  Menu,
  Monitor,
  Plus,
  RefreshCw,
  Server,
  Wallet,
  X,
  Zap,
  AlertCircle,
  AlertTriangle,
  Activity,
  Lock,
  Unlock,
  Globe,
  KeyRound,
  RotateCcw,
  Power,
  Search,
  ArrowUpDown,
  Layers,
} from "lucide-react";
import api from "./api";
import logo from "./assets/247-logo.png";
import BuyLinuxIP from "./BuyLinuxIP";
import CustomerSupportDesk from "./CustomerSupportDesk";
import VpsDetail from "./VpsDetail";

type SmartVPSPlan = {
  ramGb: number;
  name: string;
  availableCount: number;
  price: number | string;
  monthlyPrice?: number | string;
  currency: string;
  inStock: boolean;
};

type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerifiedAt: string | null;
  isActive: boolean;
  createdAt: string;
};

type VPSInstance = {
  id: string;
  userId: string;
  provider: string;
  providerVpsId?: string | null;
  inventory?: {
    cpuCores?: number | null;
    ramGb?: number | null;
    storageGb?: number | null;
    bandwidthGb?: number | null;
    region?: string | null;
    operatingSystem?: string | null;
  } | null;
  ipAddress: string;
  hostname: string | null;
  operatingSystem: string | null;
  ram: number | null;
  status: string;
  expiresAt: string | null;
  autoRenew?: boolean;
  autoRenewConsentAt?: string | null;
  autoRenewDisabledAt?: string | null;
  gracePeriodDays?: number;
  gracePeriodExpiresAt?: string | null;
  suspendedAt?: string | null;
  providerSuspended?: boolean;
  createdAt: string;
};

type VPSRenewalDetails = {
  vpsId: string;
  ipAddress: string;
  hostname: string | null;
  status: string;
  expiresAt: string | null;
  autoRenew: boolean;
  autoRenewConsentAt: string | null;
  autoRenewDisabledAt: string | null;
  gracePeriodDays: number;
  gracePeriodExpiresAt: string | null;
  suspendedAt: string | null;
  plan: {
    name: string;
    renewalPrice: number | string;
    currency: string;
    durationDays: number;
  };
  wallet: {
    balance: number | string;
    currency: string;
  };
  isBalanceSufficient: boolean;
  shortfall: number | string;
  nextRenewalAttempt: string | null;
  recentAttempts?: {
    id: string;
    status: string;
    renewalAmount: number | string;
    attemptedAt: string;
    errorMessage?: string | null;
  }[];
};

type VPSPlan = {
  id: string;
  name: string;
  productType: "VPS_HOSTING" | "LINUX_IP_VPS";
  description?: string | null;
  cpuCores?: number | null;
  ramGb?: number | null;
  storageGb?: number | null;
  bandwidthGb?: number | null;
  price: number | string;
  monthlyPrice?: number | string;
  currency?: string;
  durationDays?: number;
  supportedOS?: string[];
  location?: string;
  tier?: string;
  isHostHeaven?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  providerConfig?: {
    zoneId: string;
    zoneIsoId: string;
    planType: "SHARED" | "DEDICATED";
    cpuPriceId: string;
    ramPriceId: string;
    diskPriceId: string;
    bandwidthPriceId: string;
  };
  billingOptions?: Array<{
    months: number;
    durationDays: number;
    customerPrice: number;
    grossProfit?: number;
    label: string;
  }>;
  operatingSystems?: Array<{
    id: string;
    name: string;
    osType: string;
  }>;
};

type WalletData = {
  id: string;
  userId: string;
  currency: string;
  balance: number | string;
  createdAt: string;
  updatedAt: string;
};

type WalletTx = {
  id: string;
  type: "CREDIT" | "DEBIT" | "REFUND" | "ADJUSTMENT";
  amount: number | string;
  currency: string;
  reference: string | null;
  description: string;
  paymentId: string | null;
  createdAt: string;
};

type OrderData = {
  id: string;
  orderNumber: string;
  planId: string;
  planName: string;
  operatingSystem: string;
  amount: number | string;
  currency: string;
  status: string;
  createdAt: string;
  plan?: {
    name: string;
    cpuCores: number | null;
    ramGb: number | null;
    storageGb: number | null;
    durationDays: number;
  };
  vpsInstance?: {
    id: string;
    ipAddress: string;
    status: string;
    expiresAt: string | null;
  } | null;
  payments?: {
    id: string;
    provider: string;
    amount: number | string;
    currency: string;
    status: string;
    createdAt: string;
  }[];
};

type Page =
  | "Home"
  | "Windows VPS"
  | "Linux VPS"
  | "Dedicated IP"
  | "My VPS"
  | "Wallet"
  | "Orders"
  | "Support"
  | "Checkout";

const navItems: { label: Page; short: string }[] = [
  { label: "Home", short: "Home" },
  { label: "Windows VPS", short: "Windows VPS" },
  { label: "Linux VPS", short: "Linux VPS" },
  { label: "Dedicated IP", short: "Dedicated IP" },
  { label: "My VPS", short: "My Servers" },
  { label: "Wallet", short: "Wallet" },
  { label: "Orders", short: "Orders" },
  { label: "Support", short: "Support" },
];

const formatDecimal = (value: number | string, currency = "INR") => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const determineInitialPage = (): Page => {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("wallet")) return "Wallet";
  if (path.includes("order")) return "Orders";
  if (path.includes("checkout")) return "Checkout";
  if (path.includes("server") || path.includes("my-vps")) return "My VPS";
  if (path.includes("windows")) return "Windows VPS";
  if (path.includes("dedicated-ip")) return "Dedicated IP";
  if (path.includes("linux")) return "Linux VPS";
  if (path.includes("support")) return "Support";
  return "Home";
};

export default function Dashboard() {
  const [page, setPage] = useState<Page>(determineInitialPage());
  const [selectedVpsId, setSelectedVpsId] = useState<string | null>(() => {
    const parts = window.location.pathname.split("/");
    return parts[1] === "my-vps" && parts[2] ? parts[2] : null;
  });
  const [checkoutReturnPage, setCheckoutReturnPage] = useState<Page>("Windows VPS");
  const [dedicatedIpEnabled, setDedicatedIpEnabled] = useState(false);
  const [dedicatedIpStatusLoaded, setDedicatedIpStatusLoaded] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [supportContact, setSupportContact] = useState<Record<string, string>>({});
  const [vpsList, setVpsList] = useState<VPSInstance[]>([]);
  const [plans, setPlans] = useState<VPSPlan[]>([]);
  const [smartVpsPlans, setSmartVpsPlans] = useState<SmartVPSPlan[]>([]);
  const [smartVpsLoading, setSmartVpsLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);

  const [loading, setLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [error, setError] = useState("");
  const [plansError, setPlansError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Plans Search, Filter & Sort State
  const [planSearch, setPlanSearch] = useState("");
  const [selectedRamFilter, setSelectedRamFilter] = useState<number | "ALL">("ALL");
  const [selectedCpuFilter, setSelectedCpuFilter] = useState<number | "ALL">("ALL");
  const [selectedSort, setSelectedSort] = useState<
    "DEFAULT" | "PRICE_ASC" | "PRICE_DESC" | "RAM_ASC" | "RAM_DESC"
  >("DEFAULT");

  // Checkout modal state
  const [selectedPlan, setSelectedPlan] = useState<VPSPlan | null>(null);
  const [selectedOS, setSelectedOS] = useState("");
  const [selectedMonths, setSelectedMonths] = useState<number>(1);
  const [customHostname, setCustomHostname] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"WALLET" | "RAZORPAY">(
    "WALLET",
  );
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // Topup modal state
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState<number>(500);
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState("");

  // Auto-renewal modal state
  const [renewalModalVpsId, setRenewalModalVpsId] = useState<string | null>(null);
  const [renewalDetails, setRenewalDetails] = useState<VPSRenewalDetails | null>(null);
  const [renewalLoading, setRenewalLoading] = useState(false);
  const [renewalConsentChecked, setRenewalConsentChecked] = useState(false);
  const [renewalActionLoading, setRenewalActionLoading] = useState(false);
  const [renewalRazorpayLoading, setRenewalRazorpayLoading] = useState(false);
  const [renewalError, setRenewalError] = useState("");
  const [renewalSuccess, setRenewalSuccess] = useState("");

  // HostHeaven live catalogue & diagnostics state
  const [hhZones, setHhZones] = useState<
    Array<{ id: string; name: string; location?: string }>
  >([]);
  const [hhIsos, setHhIsos] = useState<
    Array<{ id: string; isoName: string; osType: string }>
  >([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");

  // HostHeaven VPS Diagnostics & Control Modal
  const [manageModalVps, setManageModalVps] = useState<VPSInstance | null>(null);
  const [manageDetails, setManageDetails] = useState<any | null>(null);
  const [manageLock] = useState<any | null>(null);
  const [manageMetrics] = useState<any | null>(null);
  const [manageStorage] = useState<any | null>(null);
  const [manageTab, setManageTab] = useState<
    "overview" | "metrics" | "storage" | "password" | "rebuild"
  >("overview");
  const [manageLoading] = useState(false);
  const [manageActionLoading, setManageActionLoading] = useState(false);
  const [manageNotice, setManageNotice] = useState("");
  const [manageError, setManageError] = useState("");
  const [newVmPassword, setNewVmPassword] = useState("");
  const [selectedRebuildIso, setSelectedRebuildIso] = useState("");

  const fetchProfile = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("indiccloud_token");
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const response = await api.get("/profile");
      setProfile(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        sessionStorage.removeItem("indiccloud_token");
        window.location.href = "/login";
        return;
      }
    }
  }, []);

  const fetchVps = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("/vps");
      setVpsList(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      if (err.response?.status === 401) {
        sessionStorage.removeItem("indiccloud_token");
        window.location.href = "/login";
        return;
      }
      setError(err.response?.data?.message || "Unable to load your servers.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    try {
      setPlansLoading(true);
      setPlansError("");
      const response = await api.get("/plans");
      const rows = Array.isArray(response.data)
        ? response.data
        : response.data?.plans;
      setPlans(
        Array.isArray(rows)
          ? rows.filter((plan: VPSPlan) => plan.isActive !== false)
          : [],
      );
    } catch (err: any) {
      setPlans([]);
      setPlansError(
        err.response?.data?.message ||
          "Plans are not available yet. Please check back shortly.",
      );
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const fetchSmartVpsPlans = useCallback(async () => {
    try {
      setSmartVpsLoading(true);
      const response = await api.get("/plans/smartvps");
      const rows = Array.isArray(response.data?.plans)
        ? response.data.plans
        : [];
      setSmartVpsPlans(
        rows.filter(
          (plan: SmartVPSPlan) =>
            plan.inStock === true && Number(plan.availableCount) > 0,
        ),
      );
    } catch {
      setSmartVpsPlans([]);
    } finally {
      setSmartVpsLoading(false);
    }
  }, []);

  const fetchSupportContact = useCallback(async () => {
    try {
      const response = await api.get("/plans/contact-settings");
      setSupportContact(response.data ?? {});
    } catch {
      setSupportContact({});
    }
  }, []);

  const fetchWallet = useCallback(async () => {
    try {
      setWalletLoading(true);
      const res = await api.get("/wallet");
      setWallet(res.data);
    } catch (err: any) {
      console.warn("Wallet fetch failed:", err?.response?.data?.message);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await api.get("/wallet/transactions?limit=50");
      setTransactions(
        Array.isArray(res.data?.transactions) ? res.data.transactions : [],
      );
    } catch (err: any) {
      console.warn("Transactions fetch failed:", err?.response?.data?.message);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setOrdersLoading(true);
      const res = await api.get("/checkout/orders");
      setOrders(Array.isArray(res.data?.orders) ? res.data.orders : []);
    } catch (err: any) {
      console.warn("Orders fetch failed:", err?.response?.data?.message);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const fetchHostHeavenCatalogue = useCallback(async () => {
    try {
      const res = await api.get("/hostheaven/zones");
      const rawZones = Array.isArray(res.data) ? res.data : [];
      const zones = rawZones.filter(
        (z: any) =>
          !z.name?.toLowerCase().includes("coming soon") &&
          z.status?.toUpperCase() === "ACTIVE",
      );
      setHhZones(zones);
      if (zones.length > 0) {
        const defaultZone = zones[0];
        setSelectedZoneId(defaultZone.id);
        const isoRes = await api.get(`/hostheaven/zones/${defaultZone.id}/isos`);
        const isos = Array.isArray(isoRes.data) ? isoRes.data : [];
        setHhIsos(isos);
        if (isos.length > 0) {
          setSelectedOS((prev) => prev || isos[0].isoName);
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }, []);

  const handleZoneChange = async (zoneId: string) => {
    setSelectedZoneId(zoneId);
    try {
      const isoRes = await api.get(`/hostheaven/zones/${zoneId}/isos`);
      const isos = Array.isArray(isoRes.data) ? isoRes.data : [];
      setHhIsos(isos);
      if (isos.length > 0) {
        setSelectedOS(isos[0].isoName);
      }
    } catch {
      // Keep existing OS list
    }
  };

  const handleHostHeavenPowerAction = async (action: string) => {
    if (!manageModalVps) return;
    setManageActionLoading(true);
    setManageNotice("");
    setManageError("");

    try {
      const res = await api.post(
        `/hostheaven/vms/${manageModalVps.id}/control`,
        { action },
      );
      setManageNotice(
        res.data?.message || `Command ${action} submitted successfully.`,
      );
      const detailsRes = await api
        .get(`/hostheaven/vms/${manageModalVps.id}/details`)
        .catch(() => null);
      if (detailsRes?.data) setManageDetails(detailsRes.data);
      await fetchVps();
    } catch (err: any) {
      setManageError(
        err.response?.data?.message || `Failed to execute ${action}`,
      );
    } finally {
      setManageActionLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!manageModalVps || !newVmPassword || newVmPassword.length < 8) {
      setManageError("Password must be at least 8 characters long");
      return;
    }
    setManageActionLoading(true);
    setManageNotice("");
    setManageError("");

    try {
      const res = await api.put(
        `/hostheaven/vms/${manageModalVps.id}/password`,
        { password: newVmPassword },
      );
      setManageNotice(res.data?.message || "Password updated successfully.");
      setNewVmPassword("");
    } catch (err: any) {
      setManageError(err.response?.data?.message || "Failed to change password");
    } finally {
      setManageActionLoading(false);
    }
  };

  const handleRebuildVm = async () => {
    if (!manageModalVps || !selectedRebuildIso) {
      setManageError("Please select an operating system ISO for rebuild");
      return;
    }
    if (
      !window.confirm(
        "Warning: Rebuilding will erase all data on the root disk. Proceed?",
      )
    ) {
      return;
    }
    setManageActionLoading(true);
    setManageNotice("");
    setManageError("");

    try {
      const res = await api.post(
        `/hostheaven/vms/${manageModalVps.id}/rebuild`,
        { isoId: selectedRebuildIso },
      );
      setManageNotice(res.data?.message || "Rebuild initiated successfully.");
      await fetchVps();
    } catch (err: any) {
      setManageError(
        err.response?.data?.message || "Failed to initiate rebuild",
      );
    } finally {
      setManageActionLoading(false);
    }
  };

  useEffect(() => {
    void fetchProfile();
    void fetchVps();
    void fetchPlans();
    void fetchSmartVpsPlans();
    void fetchSupportContact();
    void fetchWallet();
    void fetchTransactions();
    void fetchOrders();
    void fetchHostHeavenCatalogue();
  }, [
    fetchProfile,
    fetchVps,
    fetchPlans,
    fetchSmartVpsPlans,
    fetchSupportContact,
    fetchWallet,
    fetchTransactions,
    fetchOrders,
    fetchHostHeavenCatalogue,
  ]);

  const handleVpsAction = async (id: string, action: "start" | "stop") => {
    try {
      setActionLoading(id);
      setError("");
      setNotice("");
      const response = await api.post(`/vps/${id}/${action}`);
      setNotice(
        response.data?.message || `Server ${action} request completed.`,
      );
      await fetchVps();
    } catch (err: any) {
      setError(
        err.response?.data?.message || `Unable to ${action} this server.`,
      );
    } finally {
      setActionLoading(null);
    }
  };

  const openRenewalModal = async (vpsId: string) => {
    setRenewalModalVpsId(vpsId);
    setRenewalDetails(null);
    setRenewalError("");
    setRenewalSuccess("");
    setRenewalConsentChecked(false);
    setRenewalLoading(true);

    try {
      const res = await api.get(`/vps/${vpsId}/renewal-details`);
      setRenewalDetails(res.data);
      setRenewalConsentChecked(Boolean(res.data.autoRenew && res.data.autoRenewConsentAt));
    } catch (err: any) {
      setRenewalError(err.response?.data?.message || "Failed to load renewal details");
    } finally {
      setRenewalLoading(false);
    }
  };

  const handleToggleAutoRenew = async (enabled: boolean) => {
    if (!renewalModalVpsId) return;
    setRenewalActionLoading(true);
    setRenewalError("");
    setRenewalSuccess("");

    try {
      const res = await api.post(`/vps/${renewalModalVpsId}/auto-renew`, {
        enabled,
        consent: enabled ? renewalConsentChecked : false,
      });
      setRenewalSuccess(res.data?.message || "Auto-renew setting updated.");
      const detailsRes = await api.get(`/vps/${renewalModalVpsId}/renewal-details`);
      setRenewalDetails(detailsRes.data);
      await fetchVps();
    } catch (err: any) {
      setRenewalError(err.response?.data?.message || "Failed to update auto-renew setting");
    } finally {
      setRenewalActionLoading(false);
    }
  };

  const handleManualRenew = async () => {
    if (!renewalModalVpsId) return;
    setRenewalActionLoading(true);
    setRenewalError("");
    setRenewalSuccess("");

    try {
      const res = await api.post(`/vps/${renewalModalVpsId}/renew`);
      setRenewalSuccess(res.data?.message || "VPS renewed successfully!");
      const detailsRes = await api.get(`/vps/${renewalModalVpsId}/renewal-details`);
      setRenewalDetails(detailsRes.data);
      await Promise.all([fetchVps(), fetchWallet(), fetchTransactions()]);
    } catch (err: any) {
      setRenewalError(err.response?.data?.message || "Failed to renew VPS");
    } finally {
      setRenewalActionLoading(false);
    }
  };

  const handleRazorpayRenew = async () => {
    if (!renewalModalVpsId) return;
    setRenewalRazorpayLoading(true);
    setRenewalError("");
    setRenewalSuccess("");

    try {
      const res = await api.post(`/vps/${renewalModalVpsId}/renewal/razorpay/create`);
      const data = res.data;

      const Razorpay = (window as any).Razorpay;
      if (!Razorpay || !data.keyId) {
        setRenewalError("Razorpay payment gateway is not loaded or key is missing. Please contact support.");
        setRenewalRazorpayLoading(false);
        return;
      }

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency || "INR",
        name: "24/7 HR Service",
        description: `VPS Server Renewal - ${data.planName || "Cloud VPS"}`,
        order_id: data.razorpayOrderId,
        handler: async (response: any) => {
          try {
            setRenewalActionLoading(true);
            const verifyRes = await api.post(`/vps/${renewalModalVpsId}/renewal/razorpay/verify`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setRenewalSuccess(verifyRes.data?.message || "VPS renewed successfully via Razorpay!");
            const detailsRes = await api.get(`/vps/${renewalModalVpsId}/renewal-details`);
            setRenewalDetails(detailsRes.data);
            await Promise.all([fetchVps(), fetchWallet(), fetchTransactions()]);
          } catch (vErr: any) {
            setRenewalError(
              vErr.response?.data?.message || "Payment completed on gateway, but verification failed. Support will assist shortly."
            );
          } finally {
            setRenewalActionLoading(false);
          }
        },
        prefill: {
          name: profile?.name || "",
          email: profile?.email || "",
        },
        theme: {
          color: "#C6A66B",
        },
        modal: {
          ondismiss: () => {
            setRenewalRazorpayLoading(false);
          },
        },
      };

      const rzp = new Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setRenewalError(err.response?.data?.message || "Failed to initiate Razorpay renewal. Please try again.");
    } finally {
      setRenewalRazorpayLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("indiccloud_token");
    window.location.href = "/login";
  };

  useEffect(() => {
    let cancelled = false;

    api.get("/plans/dedicated-ip-status")
      .then((response) => {
        if (!cancelled) {
          setDedicatedIpEnabled(response.data?.enabled === true);
        }
      })
      .catch(() => {
        if (!cancelled) setDedicatedIpEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setDedicatedIpStatusLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      dedicatedIpStatusLoaded &&
      !dedicatedIpEnabled &&
      page === "Dedicated IP"
    ) {
      setPage("Home");
      setMobileMenu(false);
      if (window.location.pathname === "/dedicated-ip") {
        window.history.replaceState(null, "", "/dashboard");
      }
    }
  }, [dedicatedIpStatusLoaded, dedicatedIpEnabled, page]);

  useEffect(() => {
    const handlePopState = () => {
      setPage(determineInitialPage());
      const parts = window.location.pathname.split("/");
      setSelectedVpsId(
        parts[1] === "my-vps" && parts[2] ? parts[2] : null,
      );
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (page === "Checkout" && plans.length > 0 && !selectedPlan) {
      const urlParams = new URLSearchParams(window.location.search);
      const planIdFromUrl = urlParams.get("planId");
      const matched = plans.find((p) => p.id === planIdFromUrl) || plans[0];
      if (matched) {
        setSelectedPlan(matched);
      }
    }
  }, [page, plans, selectedPlan]);

  useEffect(() => {
    if (selectedPlan) {
      const availableOsList =
        hhIsos.length > 0
          ? hhIsos.map((iso) => iso.isoName)
          : selectedPlan.supportedOS?.length
          ? selectedPlan.supportedOS
          : ["Ubuntu 22.04 LTS", "Windows Server 2022"];

      if (!selectedOS || !availableOsList.includes(selectedOS)) {
        setSelectedOS(availableOsList[0] || "Ubuntu 22.04 LTS");
      }
    }
  }, [selectedPlan, hhIsos, selectedOS]);

  const go = (next: Page) => {
    setPage(next);
    if (next === "My VPS") setSelectedVpsId(null);
    setMobileMenu(false);
    setNotice("");
    setError("");

    const pathMap: Record<Page, string> = {
      Home: "/dashboard",
      "Windows VPS": "/windows-vps",
      "Linux VPS": "/linux-vps",
      "Dedicated IP": "/dedicated-ip",
      "My VPS": "/my-vps",
      Wallet: "/wallet",
      Orders: "/orders",
      Support: "/support",
      Checkout: "/checkout",
    };

    const targetPath = pathMap[next] || "/dashboard";
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, "", targetPath);
    }

    if (next === "Wallet") {
      void fetchWallet();
      void fetchTransactions();
    } else if (next === "Orders") {
      void fetchOrders();
    } else if (next === "My VPS") {
      void fetchVps();
    } else if (next === "Checkout") {
      void fetchWallet();
    }
  };

  const openVpsDashboard = (vps: VPSInstance) => {
    setSelectedVpsId(vps.id);
    setPage("My VPS");
    setMobileMenu(false);
    setNotice("");
    setError("");
    const targetPath = `/my-vps/${encodeURIComponent(vps.id)}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, "", targetPath);
    }
  };

  const closeCheckout = () => {
    setSelectedPlan(null);
    go(checkoutReturnPage === "Checkout" ? "Windows VPS" : checkoutReturnPage);
  };

  const openCheckout = (plan: VPSPlan) => {
    setCheckoutReturnPage(page === "Checkout" ? "Windows VPS" : page);
    setSelectedPlan(plan);
    const initialOS = plan.supportedOS?.[0] || "Ubuntu 22.04 LTS";
    setSelectedOS(initialOS);
    setSelectedMonths(1);
    setCustomHostname("");

    const targetZoneId =
      plan.providerConfig?.zoneId && plan.providerConfig.zoneId !== "7"
        ? plan.providerConfig.zoneId
        : hhZones[0]?.id || "23";
    setSelectedZoneId(targetZoneId);

    // Fetch ISOs for zone so OS dropdown is populated
    api.get(`/hostheaven/zones/${targetZoneId}/isos`)
      .then((res) => {
        const isos = Array.isArray(res.data) ? res.data : [];
        setHhIsos(isos);
        if (isos.length > 0 && (!initialOS || initialOS === "Ubuntu 22.04")) {
          setSelectedOS(isos[0].isoName);
        }
      })
      .catch(() => {});

    setCheckoutError("");
    setPaymentMethod("WALLET");
    void fetchWallet();
    go("Checkout");
  };

  // Top-Up execution
  const handleTopup = async () => {
    if (topupAmount < 100) {
      setTopupError("Minimum top-up amount is ₹100");
      return;
    }
    setTopupLoading(true);
    setTopupError("");

    try {
      const createRes = await api.post("/wallet/topup/create", {
        amount: Number(topupAmount),
      });

      const data = createRes.data;

      // Check if Razorpay modal is available in browser
      const Razorpay = (window as any).Razorpay;
      if (Razorpay && data.keyId) {
        const options = {
          key: data.keyId,
          amount: data.amount,
          currency: data.currency || "INR",
          name: "24/7 HR Service",
          description: "Wallet Balance Top-Up",
          order_id: data.razorpayOrderId,
          handler: async (response: any) => {
            try {
              const verifyRes = await api.post("/wallet/topup/verify", {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              setNotice(
                verifyRes.data?.message ||
                  `Wallet topped up successfully! ₹${topupAmount} added.`,
              );
              setShowTopupModal(false);
              await fetchWallet();
              await fetchTransactions();
            } catch (vErr: any) {
              setTopupError(
                vErr.response?.data?.message || "Payment verification failed",
              );
            }
          },
          prefill: {
            name: profile?.name || "",
            email: profile?.email || "",
          },
          theme: {
            color: "#06b6d4",
          },
        };
        const rzp = new Razorpay(options);
        rzp.open();
      } else {
        setTopupError(
          "Payment gateway is not configured or unavailable. Please contact support to enable online payments.",
        );
      }
    } catch (err: any) {
      setTopupError(
        err.response?.data?.message ||
          "Failed to initiate wallet top-up. Please try again.",
      );
    } finally {
      setTopupLoading(false);
    }
  };

  // Checkout order execution
  const handleCheckoutSubmit = async () => {
    if (!selectedPlan) return;
    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      if (selectedPlan.isHostHeaven || selectedPlan.providerConfig) {
        const config = selectedPlan.providerConfig;
        const requiredConfigValues = [
          config?.zoneId,
          config?.zoneIsoId,
          config?.planType,
          config?.cpuPriceId,
          config?.ramPriceId,
          config?.diskPriceId,
          config?.bandwidthPriceId,
        ];

        if (
          !config ||
          requiredConfigValues.some(
            (value) => typeof value !== "string" || value.trim() === "",
          )
        ) {
          throw new Error(
            "HostHeaven plan configuration is incomplete. Please refresh the VPS plans and try again.",
          );
        }

        const matchingIso = hhIsos.find(
          (i) => i.isoName === selectedOS || i.id === selectedOS,
        );

        const res = await api.post("/hostheaven/checkout", {
          zoneId: selectedZoneId || config.zoneId,
          zoneIsoId: matchingIso?.id || config.zoneIsoId,
          planType:
            config?.planType ||
            (selectedPlan.tier?.toLowerCase().includes("dedicated")
              ? "DEDICATED"
              : "SHARED"),
          cpuPriceId: config.cpuPriceId,
          ramPriceId: config.ramPriceId,
          diskPriceId: config.diskPriceId,
          bandwidthPriceId: config.bandwidthPriceId,
          months: selectedMonths || 1,
          operatingSystem: selectedOS,
          hostname: customHostname.trim() || undefined,
          paymentMethod: paymentMethod,
        });

        if (paymentMethod === "WALLET") {
          setNotice(
            res.data?.message ||
              `HostHeaven VPS deployed successfully! Order #${res.data?.order?.orderNumber}`,
          );
          setSelectedPlan(null);
          go("My VPS");

          await Promise.all([
            fetchWallet(),
            fetchTransactions(),
            fetchOrders(),
            fetchVps(),
          ]);
          return;
        }

        // Razorpay payment flow for HostHeaven VPS
        const checkout = res.data;
        const RazorpayConstructor = (window as any).Razorpay;

        if (!RazorpayConstructor) {
          throw new Error(
            "Razorpay Checkout did not load. Please refresh the page and try again.",
          );
        }

        if (
          !checkout?.keyId ||
          !checkout?.razorpayOrderId ||
          !checkout?.amount ||
          !checkout?.currency
        ) {
          throw new Error(
            "The server returned incomplete Razorpay checkout details.",
          );
        }

        let verificationStarted = false;

        const razorpay = new RazorpayConstructor({
          key: checkout.keyId,
          amount: checkout.amount,
          currency: checkout.currency,
          name: "247HR Service",
          description: `VPS Order ${checkout.orderNumber}`,
          order_id: checkout.razorpayOrderId,

          handler: async (response: any) => {
            verificationStarted = true;
            setCheckoutLoading(true);
            setCheckoutError("");

            try {
              const verifyRes = await api.post(
                `/checkout/orders/${checkout.orderId}/razorpay/verify`,
                {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
              );

              setNotice(
                verifyRes.data?.message ||
                  `VPS order placed successfully! Order #${checkout.orderNumber}`,
              );
              setSelectedPlan(null);
              go("My VPS");

              await Promise.all([
                fetchWallet(),
                fetchTransactions(),
                fetchOrders(),
                fetchVps(),
              ]);
            } catch (vErr: any) {
              setCheckoutError(
                vErr.response?.data?.message ||
                  "Payment captured, but VPS verification failed. Please contact support.",
              );
            } finally {
              setCheckoutLoading(false);
            }
          },
          prefill: {
            name: profile?.name || "",
            email: profile?.email || "",
          },
          theme: {
            color: "#C6A66B",
          },
          modal: {
            ondismiss: () => {
              if (!verificationStarted) {
                setCheckoutLoading(false);
              }
            },
          },
        });

        razorpay.open();
        return;
      }

      const orderRes = await api.post("/checkout/orders", {
        planId: selectedPlan.id,
        operatingSystem: selectedOS,
      });

      const order = orderRes.data?.order;
      if (!order?.id) {
        throw new Error("Failed to create order record");
      }

      if (paymentMethod === "WALLET") {
        const payRes = await api.post(
          `/checkout/orders/${order.id}/pay-wallet`,
        );

        if (payRes.data?.status === "REFUNDED") {
          setError(
            payRes.data?.message ||
              "VPS provisioning could not be completed. Your wallet balance has been refunded in full.",
          );
        } else {
          setNotice(
            payRes.data?.message ||
              `VPS order placed successfully! Order #${order.orderNumber}`,
          );
          setSelectedPlan(null);
          go("My VPS");
        }

        await Promise.all([
          fetchWallet(),
          fetchTransactions(),
          fetchOrders(),
          fetchVps(),
        ]);
        return;
      }

      const razorpayRes = await api.post(
        `/checkout/orders/${order.id}/razorpay/create`,
      );
      const checkout = razorpayRes.data;
      const RazorpayConstructor = (window as any).Razorpay;

      if (!RazorpayConstructor) {
        throw new Error(
          "Razorpay Checkout did not load. Please refresh the page and try again.",
        );
      }

      if (
        !checkout?.keyId ||
        !checkout?.razorpayOrderId ||
        !checkout?.amount ||
        !checkout?.currency
      ) {
        throw new Error("The server returned incomplete Razorpay checkout details.");
      }

      let verificationStarted = false;

      const razorpay = new RazorpayConstructor({
        key: checkout.keyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "247HR Service",
        description: `VPS Order ${checkout.orderNumber || order.orderNumber}`,
        order_id: checkout.razorpayOrderId,

        handler: async (response: any) => {
          verificationStarted = true;
          setCheckoutLoading(true);
          setCheckoutError("");

          try {
            const verifyRes = await api.post(
              `/checkout/orders/${order.id}/razorpay/verify`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            );

            setNotice(
              verifyRes.data?.message ||
                `Payment verified successfully. Order #${order.orderNumber}`,
            );
            setSelectedPlan(null);
            go("My VPS");

            await Promise.all([
              fetchWallet(),
              fetchTransactions(),
              fetchOrders(),
              fetchVps(),
            ]);
          } catch (verifyErr: any) {
            setCheckoutError(
              verifyErr.response?.data?.message ||
                "Payment verification could not be completed. Please check your order status before trying another payment.",
            );
            await Promise.all([fetchOrders(), fetchVps()]);
          } finally {
            setCheckoutLoading(false);
          }
        },

        modal: {
          ondismiss: () => {
            if (!verificationStarted) {
              setCheckoutError(
                "Payment was cancelled. Your VPS order has not been marked as paid.",
              );
            }
            setCheckoutLoading(false);
          },
        },
      });

      razorpay.open();
    } catch (err: any) {
      setCheckoutError(
        err.response?.data?.message ||
          err.message ||
          "Failed to complete checkout. Please try again.",
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const activeCount = vpsList.filter((v) => v.status === "RUNNING").length;
  const currentWalletBalance = Number(wallet?.balance ?? 0);
  const currentCheckoutPrice = useMemo(() => {
    if (!selectedPlan) return 0;
    if (selectedPlan.billingOptions && selectedPlan.billingOptions.length > 0) {
      const match = selectedPlan.billingOptions.find((o) => o.months === selectedMonths);
      if (match) return Number(match.customerPrice);
    }
    const baseMonthly = Number(selectedPlan.price ?? 0);
    return Math.round(baseMonthly * (selectedMonths || 1) * 100) / 100;
  }, [selectedPlan, selectedMonths]);
  const selectedPlanPrice = currentCheckoutPrice;
  const hasSufficientBalance = currentWalletBalance >= currentCheckoutPrice;

  const visiblePlans = useMemo(() => {
    const isWindowsOS = (os: string) => /windows|win server/i.test(os);
    const isLinuxOS = (os: string) =>
      /linux|ubuntu|debian|centos|rocky|alma|fedora|alpine|opensuse/i.test(os);

    let list = plans.filter((plan) => {
      const productType = String(plan.productType ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

      const supportedOS = Array.isArray(plan.supportedOS)
        ? plan.supportedOS.map((os) => String(os).trim())
        : [];

      const hasWindowsOS = supportedOS.some(isWindowsOS);
      const hasLinuxOS = supportedOS.some(isLinuxOS);
      const hasOSList = supportedOS.length > 0;

      if (page === "Windows VPS") {
        return (
          (productType === "VPS_HOSTING" ||
            productType === "VPS" ||
            productType === "WINDOWS_VPS" ||
            (hasWindowsOS && !hasOSList)) &&
          (!hasOSList || hasWindowsOS)
        );
      }

      if (page === "Linux VPS") {
        return (
          productType === "LINUX_IP_VPS" ||
          productType === "LINUX" ||
          productType === "LINUX_VPS" ||
          (hasLinuxOS && !hasWindowsOS)
        );
      }

      return true;
    });

    // 1. Filter by RAM pill
    if (selectedRamFilter !== "ALL") {
      if (selectedRamFilter === 16) {
        list = list.filter((p) => Number(p.ramGb ?? 0) >= 16);
      } else {
        list = list.filter((p) => Number(p.ramGb ?? 0) === selectedRamFilter);
      }
    }

    // 2. Filter by CPU pill
    if (selectedCpuFilter !== "ALL") {
      if (selectedCpuFilter === 8) {
        list = list.filter((p) => Number(p.cpuCores ?? 0) >= 8);
      } else {
        list = list.filter((p) => Number(p.cpuCores ?? 0) === selectedCpuFilter);
      }
    }

    // 3. Smart Search query
    const q = planSearch.trim().toLowerCase();
    if (q) {
      // Extract RAM if mentioned (e.g. '2gb', '2 gb', '2gb ram', '2 gb ram', '2g ram', '2 ram')
      const ramMatch =
        q.match(/(\d+)\s*(?:gb|g)\b(?:\s*ram)?/i) || q.match(/(\d+)\s*ram\b/i);
      const explicitRam = ramMatch ? parseInt(ramMatch[1], 10) : null;

      // Extract CPU if mentioned (e.g. '2 vcpu', '2vcpu', '2 cpu', '2 cores', '2 core')
      const cpuMatch = q.match(/(\d+)\s*(?:vcpu|cpu|cores?)\b/i);
      const explicitCpu = cpuMatch ? parseInt(cpuMatch[1], 10) : null;

      // Remaining clean keywords
      let cleanKeywords = q;
      if (ramMatch) cleanKeywords = cleanKeywords.replace(ramMatch[0], " ");
      if (cpuMatch) cleanKeywords = cleanKeywords.replace(cpuMatch[0], " ");
      cleanKeywords = cleanKeywords
        .replace(/\b(vps|server|cloud|plans?)\b/gi, " ")
        .trim();

      list = list.filter((p) => {
        const pName = (p.name || "").toLowerCase();
        const pDesc = (p.description || "").toLowerCase();
        const pLoc = (p.location || "").toLowerCase();
        const pTier = (p.tier || "").toLowerCase();
        const pRam = Number(p.ramGb || 0);
        const pCpu = Number(p.cpuCores || 0);
        const pStorage = `${p.storageGb || ""}gb nvme ssd`.toLowerCase();
        const pPrice = String(p.price || "");

        // If explicit RAM searched, must match plan RAM
        if (explicitRam !== null && pRam !== explicitRam) {
          if (
            !pName.includes(`${explicitRam} gb`) &&
            !pName.includes(`${explicitRam}gb`)
          ) {
            return false;
          }
        }

        // If explicit CPU searched, must match plan CPU
        if (explicitCpu !== null && pCpu !== explicitCpu) {
          if (
            !pName.includes(`${explicitCpu} vcpu`) &&
            !pName.includes(`${explicitCpu}vcpu`)
          ) {
            return false;
          }
        }

        // Remaining keywords matching
        if (cleanKeywords) {
          const words = cleanKeywords.split(/\s+/).filter(Boolean);
          return words.every(
            (w) =>
              pName.includes(w) ||
              pDesc.includes(w) ||
              pLoc.includes(w) ||
              pTier.includes(w) ||
              pStorage.includes(w) ||
              pPrice.includes(w) ||
              `${pRam}gb`.includes(w) ||
              `${pCpu}vcpu`.includes(w),
          );
        }

        return true;
      });
    }

    // 4. Sorting
    if (selectedSort === "PRICE_ASC") {
      list = [...list].sort((a, b) => Number(a.price) - Number(b.price));
    } else if (selectedSort === "PRICE_DESC") {
      list = [...list].sort((a, b) => Number(b.price) - Number(a.price));
    } else if (selectedSort === "RAM_ASC") {
      list = [...list].sort((a, b) => Number(a.ramGb || 0) - Number(b.ramGb || 0));
    } else if (selectedSort === "RAM_DESC") {
      list = [...list].sort((a, b) => Number(b.ramGb || 0) - Number(a.ramGb || 0));
    }

    return list;
  }, [
    plans,
    page,
    planSearch,
    selectedRamFilter,
    selectedCpuFilter,
    selectedSort,
  ]);

  const PlanCard = ({ plan, index }: { plan: VPSPlan; index: number }) => {
    const availableOS = plan.supportedOS || [];
    const isFeatured = index === 1;
    return (
      <article
        className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-[#201d1a] p-6 shadow-xl transition duration-200 hover:-translate-y-1 ${
          isFeatured
            ? "border-[#C6A66B] shadow-2xl shadow-[#C6A66B]/15 scale-[1.02] z-10"
            : "border-[#332f2a] hover:border-[#C6A66B]/60"
        }`}
      >
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#C6A66B]/20 via-[#C6A66B] to-[#C6A66B]/20" />
        {isFeatured && (
          <span className="absolute right-4 top-4 rounded-full bg-[#C6A66B] px-3 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#171717]">
            Recommended
          </span>
        )}
        <div>
          <div className="flex items-start justify-between gap-3 pr-16">
            <div className="flex items-center gap-2 text-[#C6A66B]">
              <Monitor size={17} />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#C6A66B]">
                {plan.productType === "LINUX_IP_VPS"
                  ? "Dedicated IP"
                  : "Cloud VPS"}
              </span>
            </div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
              In Stock
            </span>
          </div>

          <h3 className="mt-4 min-h-12 font-serif text-xl font-bold leading-snug text-[#F1E9DA]">
            {plan.name}
          </h3>
          {plan.description && (
            <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-[#F1E9DA]/60">
              {plan.description}
            </p>
          )}

          <div className="mt-5 space-y-2.5 border-y border-[#332f2a] py-4 font-mono text-xs text-[#F1E9DA]/80">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[#F1E9DA]/50">
                <Cpu size={14} className="text-[#C6A66B]" /> CPU Cores
              </span>
              <span className="font-bold text-[#F1E9DA]">
                {plan.cpuCores ?? "—"} vCPU
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[#F1E9DA]/50">
                <Zap size={14} className="text-[#C6A66B]" /> Memory
              </span>
              <span className="font-bold text-[#F1E9DA]">
                {plan.ramGb ?? "—"} GB RAM
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[#F1E9DA]/50">
                <HardDrive size={14} className="text-[#C6A66B]" /> Storage
              </span>
              <span className="font-bold text-[#F1E9DA]">
                {plan.storageGb ?? "—"} GB NVMe
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[#F1E9DA]/50">
                <ArrowUpRight size={14} className="text-[#C6A66B]" /> Bandwidth
              </span>
              <span className="font-bold text-[#F1E9DA]">
                {plan.bandwidthGb ?? "—"} GB
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[#F1E9DA]/50">
                <Globe size={14} className="text-[#C6A66B]" /> Datacenter
              </span>
              <span className="font-bold text-[#F1E9DA]">
                {plan.location || "Location information unavailable"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {availableOS.slice(0, 3).map((os) => (
              <span
                key={os}
                className="rounded border border-[#332f2a] bg-[#171717] px-2 py-0.5 font-mono text-[10px] text-[#C6A66B]"
              >
                {os}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-[#332f2a] pt-4 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#F1E9DA]/50">
              Customer Price
            </p>
            <p className="mt-1 font-serif text-2xl font-bold text-[#F1E9DA]">
              {formatDecimal(plan.monthlyPrice ?? plan.price, plan.currency || "INR")}
              <span className="ml-1 text-xs font-sans font-normal text-[#F1E9DA]/60">
                /mo
              </span>
            </p>
          </div>
          <button
            onClick={() => openCheckout(plan)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C6A66B] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/15 transition hover:bg-[#d8ba82]"
          >
            Deploy <ArrowRight size={14} />
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#171717] font-sans text-[#F1E9DA] selection:bg-[#C6A66B]/30 selection:text-[#F1E9DA]">
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(ellipse_at_50%_-15%,rgba(198,166,107,.08),transparent_50%),radial-gradient(ellipse_at_100%_60%,rgba(198,166,107,.04),transparent_40%)]" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-[#292521] bg-[#171717]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <button
            onClick={() => go("Home")}
            className="flex items-center gap-3 text-left group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#C6A66B]/40 bg-[#292521] p-1 shadow-md transition group-hover:border-[#C6A66B]">
              <img
                src={logo}
                alt="24/7"
                className="h-full w-full rounded-full object-contain"
              />
            </div>
            <span>
              <span className="block font-serif text-lg font-bold tracking-tight text-[#F1E9DA] transition group-hover:text-[#C6A66B]">
                24/7 <span className="text-[#C6A66B]">CLOUD</span>
              </span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-[#C6A66B]">
                ENTERPRISE CONSOLE
              </span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 lg:flex">
            {navItems
              .filter(
                (item) => item.label !== "Dedicated IP" || dedicatedIpEnabled,
              )
              .map((item) => (
                <button
                  key={item.label}
                  onClick={() => go(item.label)}
                  className={`rounded-full px-3.5 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition ${
                    page === item.label
                      ? "bg-[#C6A66B] text-[#171717] shadow-md shadow-[#C6A66B]/15"
                      : "text-[#F1E9DA]/70 hover:bg-[#201d1a] hover:text-[#F1E9DA]"
                  }`}
                >
                  {item.short}
                </button>
              ))}
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            {/* Quick Wallet pill in header */}
            <button
              onClick={() => go("Wallet")}
              className="flex items-center gap-2 rounded-full border border-[#C6A66B]/30 bg-[#201d1a] px-3.5 py-1.5 text-xs transition hover:border-[#C6A66B]"
              title="View wallet balance and history"
            >
              <Wallet size={14} className="text-[#C6A66B]" />
              <span className="font-mono font-bold text-[#F1E9DA]">
                {formatDecimal(currentWalletBalance)}
              </span>
            </button>

            <div className="text-right">
              <p className="text-xs font-bold text-[#F1E9DA]">
                {profile?.name || "My Account"}
              </p>
              <p className="max-w-40 truncate font-mono text-[10px] text-[#F1E9DA]/50">
                {profile?.email || ""}
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded-full border border-[#332f2a] bg-[#171717] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80 transition hover:border-[#C6A66B] hover:text-[#C6A66B]"
            >
              Logout
            </button>
          </div>

          <button
            onClick={() => setMobileMenu((v) => !v)}
            className="rounded-lg border border-[#292521] p-2 text-[#F1E9DA] transition hover:bg-[#292521] lg:hidden"
            aria-label="Toggle navigation"
          >
            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileMenu && (
          <nav className="grid grid-cols-2 gap-2 border-t border-[#292521] bg-[#201d1a] px-4 py-3 sm:grid-cols-3 lg:hidden">
            {navItems
              .filter(
                (item) => item.label !== "Dedicated IP" || dedicatedIpEnabled,
              )
              .map((item) => (
                <button
                  key={item.label}
                  onClick={() => go(item.label)}
                  className={`rounded-lg px-3 py-3 text-left font-mono text-xs font-bold uppercase tracking-wider ${
                    page === item.label
                      ? "bg-[#C6A66B] text-[#171717]"
                      : "bg-[#171717] text-[#F1E9DA]/70"
                  }`}
                >
                  {item.short}
                </button>
              ))}
            <button
              onClick={logout}
              className="rounded-lg bg-red-500/10 px-3 py-3 text-left font-mono text-xs font-bold uppercase tracking-wider text-red-300"
            >
              Logout
            </button>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-[1440px] px-4 pb-16 sm:px-6 lg:px-10">
        {notice && (
          <div className="mt-5 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
              <span>{notice}</span>
            </div>
            <button
              onClick={() => setNotice("")}
              className="text-emerald-400 hover:text-emerald-200"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError("")}
              className="text-red-400 hover:text-red-200"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Home / Catalogue */}
        {(page === "Home" ||
          page === "Windows VPS" ||
          page === "Linux VPS") && (
          <>
            {page === "Home" && (
              <section className="relative mt-7 overflow-hidden rounded-2xl border border-[#C6A66B]/30 bg-[#201d1a] px-6 py-12 text-center shadow-2xl sm:mt-9 sm:px-12 sm:py-16">
                <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-[#C6A66B]/5 blur-3xl" />
                <div className="pointer-events-none absolute -right-12 bottom-0 h-72 w-72 rounded-full bg-[#C6A66B]/5 blur-3xl" />
                <div className="relative mx-auto max-w-3xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#C6A66B]/30 bg-[#292521] px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
                    <Zap size={13} /> High-Performance Cloud Console
                  </span>
                  <h1 className="mt-5 font-serif text-3xl font-bold tracking-tight text-[#F1E9DA] sm:text-5xl">
                    Enterprise VPS Infrastructure
                  </h1>
                  <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#F1E9DA]/75 sm:text-base">
                    Deploy, scale, and monitor mission-critical virtual nodes with verified enterprise hardware and instant automated management.
                  </p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <button
                      onClick={() => go("Windows VPS")}
                      className="rounded-lg bg-[#C6A66B] px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-[#171717] shadow-xl shadow-[#C6A66B]/20 transition hover:bg-[#d8ba82]"
                    >
                      Deploy Windows VPS <ArrowRight className="ml-1.5 inline" size={15} />
                    </button>
                    <button
                      onClick={() => go("Linux VPS")}
                      className="rounded-lg border border-[#332f2a] bg-[#171717] px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-[#F1E9DA] transition hover:border-[#C6A66B] hover:text-[#C6A66B]"
                    >
                      Deploy Linux VPS
                    </button>
                    <button
                      onClick={() => go("My VPS")}
                      className="rounded-lg border border-[#332f2a] bg-[#171717] px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-[#F1E9DA] transition hover:border-[#C6A66B] hover:text-[#C6A66B]"
                    >
                      My Servers ({vpsList.length})
                    </button>
                  </div>
                  <div className="mt-10 grid grid-cols-2 gap-5 border-t border-[#332f2a] pt-7 sm:grid-cols-4 font-mono">
                    <div>
                      <p className="font-serif text-2xl font-bold text-[#C6A66B]">{activeCount}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-[#F1E9DA]/60">
                        Active Instances
                      </p>
                    </div>
                    <div>
                      <p className="font-serif text-2xl font-bold text-[#F1E9DA]">NVMe</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-[#F1E9DA]/60">
                        Solid-State Arrays
                      </p>
                    </div>
                    <div>
                      <p className="font-serif text-2xl font-bold text-[#F1E9DA]">24/7</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-[#F1E9DA]/60">
                        Support Desk
                      </p>
                    </div>
                    <div>
                      <p className="font-serif text-2xl font-bold text-[#C6A66B]">{formatDecimal(currentWalletBalance)}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-[#F1E9DA]/60">
                        Wallet Balance
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="pt-12 sm:pt-14">
              <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
                    AVAILABLE CLOUD CATALOGUE
                  </p>
                  <h2 className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">
                    {page === "Home"
                      ? "Explore Available Cloud Plans"
                      : page === "Windows VPS"
                        ? "Windows Cloud VPS Plans"
                        : "Linux Cloud VPS Plans"}
                  </h2>
                  <p className="mt-2 text-sm text-[#F1E9DA]/70">
                    High-performance virtual nodes powered by enterprise NVMe storage and dedicated support.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => go("Windows VPS")}
                    className={`rounded-lg border px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${
                      page === "Windows VPS"
                        ? "border-[#C6A66B] bg-[#C6A66B] text-[#171717]"
                        : "border-[#332f2a] bg-[#201d1a] text-[#F1E9DA]/70 hover:border-[#C6A66B]/50"
                    }`}
                  >
                    Windows
                  </button>
                  <button
                    onClick={() => go("Linux VPS")}
                    className={`rounded-lg border px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${
                      page === "Linux VPS"
                        ? "border-[#C6A66B] bg-[#C6A66B] text-[#171717]"
                        : "border-[#332f2a] bg-[#201d1a] text-[#F1E9DA]/70 hover:border-[#C6A66B]/50"
                    }`}
                  >
                    Linux
                  </button>
                </div>
              </div>

              {/* Plan Search & Filter Bar */}
              <div className="mb-8 space-y-3.5 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-4 sm:p-5 shadow-xl">
                {/* Search Input & Sort Row */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#F1E9DA]/40"
                    />
                    <input
                      type="text"
                      value={planSearch}
                      onChange={(e) => setPlanSearch(e.target.value)}
                      placeholder="Search by RAM (e.g. 2GB, 4GB, 8GB), vCPU, location, plan name..."
                      className="w-full rounded-xl border border-[#332f2a] bg-[#171717] py-2.5 pl-10 pr-10 font-mono text-xs text-[#F1E9DA] placeholder:text-[#F1E9DA]/35 transition focus:border-[#C6A66B] focus:outline-none focus:ring-1 focus:ring-[#C6A66B]/30"
                    />
                    {planSearch && (
                      <button
                        onClick={() => setPlanSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#F1E9DA]/40 hover:text-[#F1E9DA] transition"
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Sort Dropdown & Reset */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex items-center">
                      <ArrowUpDown
                        size={14}
                        className="pointer-events-none absolute left-3 text-[#C6A66B]"
                      />
                      <select
                        value={selectedSort}
                        onChange={(e: any) => setSelectedSort(e.target.value)}
                        className="rounded-xl border border-[#332f2a] bg-[#171717] py-2.5 pl-9 pr-8 font-mono text-xs text-[#F1E9DA] transition focus:border-[#C6A66B] focus:outline-none"
                      >
                        <option value="DEFAULT">Sort: Recommended</option>
                        <option value="PRICE_ASC">Price: Low to High</option>
                        <option value="PRICE_DESC">Price: High to Low</option>
                        <option value="RAM_ASC">RAM: Low to High</option>
                        <option value="RAM_DESC">RAM: High to Low</option>
                      </select>
                    </div>

                    {(planSearch ||
                      selectedRamFilter !== "ALL" ||
                      selectedCpuFilter !== "ALL" ||
                      selectedSort !== "DEFAULT") && (
                      <button
                        onClick={() => {
                          setPlanSearch("");
                          setSelectedRamFilter("ALL");
                          setSelectedCpuFilter("ALL");
                          setSelectedSort("DEFAULT");
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-2.5 font-mono text-xs font-semibold text-red-400 hover:bg-red-900/30 transition"
                        title="Reset all filters"
                      >
                        <X size={13} />
                        <span className="hidden sm:inline">Reset</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Pills Row */}
                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t border-[#332f2a]/60">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50 flex items-center gap-1 mr-1">
                      <Layers size={12} className="text-[#C6A66B]" /> RAM:
                    </span>
                    {(["ALL", 1, 2, 4, 8, 16] as const).map((ram) => (
                      <button
                        key={ram}
                        onClick={() => setSelectedRamFilter(ram)}
                        className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                          selectedRamFilter === ram
                            ? "border-[#C6A66B] bg-[#C6A66B] text-[#171717] shadow-sm shadow-[#C6A66B]/20"
                            : "border-[#332f2a] bg-[#171717] text-[#F1E9DA]/70 hover:border-[#C6A66B]/40 hover:text-[#F1E9DA]"
                        }`}
                      >
                        {ram === "ALL" ? "All RAM" : `${ram} GB`}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50 flex items-center gap-1 mr-1">
                      <Cpu size={12} className="text-[#C6A66B]" /> vCPU:
                    </span>
                    {(["ALL", 1, 2, 4, 8] as const).map((cpu) => (
                      <button
                        key={cpu}
                        onClick={() => setSelectedCpuFilter(cpu)}
                        className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                          selectedCpuFilter === cpu
                            ? "border-[#C6A66B] bg-[#C6A66B] text-[#171717] shadow-sm shadow-[#C6A66B]/20"
                            : "border-[#332f2a] bg-[#171717] text-[#F1E9DA]/70 hover:border-[#C6A66B]/40 hover:text-[#F1E9DA]"
                        }`}
                      >
                        {cpu === "ALL" ? "All CPUs" : `${cpu} vCPU`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Filter Result Info Bar */}
                <div className="flex items-center justify-between font-mono text-[11px] text-[#F1E9DA]/50 pt-0.5">
                  <p>
                    Showing{" "}
                    <span className="font-bold text-[#C6A66B]">
                      {visiblePlans.length}
                    </span>{" "}
                    {page === "Windows VPS"
                      ? "Windows"
                      : page === "Linux VPS"
                        ? "Linux"
                        : "Cloud"}{" "}
                    VPS {visiblePlans.length === 1 ? "plan" : "plans"}
                    {planSearch && (
                      <span>
                        {" "}
                        matching &ldquo;
                        <span className="text-[#F1E9DA]">{planSearch}</span>
                        &rdquo;
                      </span>
                    )}
                  </p>
                  {(selectedRamFilter !== "ALL" ||
                    selectedCpuFilter !== "ALL" ||
                    planSearch) && (
                    <span className="text-emerald-400 font-semibold">
                      ● Active Filters
                    </span>
                  )}
                </div>
              </div>

              {plansLoading ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-[390px] animate-pulse rounded-2xl border border-[#332f2a] bg-[#201d1a]"
                    />
                  ))}
                </div>
              ) : visiblePlans.length ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {visiblePlans.map((plan, index) => (
                    <PlanCard key={plan.id} plan={plan} index={index} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] px-6 py-12 text-center text-[#F1E9DA]">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#C6A66B]/20 bg-[#171717] text-[#C6A66B]">
                    <Search size={26} />
                  </div>
                  <h3 className="mt-4 font-serif text-lg font-bold">
                    No VPS plans match your criteria
                  </h3>
                  <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-[#F1E9DA]/60">
                    {planSearch ||
                    selectedRamFilter !== "ALL" ||
                    selectedCpuFilter !== "ALL"
                      ? `No plans found matching "${
                          planSearch ||
                          (selectedRamFilter !== "ALL"
                            ? `${selectedRamFilter} GB RAM`
                            : `${selectedCpuFilter} vCPU`)
                        }". Try selecting a different RAM / vCPU size or clear your search.`
                      : plansError ||
                        "Our team is updating the available server plans. Please check again shortly."}
                  </p>
                  {planSearch ||
                  selectedRamFilter !== "ALL" ||
                  selectedCpuFilter !== "ALL" ||
                  selectedSort !== "DEFAULT" ? (
                    <button
                      onClick={() => {
                        setPlanSearch("");
                        setSelectedRamFilter("ALL");
                        setSelectedCpuFilter("ALL");
                        setSelectedSort("DEFAULT");
                      }}
                      className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#C6A66B] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82]"
                    >
                      <X size={14} /> Clear all filters
                    </button>
                  ) : (
                    <button
                      onClick={fetchPlans}
                      className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#C6A66B] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82]"
                    >
                      <RefreshCw size={14} /> Refresh plans
                    </button>
                  )}
                </div>
              )}
            </section>

            {page === "Home" && (
              <section className="mt-12 rounded-2xl border border-[#C6A66B]/25 bg-[#201d1a] p-6 sm:p-8">
                <div className="text-center">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
                    SMART VPS HOSTING
                  </p>
                  <h2 className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">
                    SmartVPS Plans
                  </h2>
                  <p className="mt-2 text-sm text-[#F1E9DA]/60">
                    Separate RAM-based catalogue with live availability.
                  </p>
                </div>

                {smartVpsLoading ? (
                  <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="h-52 animate-pulse rounded-xl border border-[#332f2a] bg-[#171717]" />
                    ))}
                  </div>
                ) : smartVpsPlans.length > 0 ? (
                  <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {smartVpsPlans.map((plan) => (
                      <div key={plan.ramGb} className="rounded-xl border border-[#332f2a] bg-[#171717] p-5">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#C6A66B]">
                          SMART VPS
                        </p>
                        <h3 className="mt-2 font-serif text-xl font-bold text-[#F1E9DA]">
                          {plan.ramGb} GB RAM
                        </h3>
                        <p className="mt-4 text-2xl font-bold text-[#C6A66B]">
                          {formatDecimal(plan.monthlyPrice ?? plan.price, plan.currency)}
                          <span className="ml-1 text-xs font-normal text-[#F1E9DA]/45">/ month</span>
                        </p>
                        <p className="mt-4 text-sm text-emerald-400">
                          {plan.availableCount} available
                        </p>
                        <p className="mt-1 text-xs text-[#F1E9DA]/40">
                          Live availability
                        </p>
                        <div className="mt-5 rounded-lg border border-[#C6A66B]/20 px-3 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-wider text-[#C6A66B]">
                          Online ordering coming soon
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-7 text-center text-sm text-[#F1E9DA]/50">
                    SmartVPS plans are currently unavailable. Please check again later.
                  </p>
                )}
                <p className="mt-6 text-center font-mono text-[10px] text-[#F1E9DA]/35">
                  Plans and availability are refreshed from live inventory.
                </p>
              </section>
            )}

          </>
        )}

        {/* Dedicated IP Catalogue */}
        {page === "Dedicated IP" && <BuyLinuxIP embedded />}

        {/* My Servers */}
        {page === "My VPS" && (
          selectedVpsId ? (
            <VpsDetail
              vps={vpsList.find((vps) => vps.id === selectedVpsId) || null}
              loading={loading}
              onBack={() => go("My VPS")}
              onRefresh={fetchVps}
              onRenew={openRenewalModal}
            />
          ) : (
          <section className="pt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#C6A66B]">
                  Customer area
                </p>
                <h1 className="mt-2 font-serif text-3xl font-bold text-[#F1E9DA]">My Servers</h1>
                <p className="mt-2 text-sm text-[#F1E9DA]/60">
                  Manage your VPS instances and server status.
                </p>
              </div>
              <button
                onClick={fetchVps}
                className="inline-flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-3 text-xs font-bold text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521]"
              >
                <RefreshCw size={15} /> Refresh
              </button>
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
                <p className="text-xs text-[#F1E9DA]/50 uppercase tracking-wider font-mono">Total servers</p>
                <p className="mt-2 font-serif text-3xl font-bold text-[#F1E9DA]">{vpsList.length}</p>
              </div>
              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
                <p className="text-xs text-[#F1E9DA]/50 uppercase tracking-wider font-mono">Running</p>
                <p className="mt-2 font-serif text-3xl font-bold text-emerald-400">
                  {activeCount}
                </p>
              </div>
              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
                <p className="text-xs text-[#F1E9DA]/50 uppercase tracking-wider font-mono">Stopped / Other</p>
                <p className="mt-2 font-serif text-3xl font-bold text-[#F1E9DA]">
                  {vpsList.length - activeCount}
                </p>
              </div>
            </div>

            {loading ? (
              <p className="py-12 text-center text-sm text-[#F1E9DA]/60">
                Loading servers…
              </p>
            ) : vpsList.length ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {vpsList.map((vps) => (
                  <article
                    key={vps.id}
                    className="relative overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 sm:p-6 transition hover:border-[#C6A66B]/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-[#C6A66B]/20 bg-[#171717] p-3 text-[#C6A66B]">
                          <Server size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-[#F1E9DA]">
                              {vps.hostname || "VPS Server"}
                            </h3>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                vps.provider === "HOSTHEAVEN"
                                  ? "bg-[#C6A66B]/15 text-[#C6A66B] border border-[#C6A66B]/30"
                                  : "bg-[#292521] text-[#F1E9DA]/70 border border-[#332f2a]"
                              }`}
                            >
                              {vps.provider === "HOSTHEAVEN"
                                ? "HostHeaven"
                                : vps.provider || "SmartVPS"}
                            </span>
                          </div>
                          <p className="text-xs text-[#F1E9DA]/50">
                            {vps.providerVpsId ? `VM ID: ${vps.providerVpsId}` : vps.provider}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            vps.status === "RUNNING" || vps.status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : vps.status === "SUSPENDED"
                              ? "bg-red-500/20 text-red-300 border border-red-500/30"
                              : "bg-[#171717] text-[#F1E9DA]/60 border border-[#332f2a]"
                          }`}
                        >
                          {vps.status}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            vps.autoRenew && vps.autoRenewConsentAt
                              ? "bg-[#C6A66B]/15 text-[#C6A66B] border border-[#C6A66B]/30"
                              : "bg-[#171717] text-[#F1E9DA]/40 border border-[#332f2a]"
                          }`}
                        >
                          Auto-Renew: {vps.autoRenew && vps.autoRenewConsentAt ? "ON" : "OFF"}
                        </span>
                      </div>
                    </div>

                    {vps.status === "SUSPENDED" && (
                      <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                        <p className="font-bold flex items-center gap-1.5">
                          <AlertTriangle size={14} /> Server Suspended (Grace Period)
                        </p>
                        <p className="mt-1 text-[11px] text-red-200">
                          Grace period expires:{" "}
                          <strong>
                            {vps.gracePeriodExpiresAt
                              ? new Date(vps.gracePeriodExpiresAt).toLocaleDateString()
                              : "Soon"}
                          </strong>
                          . Renew now to avoid permanent deletion.
                        </p>
                      </div>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-4 border-y border-[#332f2a] py-4 text-sm">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/50 font-mono">IP ADDRESS</p>
                        <p className="mt-1 font-mono font-semibold text-[#C6A66B]">
                          {vps.ipAddress}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/50 font-mono">
                          OPERATING SYSTEM
                        </p>
                        <p className="mt-1 text-[#F1E9DA]">{vps.operatingSystem || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/50 font-mono">MEMORY</p>
                        <p className="mt-1 text-[#F1E9DA]">{vps.ram ?? "—"} GB RAM</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/50 font-mono">EXPIRES</p>
                        <p className="mt-1 text-[#F1E9DA]">
                          {vps.expiresAt
                            ? new Date(vps.expiresAt).toLocaleDateString()
                            : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        disabled={actionLoading === vps.id}
                        onClick={() =>
                          handleVpsAction(
                            vps.id,
                            vps.status === "RUNNING" ? "stop" : "start",
                          )
                        }
                        className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold disabled:opacity-50 ${
                          vps.status === "RUNNING"
                            ? "bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20"
                            : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30"
                        }`}
                      >
                        {actionLoading === vps.id ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Zap size={14} />
                        )}
                        {vps.status === "RUNNING" ? "Stop Server" : "Start Server"}
                      </button>

                      <button
                        onClick={() => openVpsDashboard(vps)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-[#C6A66B]/30 bg-[#171717] px-3 py-2.5 text-xs font-bold text-[#C6A66B] hover:bg-[#292521] transition"
                      >
                        <Activity size={14} /> Manage & Metrics
                      </button>

                      <button
                        onClick={() => openRenewalModal(vps.id)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-[#332f2a] bg-[#171717] px-3 py-2.5 text-xs font-bold text-[#F1E9DA] hover:border-[#C6A66B]/40 hover:bg-[#292521] transition"
                      >
                        <RefreshCw size={14} /> Auto-Renew
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-7 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-12 text-center text-[#F1E9DA]">
                <Server className="mx-auto text-[#C6A66B]" size={34} />
                <h3 className="mt-4 font-serif text-lg font-bold">No VPS servers yet</h3>
                <p className="mt-2 text-sm text-[#F1E9DA]/60">
                  Choose a plan to get your first server.
                </p>
                <button
                  onClick={() => go("Windows VPS")}
                  className="mt-5 rounded-xl bg-[#C6A66B] px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82] transition"
                >
                  Browse VPS Plans
                </button>
              </div>
            )}
          </section>
          )
        )}


        {/* Wallet Page */}
        {page === "Wallet" && (
          <section className="mx-auto max-w-4xl pt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#C6A66B]">
                  Billing & Balance
                </p>
                <h1 className="mt-2 font-serif text-3xl font-bold text-[#F1E9DA]">My Wallet</h1>
                <p className="mt-2 text-sm text-[#F1E9DA]/60">
                  Manage your prepaid balance for instant VPS deployments and
                  auto-renewals.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    void fetchWallet();
                    void fetchTransactions();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-3 text-xs font-bold text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521]"
                >
                  <RefreshCw
                    size={15}
                    className={walletLoading ? "animate-spin" : ""}
                  />{" "}
                  Refresh
                </button>
                <button
                  onClick={() => setShowTopupModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/10 transition hover:bg-[#d8ba82]"
                >
                  <Plus size={16} /> Add Funds
                </button>
              </div>
            </div>

            {/* Balance Card */}
            <div className="relative mt-7 overflow-hidden rounded-3xl border border-[#C6A66B]/30 bg-[#201d1a] p-7 shadow-2xl sm:p-9">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#C6A66B] to-transparent" />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-[#C6A66B]/20 bg-[#171717] p-3.5 text-[#C6A66B]">
                    <Wallet size={32} />
                  </div>
                  <div>
                    <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B]">
                      Available Balance
                    </p>
                    <p className="mt-1 font-serif text-4xl font-bold tracking-tight text-[#F1E9DA] sm:text-5xl">
                      {formatDecimal(currentWalletBalance)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-full border border-[#C6A66B]/30 bg-[#171717] px-3 py-1 font-mono text-xs font-bold text-[#C6A66B]">
                    Currency: INR (₹)
                  </span>
                  <span className="font-mono text-[11px] text-[#F1E9DA]/50">
                    Account ID: {profile?.id?.slice(0, 8) || "—"}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#332f2a] pt-5 text-xs text-[#F1E9DA]/70">
                <p>
                  Use your wallet balance to instantly provision VPS servers
                  without per-order payment gateway delays.
                </p>
                <button
                  onClick={() => setShowTopupModal(true)}
                  className="inline-flex items-center gap-1.5 font-bold text-[#C6A66B] underline decoration-[#C6A66B]/50 hover:text-[#d8ba82]"
                >
                  Top-up ₹500, ₹1000 or custom amount <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {/* Transaction History */}
            <div className="mt-10">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-[#F1E9DA]">
                  <History size={18} className="text-[#C6A66B]" />
                  Transaction History
                </h3>
                <span className="font-mono text-xs text-[#F1E9DA]/50">
                  {transactions.length} record
                  {transactions.length === 1 ? "" : "s"}
                </span>
              </div>

              {transactions.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[10px] font-bold uppercase tracking-wider text-[#C6A66B]">
                        <tr>
                          <th className="px-5 py-3.5">Date & Time</th>
                          <th className="px-5 py-3.5">Type</th>
                          <th className="px-5 py-3.5">Description</th>
                          <th className="px-5 py-3.5">Reference</th>
                          <th className="px-5 py-3.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#332f2a]/60">
                        {transactions.map((tx) => {
                          const isCredit = tx.type === "CREDIT";
                          return (
                            <tr
                              key={tx.id}
                              className="transition hover:bg-[#292521]/40"
                            >
                              <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-[#F1E9DA]/60">
                                {new Date(tx.createdAt).toLocaleString(
                                  "en-IN",
                                  {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  },
                                )}
                              </td>
                              <td className="px-5 py-4">
                                <span
                                  className={`inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                                    isCredit
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                      : "bg-[#C6A66B]/10 text-[#C6A66B] border border-[#C6A66B]/20"
                                  }`}
                                >
                                  {tx.type}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-xs font-medium text-[#F1E9DA]">
                                {tx.description}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-[11px] font-mono text-[#F1E9DA]/50">
                                {tx.reference || "—"}
                              </td>
                              <td
                                className={`whitespace-nowrap px-5 py-4 text-right font-mono text-sm font-bold ${
                                  isCredit
                                    ? "text-emerald-400"
                                    : "text-[#F1E9DA]"
                                }`}
                              >
                                {isCredit ? "+" : "-"}
                                {formatDecimal(tx.amount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-10 text-center text-[#F1E9DA]">
                  <Wallet
                    className="mx-auto text-[#C6A66B]/50"
                    size={36}
                  />
                  <h4 className="mt-3 font-serif text-sm font-bold text-[#F1E9DA]">
                    No transactions yet
                  </h4>
                  <p className="mt-1 text-xs text-[#F1E9DA]/60">
                    Add funds to your wallet to get started with fast
                    deployments.
                  </p>
                  <button
                    onClick={() => setShowTopupModal(true)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[#C6A66B]/30 bg-[#171717] px-4 py-2 font-mono text-xs font-bold text-[#C6A66B] hover:bg-[#292521] transition"
                  >
                    <Plus size={14} /> Add First Deposit
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Orders Page */}
        {page === "Orders" && (
          <section className="pt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#C6A66B]">
                  Billing History
                </p>
                <h1 className="mt-2 font-serif text-3xl font-bold text-[#F1E9DA]">Orders & Invoices</h1>
                <p className="mt-2 text-sm text-[#F1E9DA]/60">
                  Review all your server purchases, renewal invoices and
                  provisioning statuses.
                </p>
              </div>
              <button
                onClick={fetchOrders}
                className="inline-flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-3 text-xs font-bold text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521]"
              >
                <RefreshCw
                  size={15}
                  className={ordersLoading ? "animate-spin" : ""}
                />{" "}
                Refresh
              </button>
            </div>

            {orders.length > 0 ? (
              <div className="mt-7 space-y-4">
                {orders.map((ord) => {
                  const isPaidOrActive =
                    ord.status === "ACTIVE" || ord.status === "PAID";
                  return (
                    <article
                      key={ord.id}
                      className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 sm:p-6 transition hover:border-[#C6A66B]/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#332f2a] pb-4">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-sm font-bold text-[#F1E9DA]">
                              {ord.orderNumber}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                                isPaidOrActive
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-amber-400/10 text-amber-300 border border-amber-400/20"
                              }`}
                            >
                              {ord.status}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-xs text-[#F1E9DA]/50">
                            Placed on{" "}
                            {new Date(ord.createdAt).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                            Total Paid
                          </p>
                          <p className="font-serif text-xl font-bold text-[#C6A66B]">
                            {formatDecimal(ord.amount, ord.currency)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                            Plan & Specs
                          </p>
                          <p className="mt-1 text-sm font-bold text-[#F1E9DA]">
                            {ord.planName}
                          </p>
                          <p className="text-xs text-[#F1E9DA]/60">
                            {ord.plan
                              ? `${ord.plan.cpuCores ?? "—"} vCPU · ${ord.plan.ramGb ?? "—"}GB RAM · ${ord.plan.storageGb ?? "—"}GB SSD`
                              : ord.operatingSystem}
                          </p>
                        </div>

                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                            OS / Environment
                          </p>
                          <p className="mt-1 text-sm text-[#F1E9DA]">
                            {ord.operatingSystem}
                          </p>
                        </div>

                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                            Server Status
                          </p>
                          {ord.vpsInstance ? (
                            <div className="mt-1">
                              <span className="font-mono text-xs font-semibold text-[#C6A66B]">
                                IP: {ord.vpsInstance.ipAddress}
                              </span>
                              <span className="ml-2 inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                                {ord.vpsInstance.status}
                              </span>
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-[#F1E9DA]/50">
                              {ord.status === "ACTIVE"
                                ? "Provisioned"
                                : "Awaiting assignment"}
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-7 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-12 text-center text-[#F1E9DA]">
                <CreditCard className="mx-auto text-[#C6A66B]" size={34} />
                <h3 className="mt-4 font-serif text-lg font-bold">No orders yet</h3>
                <p className="mt-2 text-sm text-[#F1E9DA]/60">
                  Deploy your first VPS cloud server from our available plans.
                </p>
                <button
                  onClick={() => go("Windows VPS")}
                  className="mt-5 rounded-xl bg-[#C6A66B] px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82] transition"
                >
                  Browse VPS Plans
                </button>
              </div>
            )}
          </section>
        )}

        {/* Checkout Page */}
        {page === "Checkout" && (
          <section className="mx-auto max-w-2xl pt-10">
            <div className="flex items-center justify-between border-b border-[#332f2a] pb-5">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#C6A66B]">
                  Instant Cloud Deployment
                </p>
                <h1 className="mt-2 font-serif text-3xl font-bold text-[#F1E9DA]">VPS Checkout</h1>
                <p className="mt-1 text-sm text-[#F1E9DA]/60">
                  Configure server operating system and complete instant payment.
                </p>
              </div>
              <button
                type="button"
                onClick={() => go("Windows VPS")}
                className="rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-2.5 font-mono text-xs font-bold text-[#F1E9DA]/80 hover:border-[#C6A66B] hover:text-[#C6A66B] transition"
              >
                ← Back to Plans
              </button>
            </div>

            {checkoutError && (
              <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                {checkoutError}
              </div>
            )}

            {selectedPlan ? (
              <div className="mt-7 space-y-6">
                {/* Plan Card with switcher */}
                <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                        Selected Plan
                      </p>
                      <h3 className="mt-1 font-serif text-xl font-bold text-[#F1E9DA]">
                        {selectedPlan.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#C6A66B]">
                          {formatDecimal(selectedPlan.price, selectedPlan.currency || "INR")}/month
                        </span>
                        {selectedPlan.isHostHeaven && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#C6A66B]">
                            <Zap size={11} /> HostHeaven Direct Cloud
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedPlan.id}
                        onChange={(e) => {
                          const p = plans.find((pl) => pl.id === e.target.value);
                          if (p) {
                            setSelectedPlan(p);
                            setSelectedOS(p.supportedOS?.[0] || "Ubuntu 22.04");
                            if (p.providerConfig?.zoneId) {
                              setSelectedZoneId(p.providerConfig.zoneId);
                            }
                          }
                        }}
                        className="rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 text-xs font-semibold text-[#F1E9DA] outline-none focus:border-[#C6A66B]"
                      >
                        {plans.map((pl) => (
                          <option key={pl.id} value={pl.id}>
                            {pl.name} - {formatDecimal(pl.price)}/month
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#332f2a] pt-4 font-mono text-xs text-[#F1E9DA]/70 sm:grid-cols-4">
                    <span>{selectedPlan.cpuCores ?? "—"} vCPU</span>
                    <span>{selectedPlan.ramGb ?? "—"} GB RAM</span>
                    <span>{selectedPlan.storageGb ?? "—"} GB SSD</span>
                    <span>{selectedPlan.bandwidthGb ?? "—"} GB BW</span>
                  </div>
                </div>

                {/* Billing Duration Selector */}
                <div>
                  <label className="mb-2 block font-mono text-xs font-bold text-[#F1E9DA]/80 uppercase tracking-wider">
                    Billing Duration
                  </label>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {[
                      { months: 1, label: "1 Month" },
                      { months: 3, label: "3 Months" },
                      { months: 6, label: "6 Months" },
                      { months: 12, label: "12 Months" },
                    ].map((opt) => {
                      const optionPrice =
                        selectedPlan.billingOptions?.find(
                          (b) => b.months === opt.months,
                        )?.customerPrice ??
                        Math.round(Number(selectedPlan.price) * opt.months * 100) / 100;
                      const isSelected = selectedMonths === opt.months;
                      return (
                        <button
                          key={opt.months}
                          type="button"
                          onClick={() => setSelectedMonths(opt.months)}
                          className={`rounded-xl border p-3 text-left transition ${
                            isSelected
                              ? "border-[#C6A66B] bg-[#C6A66B]/10 text-[#F1E9DA]"
                              : "border-[#332f2a] bg-[#171717] text-[#F1E9DA]/70 hover:border-[#C6A66B]/40"
                          }`}
                        >
                          <p className="text-xs font-bold">{opt.label}</p>
                          <p className="mt-1 font-mono text-[11px] font-semibold text-[#C6A66B]">
                            {formatDecimal(optionPrice)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Zone & OS Selectors */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {hhZones.length > 0 && (
                    <div>
                      <label className="mb-2 flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                        <Globe size={14} className="text-[#C6A66B]" /> Deployment Zone
                      </label>
                      <select
                        value={selectedZoneId}
                        onChange={(e) => handleZoneChange(e.target.value)}
                        className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3.5 text-sm text-[#F1E9DA] outline-none focus:border-[#C6A66B]"
                      >
                        {hhZones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="mb-2 block font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                      Select Operating System
                    </label>
                    <select
                      value={selectedOS}
                      onChange={(e) => setSelectedOS(e.target.value)}
                      className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3.5 text-sm text-[#F1E9DA] outline-none focus:border-[#C6A66B]"
                    >
                      {(hhIsos.length > 0
                        ? hhIsos.map((iso) => iso.isoName)
                        : selectedPlan.supportedOS?.length
                        ? selectedPlan.supportedOS
                        : ["Ubuntu 22.04", "Windows Server 2022"]
                      ).map((os) => (
                        <option key={os} value={os}>
                          {os}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Hostname configuration */}
                <div>
                  <label className="mb-2 flex items-center justify-between font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                    <span>Server Hostname</span>
                    <span className="text-[10px] font-normal text-[#F1E9DA]/40">Optional</span>
                  </label>
                  <input
                    type="text"
                    value={customHostname}
                    onChange={(e) => setCustomHostname(e.target.value)}
                    placeholder="e.g. web01.myserver.com"
                    className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 outline-none focus:border-[#C6A66B]"
                  />
                </div>

                {/* Payment Method Selector */}
                <div>
                  <p className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                    Select Payment Method
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("WALLET")}
                      className={`rounded-xl border p-4 text-left transition ${
                        paymentMethod === "WALLET"
                          ? "border-[#C6A66B] bg-[#C6A66B]/10"
                          : "border-[#332f2a] bg-[#171717]"
                      }`}
                    >
                      <Wallet size={19} className="text-[#C6A66B]" />
                      <p className="mt-2 text-sm font-bold text-[#F1E9DA]">Wallet Pay</p>
                      <p className="mt-1 font-mono text-[10px] text-[#F1E9DA]/50">
                        Balance: {formatDecimal(currentWalletBalance)}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("RAZORPAY")}
                      className={`rounded-xl border p-4 text-left transition ${
                        paymentMethod === "RAZORPAY"
                          ? "border-[#C6A66B] bg-[#C6A66B]/10"
                          : "border-[#332f2a] bg-[#171717]"
                      }`}
                    >
                      <CreditCard size={19} className="text-[#C6A66B]" />
                      <p className="mt-2 text-sm font-bold text-[#F1E9DA]">Razorpay</p>
                      <p className="mt-1 text-[10px] text-[#F1E9DA]/50">
                        UPI · Cards · Netbanking
                      </p>
                    </button>
                  </div>
                </div>

                {/* Balance validation */}
                {paymentMethod === "WALLET" && (
                  <div className="rounded-xl border border-[#332f2a] bg-[#171717] p-3.5 text-xs">
                    {hasSufficientBalance ? (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 size={16} />
                        <span>
                          Sufficient balance available. Remaining after order:{" "}
                          <strong className="font-mono text-[#F1E9DA]">
                            {formatDecimal(
                              currentWalletBalance - currentCheckoutPrice,
                            )}
                          </strong>
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-amber-300">
                          <AlertCircle size={16} className="shrink-0" />
                          <span>
                            Insufficient balance. Need ₹
                            {(currentCheckoutPrice - currentWalletBalance).toFixed(2)} more.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setTopupAmount(
                              Math.max(
                                100,
                                Math.ceil(
                                  (currentCheckoutPrice - currentWalletBalance) /
                                    100,
                                ) * 100,
                              ),
                            );
                            setShowTopupModal(true);
                          }}
                          className="rounded-lg bg-[#C6A66B]/20 px-3 py-1.5 font-mono text-xs font-bold text-[#C6A66B] hover:bg-[#C6A66B]/30"
                        >
                          Add Funds
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Price Breakdown */}
                <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
                  <div className="flex items-center justify-between text-xs text-[#F1E9DA]/60">
                    <span>Monthly Base Rate</span>
                    <span className="font-mono">
                      {formatDecimal(
                        selectedPlan.price,
                        selectedPlan.currency || "INR",
                      )}
                      /month
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-[#F1E9DA]/60">
                    <span>Billing Duration</span>
                    <span className="font-semibold text-[#F1E9DA]">
                      {selectedMonths} Month{selectedMonths > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[#332f2a] pt-3">
                    <span className="text-sm font-bold text-[#F1E9DA]">Total Payable</span>
                    <span className="font-serif text-2xl font-bold text-[#C6A66B]">
                      {formatDecimal(
                        currentCheckoutPrice,
                        selectedPlan.currency || "INR",
                      )}
                    </span>
                  </div>
                </div>

                {/* Submit Button */}
                {paymentMethod === "WALLET" ? (
                  <button
                    disabled={checkoutLoading || !hasSufficientBalance}
                    onClick={handleCheckoutSubmit}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-4 font-mono text-sm font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/15 transition hover:bg-[#d8ba82] disabled:opacity-50"
                  >
                    {checkoutLoading ? (
                      <>
                        <RefreshCw size={17} className="animate-spin" /> Provisioning Server…
                      </>
                    ) : (
                      <>
                        <Wallet size={17} /> Pay{" "}
                        {formatDecimal(currentCheckoutPrice)} & Deploy Server
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    disabled={checkoutLoading}
                    onClick={handleCheckoutSubmit}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-4 font-mono text-sm font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/15 transition hover:bg-[#d8ba82] disabled:opacity-50"
                  >
                    {checkoutLoading ? (
                      <RefreshCw size={17} className="animate-spin" />
                    ) : (
                      <CreditCard size={17} />
                    )}
                    Proceed to Razorpay Checkout
                  </button>
                )}

                <p className="text-center font-mono text-[10px] text-[#F1E9DA]/40">
                  Instant deployment upon payment. Server details will appear under My Servers.
                </p>
              </div>
            ) : plansLoading ? (
              <div className="mt-7 h-64 animate-pulse rounded-2xl border border-[#332f2a] bg-[#201d1a]" />
            ) : (
              <div className="mt-7 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-12 text-center text-[#F1E9DA]">
                <Server className="mx-auto text-[#C6A66B]" size={34} />
                <h3 className="mt-4 font-serif text-lg font-bold">No plan selected</h3>
                <p className="mt-2 text-sm text-[#F1E9DA]/60">
                  Please choose a VPS plan to proceed with checkout.
                </p>
                <button
                  type="button"
                  onClick={() => go("Windows VPS")}
                  className="mt-5 rounded-xl bg-[#C6A66B] px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82] transition"
                >
                  Browse VPS Plans
                </button>
              </div>
            )}
          </section>
        )}

        {/* Support Page */}
        {page === "Support" && (
          <CustomerSupportDesk
            user={profile}
            onGoToPlans={() => go("Windows VPS")}
            supportContact={supportContact}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#292521] bg-[#171717]">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-4 px-4 py-7 text-xs text-[#F1E9DA]/50 sm:flex-row sm:items-center sm:px-6 lg:px-10">
          <div className="flex items-center gap-2">
            <img
              src={logo}
              alt="24/7"
              className="h-7 w-7 object-contain"
            />
            <span>
              © {new Date().getFullYear()} 24/7 HR Service. All rights reserved.
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <button onClick={() => go("Support")} className="hover:text-[#C6A66B] transition">
              Contact
            </button>
            <button onClick={() => go("Wallet")} className="hover:text-[#C6A66B] transition">
              Wallet
            </button>
            <button onClick={() => go("Orders")} className="hover:text-[#C6A66B] transition">
              Orders
            </button>
            <button onClick={() => go("My VPS")} className="hover:text-[#C6A66B] transition">
              My Servers
            </button>
          </div>
        </div>
      </footer>

      {/* Top-Up Wallet Modal */}
      {showTopupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#171717]/85 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowTopupModal(false);
          }}
        >
          <div className="my-auto w-full max-w-md overflow-hidden rounded-3xl border border-[#C6A66B]/30 bg-[#201d1a] shadow-[0_25px_100px_rgba(0,0,0,.65)]">
            <div className="flex items-start justify-between border-b border-[#332f2a] px-6 py-5">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-[#C6A66B]">
                  Prepaid Balance
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold text-[#F1E9DA]">Top-Up Wallet</h2>
                <p className="mt-1 text-xs text-[#F1E9DA]/60">
                  Add funds via UPI, Cards, Netbanking or Razorpay.
                </p>
              </div>
              <button
                onClick={() => setShowTopupModal(false)}
                className="rounded-lg border border-[#332f2a] p-2 text-[#F1E9DA]/50 hover:text-[#F1E9DA] transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {topupError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                  {topupError}
                </div>
              )}

              {/* Current balance indicator */}
              <div className="flex items-center justify-between rounded-xl border border-[#332f2a] bg-[#171717] p-3 text-xs">
                <span className="font-mono text-[#F1E9DA]/60">Current Balance:</span>
                <span className="font-serif font-bold text-[#C6A66B]">
                  {formatDecimal(currentWalletBalance)}
                </span>
              </div>

              {/* Quick preset amounts */}
              <div>
                <label className="mb-2 block font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                  Select Amount (INR)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[500, 1000, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTopupAmount(amt)}
                      className={`rounded-xl border py-2.5 font-mono text-xs font-bold transition ${
                        topupAmount === amt
                          ? "border-[#C6A66B] bg-[#C6A66B]/15 text-[#C6A66B]"
                          : "border-[#332f2a] bg-[#171717] text-[#F1E9DA]/70 hover:border-[#C6A66B]/40"
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom amount */}
              <div>
                <label className="mb-2 block font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                  Or enter custom amount (Min. ₹100)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 font-mono text-sm font-bold text-[#F1E9DA]/50">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="100"
                    max="100000"
                    step="100"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#332f2a] bg-[#171717] py-3 pl-8 pr-4 font-mono text-sm font-bold text-[#F1E9DA] outline-none focus:border-[#C6A66B]"
                  />
                </div>
              </div>

              <button
                disabled={topupLoading || topupAmount < 100}
                onClick={handleTopup}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C6A66B] py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/15 transition hover:bg-[#d8ba82] disabled:opacity-50"
              >
                {topupLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    <Wallet size={16} /> Pay ₹{topupAmount} & Add to Wallet
                  </>
                )}
              </button>

              <p className="text-center font-mono text-[10px] text-[#F1E9DA]/40">
                100% secure payment powered by Razorpay. Funds are credited
                immediately.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {selectedPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#171717]/85 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !checkoutLoading)
              closeCheckout();
          }}
        >
          <div className="my-auto w-full max-w-xl overflow-hidden rounded-3xl border border-[#C6A66B]/30 bg-[#201d1a] shadow-[0_25px_100px_rgba(0,0,0,.65)]">
            <div className="flex items-start justify-between border-b border-[#332f2a] px-5 py-5 sm:px-7">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-[#C6A66B]">
                  VPS Checkout
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold text-[#F1E9DA]">Complete Your Order</h2>
                <p className="mt-1 text-xs text-[#F1E9DA]/60">
                  Review server configuration and choose payment option.
                </p>
              </div>
              <button
                disabled={checkoutLoading}
                onClick={closeCheckout}
                className="rounded-lg border border-[#332f2a] p-2 text-[#F1E9DA]/50 hover:text-[#F1E9DA] transition disabled:opacity-50"
                aria-label="Close checkout"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5 sm:p-7">
              {checkoutError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200">
                  {checkoutError}
                </div>
              )}

              {/* Plan Details */}
              <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                      Selected plan
                    </p>
                    <h3 className="mt-1 font-serif font-bold text-[#F1E9DA]">{selectedPlan.name}</h3>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-[#C6A66B]">
                      {formatDecimal(selectedPlan.price, selectedPlan.currency || "INR")}/month
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                    Ready to Deploy
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs text-[#F1E9DA]/70 sm:grid-cols-4">
                  <span>{selectedPlan.cpuCores ?? "—"} vCPU</span>
                  <span>{selectedPlan.ramGb ?? "—"} GB RAM</span>
                  <span>{selectedPlan.storageGb ?? "—"} GB SSD</span>
                  <span>{selectedPlan.bandwidthGb ?? "—"} GB BW</span>
                </div>
              </div>

              {/* Zone & OS Selection */}
              <div className="grid gap-3 sm:grid-cols-2">
                {hhZones.length > 0 && (
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                      <Globe size={14} className="text-[#C6A66B]" /> Deployment Zone
                    </label>
                    <select
                      value={selectedZoneId}
                      onChange={(e) => handleZoneChange(e.target.value)}
                      className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA] outline-none focus:border-[#C6A66B]"
                    >
                      {hhZones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-2 block font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                    Select Operating System
                  </label>
                  <select
                    value={selectedOS}
                    onChange={(e) => setSelectedOS(e.target.value)}
                    className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA] outline-none focus:border-[#C6A66B]"
                  >
                    {(hhIsos.length > 0
                      ? hhIsos.map((iso) => iso.isoName)
                      : selectedPlan.supportedOS?.length
                      ? selectedPlan.supportedOS
                      : ["Ubuntu 22.04", "Windows Server 2022"]
                    ).map((os) => (
                      <option key={os} value={os}>
                        {os}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <p className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                  Select Payment Method
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("WALLET")}
                    className={`rounded-xl border p-4 text-left transition ${
                      paymentMethod === "WALLET"
                        ? "border-[#C6A66B] bg-[#C6A66B]/10"
                        : "border-[#332f2a] bg-[#171717]"
                    }`}
                  >
                    <Wallet size={19} className="text-[#C6A66B]" />
                    <p className="mt-2 text-sm font-bold text-[#F1E9DA]">Wallet Pay</p>
                    <p className="mt-1 font-mono text-[10px] text-[#F1E9DA]/50">
                      Balance: {formatDecimal(currentWalletBalance)}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("RAZORPAY")}
                    className={`rounded-xl border p-4 text-left transition ${
                      paymentMethod === "RAZORPAY"
                        ? "border-[#C6A66B] bg-[#C6A66B]/10"
                        : "border-[#332f2a] bg-[#171717]"
                    }`}
                  >
                    <CreditCard size={19} className="text-[#C6A66B]" />
                    <p className="mt-2 text-sm font-bold text-[#F1E9DA]">Razorpay</p>
                    <p className="mt-1 text-[10px] text-[#F1E9DA]/50">
                      UPI · Cards · Netbanking
                    </p>
                  </button>
                </div>
              </div>

              {/* Balance Check for Wallet */}
              {paymentMethod === "WALLET" && (
                <div className="rounded-xl border border-[#332f2a] bg-[#171717] p-3 text-xs">
                  {hasSufficientBalance ? (
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 size={15} />
                      <span>
                        Sufficient balance available. Remaining after order:{" "}
                        <strong className="font-mono text-[#F1E9DA]">
                          {formatDecimal(
                            currentWalletBalance - selectedPlanPrice,
                          )}
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-amber-300">
                        <AlertCircle size={15} className="shrink-0" />
                        <span>
                          Insufficient balance. Need ₹
                          {selectedPlanPrice - currentWalletBalance} more.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTopupAmount(
                            Math.max(
                              100,
                              Math.ceil(
                                (selectedPlanPrice - currentWalletBalance) /
                                  100,
                              ) * 100,
                            ),
                          );
                          setShowTopupModal(true);
                        }}
                        className="rounded-lg bg-[#C6A66B]/20 px-3 py-1 font-mono text-xs font-bold text-[#C6A66B] hover:bg-[#C6A66B]/30"
                      >
                        Add Funds
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Total Summary */}
              <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-4">
                <div className="flex items-center justify-between text-xs text-[#F1E9DA]/60">
                  <span>Plan price</span>
                  <span className="font-mono">
                    {formatDecimal(
                      selectedPlan.price,
                      selectedPlan.currency || "INR",
                    )}
                    /month
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#332f2a] pt-3">
                  <span className="text-sm font-bold text-[#F1E9DA]">Total Payable</span>
                  <span className="font-serif text-2xl font-bold text-[#C6A66B]">
                    {formatDecimal(
                      selectedPlan.price,
                      selectedPlan.currency || "INR",
                    )}
                    <span className="ml-1 font-sans text-xs font-normal text-[#F1E9DA]/50">
                      /month
                    </span>
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              {paymentMethod === "WALLET" ? (
                <button
                  disabled={checkoutLoading || !hasSufficientBalance}
                  onClick={handleCheckoutSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-4 font-mono text-sm font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/15 transition hover:bg-[#d8ba82] disabled:opacity-50"
                >
                  {checkoutLoading ? (
                    <>
                      <RefreshCw size={17} className="animate-spin" /> Deploying
                      VPS Server…
                    </>
                  ) : (
                    <>
                      <Wallet size={17} /> Pay{" "}
                      {formatDecimal(selectedPlan.price)} with Wallet
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled={checkoutLoading}
                  onClick={handleCheckoutSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-4 font-mono text-sm font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/15 transition hover:bg-[#d8ba82] disabled:opacity-50"
                >
                  {checkoutLoading ? (
                    <RefreshCw size={17} className="animate-spin" />
                  ) : (
                    <CreditCard size={17} />
                  )}
                  Proceed to Razorpay Checkout
                </button>
              )}

              <p className="text-center font-mono text-[10px] leading-5 text-[#F1E9DA]/40">
                Servers are provisioned and activated instantly upon payment
                completion.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Renewal & Lifecycle Modal */}
      {renewalModalVpsId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#171717]/85 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !renewalActionLoading) {
              setRenewalModalVpsId(null);
            }
          }}
        >
          <div className="my-auto w-full max-w-xl overflow-hidden rounded-3xl border border-[#C6A66B]/30 bg-[#201d1a] shadow-[0_25px_100px_rgba(0,0,0,.65)]">
            <div className="flex items-start justify-between border-b border-[#332f2a] px-6 py-5">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-[#C6A66B]">
                  Server Lifecycle
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold text-[#F1E9DA]">Auto-Renewal & Extension</h2>
                <p className="mt-1 text-xs text-[#F1E9DA]/60">
                  {renewalDetails ? `${renewalDetails.hostname || "VPS"} (${renewalDetails.ipAddress})` : "Loading details…"}
                </p>
              </div>
              <button
                disabled={renewalActionLoading}
                onClick={() => setRenewalModalVpsId(null)}
                className="rounded-lg border border-[#332f2a] p-2 text-[#F1E9DA]/50 hover:text-[#F1E9DA] transition disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {renewalError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 flex items-center gap-2">
                  <AlertCircle size={15} /> {renewalError}
                </div>
              )}
              {renewalSuccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 size={15} /> {renewalSuccess}
                </div>
              )}

              {renewalLoading || !renewalDetails ? (
                <p className="py-8 text-center text-sm text-[#F1E9DA]/60">
                  <RefreshCw size={20} className="mx-auto animate-spin text-[#C6A66B] mb-2" />
                  Loading renewal details…
                </p>
              ) : (
                <>
                  {/* Grace Period & Expiry Banner */}
                  {renewalDetails.status === "SUSPENDED" && (
                    <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200">
                      <p className="font-bold flex items-center gap-2 text-red-300">
                        <AlertTriangle size={16} /> Server Suspended — Grace Period Active
                      </p>
                      <p className="mt-1">
                        Your server expired on {renewalDetails.expiresAt ? new Date(renewalDetails.expiresAt).toLocaleDateString() : "—"}. 
                        Grace period ends on{" "}
                        <strong className="text-white">
                          {renewalDetails.gracePeriodExpiresAt ? new Date(renewalDetails.gracePeriodExpiresAt).toLocaleString() : "Soon"}
                        </strong>
                        . If not renewed before the grace period ends, all data and disks will be permanently terminated.
                      </p>
                    </div>
                  )}

                  {/* Plan & Pricing Overview */}
                  <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#332f2a] bg-[#171717] p-4 text-xs">
                    <div>
                      <span className="font-mono text-[#F1E9DA]/50 uppercase text-[10px]">Plan:</span>
                      <p className="mt-0.5 font-bold text-[#F1E9DA] text-sm">{renewalDetails.plan.name}</p>
                    </div>
                    <div>
                      <span className="font-mono text-[#F1E9DA]/50 uppercase text-[10px]">Duration:</span>
                      <p className="mt-0.5 font-bold text-[#F1E9DA] text-sm">{renewalDetails.plan.durationDays} Days</p>
                    </div>
                    <div>
                      <span className="font-mono text-[#F1E9DA]/50 uppercase text-[10px]">Current Expiry:</span>
                      <p className="mt-0.5 font-mono font-bold text-[#C6A66B]">
                        {renewalDetails.expiresAt ? new Date(renewalDetails.expiresAt).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="font-mono text-[#F1E9DA]/50 uppercase text-[10px]">Renewal Price:</span>
                      <p className="mt-0.5 font-serif font-bold text-emerald-400 text-sm">
                        ₹{renewalDetails.plan.renewalPrice}
                      </p>
                    </div>
                  </div>

                  {/* Auto-Renewal Consent Box */}
                  <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-[#F1E9DA] flex items-center gap-2">
                          <RefreshCw size={14} className="text-[#C6A66B]" /> Automatic Wallet Renewal
                        </p>
                        <p className="text-[11px] text-[#F1E9DA]/50 mt-0.5">
                          {renewalDetails.autoRenew
                            ? `Active (Consent recorded on ${renewalDetails.autoRenewConsentAt ? new Date(renewalDetails.autoRenewConsentAt).toLocaleDateString() : "N/A"})`
                            : "Disabled. Existing instances remain opted out until explicit consent."}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${
                          renewalDetails.autoRenew
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-[#292521] text-[#F1E9DA]/40 border border-[#332f2a]"
                        }`}
                      >
                        {renewalDetails.autoRenew ? "ENABLED" : "DISABLED"}
                      </span>
                    </div>

                    {!renewalDetails.autoRenew ? (
                      <div className="space-y-3 pt-2 border-t border-[#332f2a]">
                        <label className="flex items-start gap-2.5 cursor-pointer text-[11px] text-[#F1E9DA]/70">
                          <input
                            type="checkbox"
                            checked={renewalConsentChecked}
                            onChange={(e) => setRenewalConsentChecked(e.target.checked)}
                            className="mt-0.5 rounded border-[#332f2a] bg-[#201d1a] text-[#C6A66B] focus:ring-0"
                          />
                          <span>
                            I give my <strong>explicit customer consent</strong> authorizing 24/7 VPS to automatically deduct <strong>₹{renewalDetails.plan.renewalPrice}</strong> from my available wallet balance prior to expiry to renew this server for {renewalDetails.plan.durationDays} days.
                          </span>
                        </label>
                        <button
                          disabled={!renewalConsentChecked || renewalActionLoading}
                          onClick={() => handleToggleAutoRenew(true)}
                          className="w-full rounded-xl bg-[#C6A66B] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8ba82] disabled:opacity-40"
                        >
                          {renewalActionLoading ? "Saving Consent…" : "Enable Auto-Renewal with Consent"}
                        </button>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-[#332f2a] flex items-center justify-between">
                        <p className="text-[11px] text-[#F1E9DA]/60">
                          Next attempt:{" "}
                          <strong className="text-[#F1E9DA] font-mono">
                            {renewalDetails.nextRenewalAttempt
                              ? new Date(renewalDetails.nextRenewalAttempt).toLocaleDateString()
                              : "Prior to expiry"}
                          </strong>
                        </p>
                        <button
                          disabled={renewalActionLoading}
                          onClick={() => handleToggleAutoRenew(false)}
                          className="rounded-lg bg-[#292521] border border-[#332f2a] px-3 py-1.5 font-mono text-xs font-bold text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          Disable Auto-Renewal
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Wallet Balance & Insufficient Warning */}
                  <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[#F1E9DA]/60 flex items-center gap-1.5">
                        <Wallet size={14} className="text-[#C6A66B]" /> Wallet Balance:
                      </span>
                      <span className="font-serif font-bold text-[#F1E9DA] text-sm">
                        ₹{renewalDetails.wallet.balance}
                      </span>
                    </div>

                    {!renewalDetails.isBalanceSufficient ? (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 space-y-2">
                        <p className="font-bold flex items-center gap-1.5">
                          <AlertTriangle size={14} /> Insufficient Balance for Auto-Renewal
                        </p>
                        <p className="text-[11px]">
                          Your wallet needs <strong>₹{renewalDetails.shortfall}</strong> more to cover this renewal fee. Top up now to prevent service interruption.
                        </p>
                        <button
                          onClick={() => {
                            setRenewalModalVpsId(null);
                            setShowTopupModal(true);
                          }}
                          className="w-full rounded-lg bg-[#C6A66B] py-2 text-center font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82] transition"
                        >
                          Top Up Wallet Now
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 size={13} /> Wallet has sufficient funds for upcoming renewal.
                      </p>
                    )}
                  </div>

                  {/* Recent Renewal Result */}
                  {renewalDetails.recentAttempts && renewalDetails.recentAttempts.length > 0 && (
                    <div className="rounded-xl border border-[#332f2a] bg-[#171717]/50 p-3 text-[11px] text-[#F1E9DA]/60">
                      <span className="font-semibold text-[#F1E9DA]">Last Renewal Result:</span>{" "}
                      <span
                        className={`font-mono font-bold ${
                          renewalDetails.recentAttempts[0].status === "SUCCESS"
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }`}
                      >
                        {renewalDetails.recentAttempts[0].status}
                      </span>{" "}
                      on {new Date(renewalDetails.recentAttempts[0].attemptedAt).toLocaleDateString()}
                      {renewalDetails.recentAttempts[0].errorMessage && (
                        <p className="text-red-300 mt-1">{renewalDetails.recentAttempts[0].errorMessage}</p>
                      )}
                    </div>
                  )}

                  {/* Renewal Action Buttons */}
                  <div className="pt-2 space-y-2.5">
                    {/* 1. Direct Razorpay Payment Button */}
                    <button
                      disabled={renewalRazorpayLoading || renewalActionLoading}
                      onClick={handleRazorpayRenew}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C6A66B] to-[#d8ba82] py-3.5 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/20 transition hover:opacity-95 disabled:opacity-40"
                    >
                      {renewalRazorpayLoading ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : (
                        <CreditCard size={15} />
                      )}
                      Pay & Renew with Razorpay (₹{renewalDetails.plan.renewalPrice} UPI/Card)
                    </button>

                    {/* 2. Wallet Renewal Button */}
                    <button
                      disabled={!renewalDetails.isBalanceSufficient || renewalActionLoading || renewalRazorpayLoading}
                      onClick={handleManualRenew}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#332f2a] bg-[#171717] py-3 font-mono text-xs font-semibold uppercase tracking-wider text-[#F1E9DA]/80 transition hover:border-[#C6A66B]/50 hover:text-[#F1E9DA] disabled:opacity-40"
                    >
                      {renewalActionLoading ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : (
                        <Zap size={15} />
                      )}
                      Renew via Wallet (₹{renewalDetails.plan.renewalPrice})
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* HostHeaven Diagnostics & Server Management Modal */}
      {manageModalVps && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#171717]/85 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !manageActionLoading) {
              setManageModalVps(null);
            }
          }}
        >
          <div className="my-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-[#C6A66B]/30 bg-[#201d1a] shadow-[0_25px_100px_rgba(0,0,0,.65)]">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#332f2a] px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-[#C6A66B]">
                    HostHeaven Infrastructure
                  </p>
                  <span className="rounded border border-[#C6A66B]/30 bg-[#C6A66B]/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#C6A66B]">
                    UserSide API
                  </span>
                </div>
                <h2 className="mt-1 font-serif text-2xl font-bold text-[#F1E9DA]">
                  Server Management & Metrics
                </h2>
                <p className="mt-1 font-mono text-xs text-[#F1E9DA]/60">
                  {manageModalVps.hostname || "VPS Server"} · {manageModalVps.ipAddress}
                </p>
              </div>
              <button
                disabled={manageActionLoading}
                onClick={() => setManageModalVps(null)}
                className="rounded-lg border border-[#332f2a] p-2 text-[#F1E9DA]/50 hover:text-[#F1E9DA] transition disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#332f2a] bg-[#171717] px-6 font-mono text-xs font-bold text-[#F1E9DA]/60">
              <button
                onClick={() => setManageTab("overview")}
                className={`py-3 px-3 border-b-2 transition ${
                  manageTab === "overview"
                    ? "border-[#C6A66B] text-[#C6A66B]"
                    : "border-transparent hover:text-[#F1E9DA]"
                }`}
              >
                Overview & Power
              </button>
              <button
                onClick={() => setManageTab("metrics")}
                className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  manageTab === "metrics"
                    ? "border-[#C6A66B] text-[#C6A66B]"
                    : "border-transparent hover:text-[#F1E9DA]"
                }`}
              >
                <Activity size={13} /> Resource Metrics
              </button>
              <button
                onClick={() => setManageTab("storage")}
                className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  manageTab === "storage"
                    ? "border-[#C6A66B] text-[#C6A66B]"
                    : "border-transparent hover:text-[#F1E9DA]"
                }`}
              >
                <HardDrive size={13} /> Storage Drives
              </button>
              <button
                onClick={() => setManageTab("password")}
                className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  manageTab === "password"
                    ? "border-[#C6A66B] text-[#C6A66B]"
                    : "border-transparent hover:text-[#F1E9DA]"
                }`}
              >
                <KeyRound size={13} /> Password
              </button>
              <button
                onClick={() => setManageTab("rebuild")}
                className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  manageTab === "rebuild"
                    ? "border-[#C6A66B] text-[#C6A66B]"
                    : "border-transparent hover:text-[#F1E9DA]"
                }`}
              >
                <RotateCcw size={13} /> Rebuild OS
              </button>
            </div>

            {/* Content Area */}
            <div className="space-y-5 p-6 max-h-[70vh] overflow-y-auto">
              {manageNotice && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 size={15} /> {manageNotice}
                </div>
              )}
              {manageError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 flex items-center gap-2">
                  <AlertCircle size={15} /> {manageError}
                </div>
              )}

              {manageLoading ? (
                <div className="py-12 text-center text-[#F1E9DA]/60">
                  <RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]" />
                  Fetching live telemetry from HostHeaven...
                </div>
              ) : (
                <>
                  {/* TAB: OVERVIEW & POWER CONTROLS */}
                  {manageTab === "overview" && (
                    <div className="space-y-5">
                      {/* Telemetry info cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-3.5">
                          <p className="font-mono text-[10px] text-[#F1E9DA]/50 uppercase">Proxmox VMID</p>
                          <p className="mt-1 font-mono font-bold text-[#F1E9DA]">
                            {manageDetails?.proxmoxVmid || "101"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-3.5">
                          <p className="font-mono text-[10px] text-[#F1E9DA]/50 uppercase">Cluster Node</p>
                          <p className="mt-1 font-mono font-bold text-[#F1E9DA]">
                            {manageDetails?.serverId || "node-in-del-01"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-3.5">
                          <p className="font-mono text-[10px] text-[#F1E9DA]/50 uppercase">Provider Status</p>
                          <p className="mt-1 font-bold text-emerald-400">
                            {manageDetails?.status || manageModalVps.status}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-3.5">
                          <p className="font-mono text-[10px] text-[#F1E9DA]/50 uppercase">Lock Status</p>
                          <p className="mt-1 font-bold flex items-center gap-1 text-emerald-400">
                            {manageLock?.isLocked ? (
                              <>
                                <Lock size={12} className="text-amber-400" />
                                <span className="text-amber-400">Locked</span>
                              </>
                            ) : (
                              <>
                                <Unlock size={12} className="text-emerald-400" />
                                <span>Unlocked</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Power Controls */}
                      <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-5">
                        <h4 className="font-bold text-sm text-[#F1E9DA] mb-3">
                          Server Power Actions
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("start")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-2.5 font-mono text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition"
                          >
                            <Zap size={14} /> Start Server
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("stop")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2.5 font-mono text-xs font-bold text-red-300 hover:bg-red-500/25 disabled:opacity-50 transition"
                          >
                            <Power size={14} /> Stop Server
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("reboot")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 px-3 py-2.5 font-mono text-xs font-bold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition"
                          >
                            <RefreshCw size={14} /> Reboot Server
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("pause")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-[#201d1a] border border-[#332f2a] px-3 py-2.5 font-mono text-xs font-bold text-[#F1E9DA]/80 hover:bg-[#292521] disabled:opacity-50 transition"
                          >
                            Pause Server
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("hibernate")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-[#201d1a] border border-[#332f2a] px-3 py-2.5 font-mono text-xs font-bold text-[#F1E9DA]/80 hover:bg-[#292521] disabled:opacity-50 transition"
                          >
                            Hibernate
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("resume")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-[#201d1a] border border-[#C6A66B]/30 px-3 py-2.5 font-mono text-xs font-bold text-[#C6A66B] hover:bg-[#292521] disabled:opacity-50 transition"
                          >
                            Resume Server
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: RESOURCE METRICS */}
                  {manageTab === "metrics" && (
                    <div className="space-y-4">
                      {/* CPU Usage Card */}
                      <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-4 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-[#F1E9DA]/80 flex items-center gap-1.5">
                            <Cpu size={15} className="text-[#C6A66B]" /> CPU Utilization:
                          </span>
                          <span className="font-mono font-bold text-[#C6A66B] text-sm">
                            {manageMetrics?.cpu?.usagePercent ?? 18}%
                          </span>
                        </div>
                        <div className="w-full bg-[#201d1a] rounded-full h-2.5 overflow-hidden border border-[#332f2a]">
                          <div
                            className="bg-[#C6A66B] h-2.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, manageMetrics?.cpu?.usagePercent ?? 18)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Memory Usage Card */}
                      <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-4 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-[#F1E9DA]/80 flex items-center gap-1.5">
                            <Server size={15} className="text-[#C6A66B]" /> Memory (RAM):
                          </span>
                          <span className="font-mono font-bold text-[#C6A66B] text-sm">
                            {manageMetrics?.ram?.usedMb ?? 1420} MB / {manageMetrics?.ram?.totalMb ?? 4096} MB ({manageMetrics?.ram?.usagePercent ?? 34}%)
                          </span>
                        </div>
                        <div className="w-full bg-[#201d1a] rounded-full h-2.5 overflow-hidden border border-[#332f2a]">
                          <div
                            className="bg-[#C6A66B]/80 h-2.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, manageMetrics?.ram?.usagePercent ?? 34)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Network & Disk IO */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-4">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50 mb-2">Network Traffic</p>
                          <p className="text-[#F1E9DA]/80">
                            RX: <span className="font-mono font-bold text-[#F1E9DA]">{(Number(manageMetrics?.network?.rxBytes || 154203940) / 1024 / 1024).toFixed(1)} MB</span>
                          </p>
                          <p className="text-[#F1E9DA]/80 mt-1">
                            TX: <span className="font-mono font-bold text-[#F1E9DA]">{(Number(manageMetrics?.network?.txBytes || 89421040) / 1024 / 1024).toFixed(1)} MB</span>
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#332f2a] bg-[#171717] p-4">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50 mb-2">Disk I/O</p>
                          <p className="text-[#F1E9DA]/80">
                            Read: <span className="font-mono font-bold text-[#F1E9DA]">{(Number(manageMetrics?.disk?.readBytes || 42109400) / 1024 / 1024).toFixed(1)} MB</span>
                          </p>
                          <p className="text-[#F1E9DA]/80 mt-1">
                            Write: <span className="font-mono font-bold text-[#F1E9DA]">{(Number(manageMetrics?.disk?.writeBytes || 19482010) / 1024 / 1024).toFixed(1)} MB</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: STORAGE DRIVES */}
                  {manageTab === "storage" && (
                    <div className="space-y-4 text-xs">
                      {(manageStorage?.drives && manageStorage.drives.length > 0 ? manageStorage.drives : [
                        { mountPoint: "/", fsType: "ext4", totalGb: 50, usedGb: 14.8, freeGb: 35.2, usagePercentage: 29.6 },
                        { mountPoint: "/boot", fsType: "vfat", totalGb: 0.5, usedGb: 0.12, freeGb: 0.38, usagePercentage: 24.0 }
                      ]).map((drive: any) => (
                        <div
                          key={drive.mountPoint}
                          className="rounded-2xl border border-[#332f2a] bg-[#171717] p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#F1E9DA]">
                              Mount: <span className="font-mono text-[#C6A66B]">{drive.mountPoint}</span> ({drive.fsType})
                            </span>
                            <span className="text-[#F1E9DA]/70 font-mono">
                              {drive.usedGb} GB / {drive.totalGb} GB ({drive.usagePercentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-[#201d1a] rounded-full h-2 overflow-hidden border border-[#332f2a]">
                            <div
                              className="bg-[#C6A66B] h-2 rounded-full"
                              style={{ width: `${Math.min(100, drive.usagePercentage)}%` }}
                            />
                          </div>
                          <p className="font-mono text-[11px] text-[#F1E9DA]/40">
                            Free Space: {drive.freeGb} GB available
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TAB: PASSWORD CHANGE */}
                  {manageTab === "password" && (
                    <div className="space-y-4 rounded-2xl border border-[#332f2a] bg-[#171717] p-5 text-xs">
                      <div>
                        <h4 className="font-bold text-sm text-[#F1E9DA]">
                          Reset Root / Administrator Password
                        </h4>
                        <p className="text-[#F1E9DA]/60 mt-1">
                          Set a secure password for SSH / RDP console access.
                        </p>
                      </div>
                      <div>
                        <label className="block mb-2 font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                          New Password (minimum 8 characters)
                        </label>
                        <input
                          type="password"
                          value={newVmPassword}
                          onChange={(e) => setNewVmPassword(e.target.value)}
                          placeholder="Enter new strong password"
                          className="w-full rounded-xl border border-[#332f2a] bg-[#201d1a] p-3 text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 outline-none focus:border-[#C6A66B]"
                        />
                      </div>
                      <button
                        disabled={manageActionLoading || newVmPassword.length < 8}
                        onClick={handleChangePassword}
                        className="rounded-xl bg-[#C6A66B] px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82] transition disabled:opacity-50"
                      >
                        {manageActionLoading ? "Updating..." : "Update Password"}
                      </button>
                    </div>
                  )}

                  {/* TAB: REBUILD OS */}
                  {manageTab === "rebuild" && (
                    <div className="space-y-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-xs">
                      <div>
                        <h4 className="font-bold text-sm text-red-300 flex items-center gap-2">
                          <AlertTriangle size={16} /> Rebuild Operating System
                        </h4>
                        <p className="text-red-200/80 mt-1">
                          Rebuilding reinstall the operating system onto the primary disk. All existing server data will be wiped.
                        </p>
                      </div>
                      <div>
                        <label className="block mb-2 font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                          Select Operating System ISO
                        </label>
                        <select
                          value={selectedRebuildIso}
                          onChange={(e) => setSelectedRebuildIso(e.target.value)}
                          className="w-full rounded-xl border border-[#332f2a] bg-[#201d1a] p-3 text-sm text-[#F1E9DA] outline-none focus:border-[#C6A66B]"
                        >
                          <option value="">-- Choose an ISO --</option>
                          {(hhIsos.length > 0 ? hhIsos : [
                            { id: "iso-u22", isoName: "Ubuntu 22.04 LTS", osType: "LINUX" },
                            { id: "iso-w22", isoName: "Windows Server 2022", osType: "WINDOWS" },
                            { id: "iso-deb12", isoName: "Debian 12 Bookworm", osType: "LINUX" }
                          ]).map((iso) => (
                            <option key={iso.id} value={iso.id}>
                              {iso.isoName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        disabled={manageActionLoading || !selectedRebuildIso}
                        onClick={handleRebuildVm}
                        className="rounded-xl bg-red-600 px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-red-500 transition disabled:opacity-50"
                      >
                        {manageActionLoading ? "Initiating Rebuild..." : "Erase & Rebuild Server"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
