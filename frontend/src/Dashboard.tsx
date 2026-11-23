import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  CreditCard,
  HardDrive,
  Headphones,
  History,
  Menu,
  Monitor,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
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
} from "lucide-react";
import api from "./api";
import logo from "./assets/247-logo.png";
import BuyLinuxIP from "./BuyLinuxIP";

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
  const [dedicatedIpEnabled, setDedicatedIpEnabled] = useState(false);
  const [dedicatedIpStatusLoaded, setDedicatedIpStatusLoaded] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [vpsList, setVpsList] = useState<VPSInstance[]>([]);
  const [plans, setPlans] = useState<VPSPlan[]>([]);
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
  const [manageLock, setManageLock] = useState<any | null>(null);
  const [manageMetrics, setManageMetrics] = useState<any | null>(null);
  const [manageStorage, setManageStorage] = useState<any | null>(null);
  const [manageTab, setManageTab] = useState<
    "overview" | "metrics" | "storage" | "password" | "rebuild"
  >("overview");
  const [manageLoading, setManageLoading] = useState(false);
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
      const zones = Array.isArray(res.data) ? res.data : [];
      setHhZones(zones);
      if (zones.length > 0) {
        setSelectedZoneId((prev) => prev || zones[0].id);
        const isoRes = await api.get(`/hostheaven/zones/${zones[0].id}/isos`);
        setHhIsos(Array.isArray(isoRes.data) ? isoRes.data : []);
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

  const openDiagnosticsModal = async (vps: VPSInstance) => {
    setManageModalVps(vps);
    setManageTab("overview");
    setManageNotice("");
    setManageError("");
    setNewVmPassword("");
    setSelectedRebuildIso("");
    setManageLoading(true);

    try {
      const [detailsRes, lockRes, metricsRes, storageRes] = await Promise.all([
        api.get(`/hostheaven/vms/${vps.id}/details`).catch(() => null),
        api.get(`/hostheaven/vms/${vps.id}/lock-status`).catch(() => null),
        api
          .get(`/hostheaven/vms/${vps.id}/metrics?timeframe=hour`)
          .catch(() => null),
        api.get(`/hostheaven/vms/${vps.id}/storage`).catch(() => null),
      ]);

      if (detailsRes?.data) setManageDetails(detailsRes.data);
      if (lockRes?.data) setManageLock(lockRes.data);
      if (metricsRes?.data) setManageMetrics(metricsRes.data);
      if (storageRes?.data) setManageStorage(storageRes.data);

      if (hhIsos.length === 0) {
        void fetchHostHeavenCatalogue();
      }
    } catch (err: any) {
      setManageError(
        err.response?.data?.message || "Failed to load server diagnostics",
      );
    } finally {
      setManageLoading(false);
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
    void fetchWallet();
    void fetchTransactions();
    void fetchOrders();
    void fetchHostHeavenCatalogue();
  }, [
    fetchProfile,
    fetchVps,
    fetchPlans,
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
        setSelectedOS(matched.supportedOS?.[0] || "Ubuntu 22.04");
      }
    }
  }, [page, plans, selectedPlan]);

  const go = (next: Page) => {
    setPage(next);
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

  const openCheckout = (plan: VPSPlan) => {
    setSelectedPlan(plan);
    setSelectedOS(plan.supportedOS?.[0] || "Ubuntu 22.04");
    setSelectedMonths(1);
    setCustomHostname("");
    if (plan.providerConfig?.zoneId) {
      setSelectedZoneId(plan.providerConfig.zoneId);
    }
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
          amount: data.amount * 100,
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
        // Direct HostHeaven live provisioning
        const config = selectedPlan.providerConfig;
        const matchingIso = hhIsos.find(
          (i) => i.isoName === selectedOS || i.id === selectedOS,
        );

        const res = await api.post("/hostheaven/checkout", {
          zoneId: selectedZoneId || config?.zoneId,
          zoneIsoId: matchingIso?.id || config?.zoneIsoId || "default-iso",
          planType:
            config?.planType ||
            (selectedPlan.tier?.toLowerCase().includes("dedicated")
              ? "DEDICATED"
              : "SHARED"),
          cpuPriceId: config?.cpuPriceId,
          ramPriceId: config?.ramPriceId,
          diskPriceId: config?.diskPriceId,
          bandwidthPriceId: config?.bandwidthPriceId,
          months: selectedMonths || 1,
          operatingSystem: selectedOS,
          hostname: customHostname.trim() || undefined,
          paymentMethod: "WALLET",
        });

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

      // Non-HostHeaven order path
      const orderRes = await api.post("/checkout/orders", {
        planId: selectedPlan.id,
        operatingSystem: selectedOS,
      });

      const order = orderRes.data?.order;
      if (!order?.id) {
        throw new Error("Failed to create order record");
      }

      if (paymentMethod === "WALLET") {
        // Step 2: Pay with Wallet balance
        const payRes = await api.post(
          `/checkout/orders/${order.id}/pay-wallet`,
        );

        if (payRes.data?.status === 'REFUNDED') {
          setError(
            payRes.data?.message ||
              'VPS provisioning could not be completed. Your wallet balance has been refunded in full.',
          );
        } else {
          setNotice(
            payRes.data?.message ||
              `VPS order placed successfully! Order #${order.orderNumber}`,
          );
          setSelectedPlan(null);
          go("My VPS");
        }

        // Refresh all relevant states
        await Promise.all([
          fetchWallet(),
          fetchTransactions(),
          fetchOrders(),
          fetchVps(),
        ]);
      } else {
        // Direct Razorpay payment for orders
        setCheckoutError(
          "Direct Razorpay checkout is in progress. Please use Wallet Pay for instant deployment.",
        );
      }
    } catch (err: any) {
      setCheckoutError(
        err.response?.data?.message ||
          "Failed to complete checkout. Please verify your balance and try again.",
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

    return plans.filter((plan) => {
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
  }, [plans, page]);

  const PlanCard = ({ plan, index }: { plan: VPSPlan; index: number }) => {
    const availableOS = plan.supportedOS || [];
    return (
      <article
        className={`group relative overflow-hidden rounded-2xl border bg-[#0b1531]/90 p-5 shadow-[0_16px_50px_rgba(0,0,0,.22)] transition duration-300 hover:-translate-y-1 hover:border-cyan-400/70 ${index === 1 ? "border-cyan-400/60" : "border-blue-900/70"}`}
      >
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-500 via-cyan-300 to-blue-600" />
        {index === 1 && (
          <span className="absolute right-4 top-4 rounded-full bg-cyan-300/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
            Popular
          </span>
        )}
        <div className="flex items-start justify-between gap-3 pr-16">
          <div className="flex items-center gap-2 text-cyan-100">
            <Monitor size={18} />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {plan.productType === "LINUX_IP_VPS"
                ? "Dedicated IP"
                : "VPS Hosting"}
            </span>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
            Available
          </span>
        </div>
        <h3 className="mt-4 min-h-12 text-lg font-extrabold leading-snug text-white">
          {plan.name}
        </h3>
        {plan.description && (
          <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-5 text-slate-400">
            {plan.description}
          </p>
        )}
        <div className="mt-5 space-y-3 border-y border-blue-900/60 py-4 text-sm text-slate-200">
          <div className="flex items-center gap-3">
            <Cpu size={16} className="text-cyan-300" />
            <span>{plan.cpuCores ?? "—"} vCPU Cores</span>
          </div>
          <div className="flex items-center gap-3">
            <Zap size={16} className="text-cyan-300" />
            <span>{plan.ramGb ?? "—"} GB RAM</span>
          </div>
          <div className="flex items-center gap-3">
            <HardDrive size={16} className="text-cyan-300" />
            <span>{plan.storageGb ?? "—"} GB SSD Storage</span>
          </div>
          <div className="flex items-center gap-3">
            <ArrowUpRight size={16} className="text-cyan-300" />
            <span>{plan.bandwidthGb ?? "—"} GB Bandwidth</span>
          </div>
          <div className="flex items-center gap-3">
            <Globe size={16} className="text-cyan-300" />
            <span>Location: {plan.location || "India"}</span>
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck size={16} className="text-cyan-300" />
            <span>Full control panel & support</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {availableOS.slice(0, 3).map((os) => (
            <span
              key={os}
              className="rounded-md bg-blue-950/80 px-2 py-1 text-[10px] text-blue-200"
            >
              {os}
            </span>
          ))}
        </div>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Starting from
            </p>
            <p className="mt-1 text-2xl font-black text-white">
              {formatDecimal(plan.price, plan.currency || "INR")}
              <span className="ml-1 text-xs font-medium text-slate-400">
                /month
              </span>
            </p>
          </div>
          <button
            onClick={() => openCheckout(plan)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-4 py-3 text-xs font-extrabold text-[#06132d] shadow-lg shadow-cyan-500/20 transition hover:brightness-110"
          >
            Buy Now <ArrowRight size={15} />
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050b20] text-white selection:bg-cyan-300 selection:text-[#06132d]">
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(ellipse_at_50%_-15%,rgba(21,88,220,.28),transparent_48%),radial-gradient(ellipse_at_100%_60%,rgba(8,74,155,.12),transparent_35%)]" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-blue-900/50 bg-[#050b20]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <button
            onClick={() => go("Home")}
            className="flex items-center gap-3 text-left"
          >
            <img
              src={logo}
              alt="24/7"
              className="h-10 w-10 rounded-xl object-contain"
            />
            <span>
              <span className="block text-lg font-black tracking-wide">
                24/7 <span className="text-cyan-300">HR SERVICE</span>
              </span>
              <span className="block text-[9px] tracking-[.28em] text-slate-500">
                VPS HOSTING
              </span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.filter((item) => item.label !== "Dedicated IP" || dedicatedIpEnabled).map((item) => (
              <button
                key={item.label}
                onClick={() => go(item.label)}
                className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                  page === item.label
                    ? "bg-blue-500/15 text-cyan-200"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
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
              className="flex items-center gap-2 rounded-full border border-blue-800/80 bg-blue-950/40 px-3.5 py-1.5 text-xs transition hover:border-cyan-300"
              title="View wallet balance and history"
            >
              <Wallet size={14} className="text-cyan-300" />
              <span className="font-bold text-white">
                {formatDecimal(currentWalletBalance)}
              </span>
            </button>

            <div className="text-right">
              <p className="text-xs font-bold">
                {profile?.name || "My Account"}
              </p>
              <p className="max-w-40 truncate text-[10px] text-slate-500">
                {profile?.email || ""}
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded-full border border-blue-800/80 px-4 py-2 text-xs font-bold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200"
            >
              Logout
            </button>
          </div>

          <button
            onClick={() => setMobileMenu((v) => !v)}
            className="rounded-lg border border-blue-900 p-2 lg:hidden"
            aria-label="Toggle navigation"
          >
            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileMenu && (
          <nav className="grid grid-cols-2 gap-2 border-t border-blue-900/50 px-4 py-3 sm:grid-cols-3 lg:hidden">
            {navItems.filter((item) => item.label !== "Dedicated IP" || dedicatedIpEnabled).map((item) => (
              <button
                key={item.label}
                onClick={() => go(item.label)}
                className={`rounded-lg px-3 py-3 text-left text-sm ${
                  page === item.label
                    ? "bg-blue-600 text-white"
                    : "bg-white/5 text-slate-300"
                }`}
              >
                {item.short}
              </button>
            ))}
            <button
              onClick={logout}
              className="rounded-lg bg-red-500/10 px-3 py-3 text-left text-sm text-red-300"
            >
              Logout
            </button>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-[1440px] px-4 pb-16 sm:px-6 lg:px-10">
        {notice && (
          <div className="mt-5 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-300" />
              <span>{notice}</span>
            </div>
            <button
              onClick={() => setNotice("")}
              className="text-emerald-400 hover:text-emerald-100"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-300" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError("")}
              className="text-red-400 hover:text-red-100"
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
              <section className="relative mt-7 overflow-hidden rounded-[28px] border border-blue-700/50 bg-[linear-gradient(112deg,#07184a_0%,#092d82_48%,#071c50_100%)] px-6 py-14 text-center shadow-[0_25px_90px_rgba(0,48,160,.24)] sm:mt-9 sm:px-12 sm:py-20">
                <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" />
                <div className="pointer-events-none absolute -right-12 bottom-0 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
                <div className="relative mx-auto max-w-3xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[.2em] text-cyan-100">
                    <Zap size={13} /> High performance cloud servers
                  </span>
                  <h1 className="mt-6 text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
                    Your Windows VPS
                    <br />
                    <span className="bg-gradient-to-r from-cyan-200 to-sky-400 bg-clip-text text-transparent">
                      Starts Here.
                    </span>
                  </h1>
                  <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-blue-100/80 sm:text-base">
                    High performance VPS hosting with instant delivery,
                    reliable uptime and full control. Choose your server and get
                    started in minutes.
                  </p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <button
                      onClick={() => go("Windows VPS")}
                      className="rounded-xl bg-cyan-300 px-6 py-3.5 text-sm font-extrabold text-[#071638] shadow-xl shadow-cyan-500/20 transition hover:bg-cyan-200"
                    >
                      Buy VPS <ArrowRight className="ml-2 inline" size={16} />
                    </button>
                    <button
                      onClick={() => go("Linux VPS")}
                      className="rounded-xl border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
                    >
                      Explore Linux VPS
                    </button>
                    <button
                      onClick={() => go("My VPS")}
                      className="rounded-xl border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
                    >
                      My Servers
                    </button>
                  </div>
                  <div className="mt-12 grid grid-cols-2 gap-5 border-t border-white/15 pt-7 sm:grid-cols-4">
                    <div>
                      <p className="text-2xl font-black">99.9%</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-blue-200">
                        Network uptime target
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-black">SSD</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-blue-200">
                        Fast storage
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-black">24/7</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-blue-200">
                        Support
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-black">Secure</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-blue-200">
                        Wallet & UPI Checkout
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="pt-12 sm:pt-14">
              <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.24em] text-cyan-300">
                    Choose your server
                  </p>
                  <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                    {page === "Home"
                      ? "Explore VPS Plans"
                      : page === "Windows VPS"
                        ? "Windows VPS Plans"
                        : "Linux VPS Plans"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    All plans include full control panel, SSD storage and 24×7
                    support.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => go("Windows VPS")}
                    className={`rounded-full border px-4 py-2 text-xs font-bold ${
                      page === "Windows VPS"
                        ? "border-cyan-300 bg-cyan-300/10 text-cyan-100"
                        : "border-blue-900 text-slate-300"
                    }`}
                  >
                    Windows
                  </button>
                  <button
                    onClick={() => go("Linux VPS")}
                    className={`rounded-full border px-4 py-2 text-xs font-bold ${
                      page === "Linux VPS"
                        ? "border-cyan-300 bg-cyan-300/10 text-cyan-100"
                        : "border-blue-900 text-slate-300"
                    }`}
                  >
                    Linux
                  </button>
                </div>
              </div>

              {plansLoading ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-[390px] animate-pulse rounded-2xl border border-blue-900 bg-[#0b1531]"
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
                <div className="rounded-2xl border border-blue-900/70 bg-[#0b1531]/80 px-6 py-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-cyan-300">
                    <Server size={26} />
                  </div>
                  <h3 className="mt-4 text-lg font-bold">
                    VPS plans will appear here
                  </h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">
                    {plansError ||
                      "Our team is updating the available server plans. Please check again shortly."}
                  </p>
                  <button
                    onClick={fetchPlans}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg border border-blue-800 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-blue-900/40"
                  >
                    <RefreshCw size={14} /> Refresh plans
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {/* Dedicated IP Catalogue */}
        {page === "Dedicated IP" && <BuyLinuxIP embedded />}

        {/* My Servers */}
        {page === "My VPS" && (
          <section className="pt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">
                  Customer area
                </p>
                <h1 className="mt-2 text-3xl font-black">My Servers</h1>
                <p className="mt-2 text-sm text-slate-400">
                  Manage your VPS instances and server status.
                </p>
              </div>
              <button
                onClick={fetchVps}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-800 px-4 py-3 text-xs font-bold text-cyan-200 transition hover:bg-blue-900/40"
              >
                <RefreshCw size={15} /> Refresh
              </button>
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-blue-900 bg-[#0b1531] p-5">
                <p className="text-xs text-slate-400">Total servers</p>
                <p className="mt-2 text-3xl font-black">{vpsList.length}</p>
              </div>
              <div className="rounded-2xl border border-blue-900 bg-[#0b1531] p-5">
                <p className="text-xs text-slate-400">Running</p>
                <p className="mt-2 text-3xl font-black text-emerald-300">
                  {activeCount}
                </p>
              </div>
              <div className="rounded-2xl border border-blue-900 bg-[#0b1531] p-5">
                <p className="text-xs text-slate-400">Stopped / Other</p>
                <p className="mt-2 text-3xl font-black">
                  {vpsList.length - activeCount}
                </p>
              </div>
            </div>

            {loading ? (
              <p className="py-12 text-center text-sm text-slate-400">
                Loading servers…
              </p>
            ) : vpsList.length ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {vpsList.map((vps) => (
                  <article
                    key={vps.id}
                    className="rounded-2xl border border-blue-900/70 bg-[#0b1531] p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-500/15 p-3 text-cyan-300">
                          <Server size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold">
                              {vps.hostname || "VPS Server"}
                            </h3>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                vps.provider === "HOSTHEAVEN"
                                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                  : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              }`}
                            >
                              {vps.provider === "HOSTHEAVEN"
                                ? "HostHeaven"
                                : vps.provider || "SmartVPS"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {vps.providerVpsId ? `VM ID: ${vps.providerVpsId}` : vps.provider}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            vps.status === "RUNNING" || vps.status === "ACTIVE"
                              ? "bg-emerald-400/10 text-emerald-300"
                              : vps.status === "SUSPENDED"
                              ? "bg-red-500/20 text-red-300 border border-red-500/30"
                              : "bg-slate-700 text-slate-300"
                          }`}
                        >
                          {vps.status}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            vps.autoRenew && vps.autoRenewConsentAt
                              ? "bg-blue-500/15 text-cyan-300 border border-cyan-500/30"
                              : "bg-slate-800 text-slate-400"
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

                    <div className="mt-5 grid grid-cols-2 gap-4 border-y border-blue-900/60 py-4 text-sm">
                      <div>
                        <p className="text-[10px] text-slate-500">IP ADDRESS</p>
                        <p className="mt-1 font-semibold text-cyan-200">
                          {vps.ipAddress}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">
                          OPERATING SYSTEM
                        </p>
                        <p className="mt-1">{vps.operatingSystem || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">MEMORY</p>
                        <p className="mt-1">{vps.ram ?? "—"} GB RAM</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">EXPIRES</p>
                        <p className="mt-1">
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
                            : "bg-emerald-500 text-[#031a16] hover:bg-emerald-400"
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
                        onClick={() => openDiagnosticsModal(vps)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-cyan-800/60 bg-cyan-950/40 px-3 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-900/50"
                      >
                        <Activity size={14} /> Manage & Metrics
                      </button>

                      <button
                        onClick={() => openRenewalModal(vps.id)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-blue-700/60 bg-blue-900/30 px-3 py-2.5 text-xs font-bold text-cyan-200 hover:bg-blue-800/40"
                      >
                        <RefreshCw size={14} /> Auto-Renew
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-7 rounded-2xl border border-blue-900 bg-[#0b1531] p-12 text-center">
                <Server className="mx-auto text-cyan-300" size={34} />
                <h3 className="mt-4 text-lg font-bold">No VPS servers yet</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Choose a plan to get your first server.
                </p>
                <button
                  onClick={() => go("Windows VPS")}
                  className="mt-5 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-[#06132d]"
                >
                  Browse VPS Plans
                </button>
              </div>
            )}
          </section>
        )}

        {/* Wallet Page */}
        {page === "Wallet" && (
          <section className="mx-auto max-w-4xl pt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">
                  Billing & Balance
                </p>
                <h1 className="mt-2 text-3xl font-black">My Wallet</h1>
                <p className="mt-2 text-sm text-slate-400">
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
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-800 px-4 py-3 text-xs font-bold text-cyan-200 transition hover:bg-blue-900/40"
                >
                  <RefreshCw
                    size={15}
                    className={walletLoading ? "animate-spin" : ""}
                  />{" "}
                  Refresh
                </button>
                <button
                  onClick={() => setShowTopupModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 py-3 text-xs font-black text-[#06132d] shadow-lg shadow-cyan-500/20 transition hover:brightness-110"
                >
                  <Plus size={16} /> Add Funds
                </button>
              </div>
            </div>

            {/* Balance Card */}
            <div className="mt-7 overflow-hidden rounded-3xl border border-blue-700/60 bg-[linear-gradient(112deg,#07184a_0%,#092d82_50%,#071c50_100%)] p-7 shadow-xl sm:p-9">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-cyan-300/15 p-3.5 text-cyan-200">
                    <Wallet size={32} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-200">
                      Available Balance
                    </p>
                    <p className="mt-1 text-4xl font-black tracking-tight text-white sm:text-5xl">
                      {formatDecimal(currentWalletBalance)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">
                    Currency: INR (₹)
                  </span>
                  <span className="text-[11px] text-blue-200/70">
                    Account ID: {profile?.id?.slice(0, 8) || "—"}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs text-blue-100/80">
                <p>
                  Use your wallet balance to instantly provision VPS servers
                  without per-order payment gateway delays.
                </p>
                <button
                  onClick={() => setShowTopupModal(true)}
                  className="inline-flex items-center gap-1.5 font-bold text-cyan-200 underline decoration-cyan-400/50 hover:text-white"
                >
                  Top-up ₹500, ₹1000 or custom amount <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {/* Transaction History */}
            <div className="mt-10">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold">
                  <History size={18} className="text-cyan-300" />
                  Transaction History
                </h3>
                <span className="text-xs text-slate-400">
                  {transactions.length} record
                  {transactions.length === 1 ? "" : "s"}
                </span>
              </div>

              {transactions.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-blue-900/70 bg-[#0b1531]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-blue-900/60 bg-[#06112c] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-5 py-3.5">Date & Time</th>
                          <th className="px-5 py-3.5">Type</th>
                          <th className="px-5 py-3.5">Description</th>
                          <th className="px-5 py-3.5">Reference</th>
                          <th className="px-5 py-3.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-900/40">
                        {transactions.map((tx) => {
                          const isCredit = tx.type === "CREDIT";
                          return (
                            <tr
                              key={tx.id}
                              className="transition hover:bg-white/[0.02]"
                            >
                              <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-400">
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
                                  className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                    isCredit
                                      ? "bg-emerald-400/10 text-emerald-300"
                                      : "bg-cyan-400/10 text-cyan-300"
                                  }`}
                                >
                                  {tx.type}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-xs font-medium text-slate-200">
                                {tx.description}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-[11px] font-mono text-slate-400">
                                {tx.reference || "—"}
                              </td>
                              <td
                                className={`whitespace-nowrap px-5 py-4 text-right text-sm font-bold ${
                                  isCredit
                                    ? "text-emerald-300"
                                    : "text-slate-100"
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
                <div className="mt-4 rounded-2xl border border-blue-900/60 bg-[#0b1531] p-10 text-center">
                  <Wallet
                    className="mx-auto text-slate-500 opacity-60"
                    size={36}
                  />
                  <h4 className="mt-3 text-sm font-bold text-slate-300">
                    No transactions yet
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">
                    Add funds to your wallet to get started with fast
                    deployments.
                  </p>
                  <button
                    onClick={() => setShowTopupModal(true)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-blue-800 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-blue-900/40"
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
                <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">
                  Billing History
                </p>
                <h1 className="mt-2 text-3xl font-black">Orders & Invoices</h1>
                <p className="mt-2 text-sm text-slate-400">
                  Review all your server purchases, renewal invoices and
                  provisioning statuses.
                </p>
              </div>
              <button
                onClick={fetchOrders}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-800 px-4 py-3 text-xs font-bold text-cyan-200 transition hover:bg-blue-900/40"
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
                      className="rounded-2xl border border-blue-900/70 bg-[#0b1531] p-5 sm:p-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-blue-900/60 pb-4">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-sm font-bold text-white">
                              {ord.orderNumber}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                isPaidOrActive
                                  ? "bg-emerald-400/10 text-emerald-300"
                                  : "bg-amber-400/10 text-amber-300"
                              }`}
                            >
                              {ord.status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            Placed on{" "}
                            {new Date(ord.createdAt).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            Total Paid
                          </p>
                          <p className="text-xl font-black text-cyan-200">
                            {formatDecimal(ord.amount, ord.currency)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            Plan & Specs
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-200">
                            {ord.planName}
                          </p>
                          <p className="text-xs text-slate-400">
                            {ord.plan
                              ? `${ord.plan.cpuCores ?? "—"} vCPU · ${ord.plan.ramGb ?? "—"}GB RAM · ${ord.plan.storageGb ?? "—"}GB SSD`
                              : ord.operatingSystem}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            OS / Environment
                          </p>
                          <p className="mt-1 text-sm text-slate-200">
                            {ord.operatingSystem}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            Server Status
                          </p>
                          {ord.vpsInstance ? (
                            <div className="mt-1">
                              <span className="font-mono text-xs font-semibold text-cyan-300">
                                IP: {ord.vpsInstance.ipAddress}
                              </span>
                              <span className="ml-2 inline-block rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                {ord.vpsInstance.status}
                              </span>
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-slate-400">
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
              <div className="mt-7 rounded-2xl border border-blue-900 bg-[#0b1531] p-12 text-center">
                <CreditCard className="mx-auto text-cyan-300" size={34} />
                <h3 className="mt-4 text-lg font-bold">No orders yet</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Deploy your first VPS cloud server from our available plans.
                </p>
                <button
                  onClick={() => go("Windows VPS")}
                  className="mt-5 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-[#06132d]"
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
            <div className="flex items-center justify-between border-b border-blue-900/60 pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">
                  Instant Cloud Deployment
                </p>
                <h1 className="mt-2 text-3xl font-black">VPS Checkout</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Configure server operating system and complete instant payment.
                </p>
              </div>
              <button
                type="button"
                onClick={() => go("Windows VPS")}
                className="rounded-xl border border-blue-800 px-4 py-2.5 text-xs font-bold text-slate-300 hover:border-cyan-300 hover:text-white"
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
                <div className="rounded-2xl border border-blue-900 bg-[#101e43] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">
                        Selected Plan
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-white">
                        {selectedPlan.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-cyan-300">
                          {formatDecimal(selectedPlan.price, selectedPlan.currency || "INR")}/month
                        </span>
                        {selectedPlan.isHostHeaven && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300">
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
                        className="rounded-lg border border-blue-700 bg-[#07122c] px-3 py-1.5 text-xs font-semibold text-cyan-200 outline-none focus:border-cyan-300"
                      >
                        {plans.map((pl) => (
                          <option key={pl.id} value={pl.id}>
                            {pl.name} - {formatDecimal(pl.price)}/month
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-blue-900/60 pt-4 text-xs text-slate-300 sm:grid-cols-4">
                    <span>{selectedPlan.cpuCores ?? "—"} vCPU</span>
                    <span>{selectedPlan.ramGb ?? "—"} GB RAM</span>
                    <span>{selectedPlan.storageGb ?? "—"} GB SSD</span>
                    <span>{selectedPlan.bandwidthGb ?? "—"} GB BW</span>
                  </div>
                </div>

                {/* Billing Duration Selector */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-slate-300">
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
                              ? "border-cyan-300 bg-cyan-300/10 text-white"
                              : "border-blue-900 bg-[#07122c] text-slate-300 hover:border-blue-700"
                          }`}
                        >
                          <p className="text-xs font-bold">{opt.label}</p>
                          <p className="mt-1 text-[11px] font-semibold text-cyan-300">
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
                      <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-300">
                        <Globe size={14} className="text-cyan-300" /> Deployment Zone
                      </label>
                      <select
                        value={selectedZoneId}
                        onChange={(e) => handleZoneChange(e.target.value)}
                        className="w-full rounded-xl border border-blue-800 bg-[#07122c] px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-300"
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
                    <label className="mb-2 block text-xs font-bold text-slate-300">
                      Select Operating System
                    </label>
                    <select
                      value={selectedOS}
                      onChange={(e) => setSelectedOS(e.target.value)}
                      className="w-full rounded-xl border border-blue-800 bg-[#07122c] px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-300"
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
                  <label className="mb-2 flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>Server Hostname</span>
                    <span className="text-[10px] font-normal text-slate-500">Optional</span>
                  </label>
                  <input
                    type="text"
                    value={customHostname}
                    onChange={(e) => setCustomHostname(e.target.value)}
                    placeholder="e.g. web01.myserver.com"
                    className="w-full rounded-xl border border-blue-800 bg-[#07122c] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-300"
                  />
                </div>

                {/* Payment Method Selector */}
                <div>
                  <p className="mb-3 text-xs font-bold text-slate-300">
                    Select Payment Method
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("WALLET")}
                      className={`rounded-xl border p-4 text-left transition ${
                        paymentMethod === "WALLET"
                          ? "border-cyan-300 bg-cyan-300/10"
                          : "border-blue-900 bg-[#07122c]"
                      }`}
                    >
                      <Wallet size={19} className="text-cyan-300" />
                      <p className="mt-2 text-sm font-bold">Wallet Pay</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Balance: {formatDecimal(currentWalletBalance)}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("RAZORPAY")}
                      className={`rounded-xl border p-4 text-left transition ${
                        paymentMethod === "RAZORPAY"
                          ? "border-cyan-300 bg-cyan-300/10"
                          : "border-blue-900 bg-[#07122c]"
                      }`}
                    >
                      <CreditCard size={19} className="text-cyan-300" />
                      <p className="mt-2 text-sm font-bold">Razorpay</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        UPI · Cards · Netbanking
                      </p>
                    </button>
                  </div>
                </div>

                {/* Balance validation */}
                {paymentMethod === "WALLET" && (
                  <div className="rounded-xl border border-blue-900/80 bg-[#07122c] p-3.5 text-xs">
                    {hasSufficientBalance ? (
                      <div className="flex items-center gap-2 text-emerald-300">
                        <CheckCircle2 size={16} />
                        <span>
                          Sufficient balance available. Remaining after order:{" "}
                          <strong>
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
                          className="rounded-lg bg-cyan-300/20 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-300/30"
                        >
                          Add Funds
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Price Breakdown */}
                <div className="rounded-2xl border border-blue-900 bg-[#101e43] p-5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Monthly Base Rate</span>
                    <span>
                      {formatDecimal(
                        selectedPlan.price,
                        selectedPlan.currency || "INR",
                      )}
                      /month
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>Billing Duration</span>
                    <span className="font-semibold text-slate-200">
                      {selectedMonths} Month{selectedMonths > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-blue-900/60 pt-3">
                    <span className="text-sm font-bold">Total Payable</span>
                    <span className="text-2xl font-black text-cyan-200">
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 py-4 text-sm font-black text-[#06132d] shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 py-4 text-sm font-black text-[#06132d] shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
                  >
                    {checkoutLoading ? (
                      <RefreshCw size={17} className="animate-spin" />
                    ) : (
                      <CreditCard size={17} />
                    )}
                    Proceed to Razorpay Checkout
                  </button>
                )}

                <p className="text-center text-[10px] text-slate-500">
                  Instant deployment upon payment. Server details will appear under My Servers.
                </p>
              </div>
            ) : plansLoading ? (
              <div className="mt-7 h-64 animate-pulse rounded-2xl border border-blue-900 bg-[#0b1531]" />
            ) : (
              <div className="mt-7 rounded-2xl border border-blue-900 bg-[#0b1531] p-12 text-center">
                <Server className="mx-auto text-cyan-300" size={34} />
                <h3 className="mt-4 text-lg font-bold">No plan selected</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Please choose a VPS plan to proceed with checkout.
                </p>
                <button
                  type="button"
                  onClick={() => go("Windows VPS")}
                  className="mt-5 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-[#06132d]"
                >
                  Browse VPS Plans
                </button>
              </div>
            )}
          </section>
        )}

        {/* Support Page */}
        {page === "Support" && (
          <section className="mx-auto max-w-3xl pt-12">
            <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">
              We are here to help
            </p>
            <h1 className="mt-2 text-3xl font-black">24/7 Customer Support</h1>
            <div className="mt-7 rounded-2xl border border-blue-900 bg-[#0b1531] p-7">
              <Headphones className="text-cyan-300" size={30} />
              <h3 className="mt-4 text-lg font-bold">
                Need help with your VPS or Wallet?
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Contact our support team for assistance with orders, wallet
                deposits, billing invoices and server operational management.
              </p>
              <a
                href="mailto:support@247hrservice.com"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-[#06132d]"
              >
                Contact Support <ArrowUpRight size={16} />
              </a>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-blue-900/50 bg-[#04091a]">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-4 px-4 py-7 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6 lg:px-10">
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
            <button onClick={() => go("Support")} className="hover:text-cyan-200">
              Contact
            </button>
            <button onClick={() => go("Wallet")} className="hover:text-cyan-200">
              Wallet
            </button>
            <button onClick={() => go("Orders")} className="hover:text-cyan-200">
              Orders
            </button>
            <button onClick={() => go("My VPS")} className="hover:text-cyan-200">
              My Servers
            </button>
          </div>
        </div>
      </footer>

      {/* Top-Up Wallet Modal */}
      {showTopupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#020617]/85 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowTopupModal(false);
          }}
        >
          <div className="my-auto w-full max-w-md overflow-hidden rounded-3xl border border-cyan-300/30 bg-[#0a1430] shadow-[0_25px_100px_rgba(0,0,0,.65)]">
            <div className="flex items-start justify-between border-b border-blue-900/70 px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-cyan-300">
                  Prepaid Balance
                </p>
                <h2 className="mt-1 text-2xl font-black">Top-Up Wallet</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Add funds via UPI, Cards, Netbanking or Razorpay.
                </p>
              </div>
              <button
                onClick={() => setShowTopupModal(false)}
                className="rounded-lg border border-blue-900 p-2 text-slate-400 hover:text-white"
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
              <div className="flex items-center justify-between rounded-xl border border-blue-900 bg-[#07122c] p-3 text-xs">
                <span className="text-slate-400">Current Balance:</span>
                <span className="font-bold text-cyan-200">
                  {formatDecimal(currentWalletBalance)}
                </span>
              </div>

              {/* Quick preset amounts */}
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-300">
                  Select Amount (INR)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[500, 1000, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTopupAmount(amt)}
                      className={`rounded-xl border py-2.5 text-xs font-bold transition ${
                        topupAmount === amt
                          ? "border-cyan-300 bg-cyan-300/15 text-cyan-200"
                          : "border-blue-900 bg-[#07122c] text-slate-300 hover:border-blue-700"
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom amount */}
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-300">
                  Or enter custom amount (Min. ₹100)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-sm font-bold text-slate-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="100"
                    max="100000"
                    step="100"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-blue-800 bg-[#07122c] py-3 pl-8 pr-4 text-sm font-bold text-white outline-none focus:border-cyan-300"
                  />
                </div>
              </div>

              <button
                disabled={topupLoading || topupAmount < 100}
                onClick={handleTopup}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 py-3.5 text-sm font-extrabold text-[#06132d] shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
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

              <p className="text-center text-[10px] text-slate-500">
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
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#020617]/85 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !checkoutLoading)
              setSelectedPlan(null);
          }}
        >
          <div className="my-auto w-full max-w-xl overflow-hidden rounded-3xl border border-cyan-300/30 bg-[#0a1430] shadow-[0_25px_100px_rgba(0,0,0,.65)]">
            <div className="flex items-start justify-between border-b border-blue-900/70 px-5 py-5 sm:px-7">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-cyan-300">
                  VPS Checkout
                </p>
                <h2 className="mt-1 text-2xl font-black">Complete Your Order</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Review server configuration and choose payment option.
                </p>
              </div>
              <button
                disabled={checkoutLoading}
                onClick={() => setSelectedPlan(null)}
                className="rounded-lg border border-blue-900 p-2 text-slate-400 hover:text-white disabled:opacity-50"
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
              <div className="rounded-2xl border border-blue-900 bg-[#101e43] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      Selected plan
                    </p>
                    <h3 className="mt-1 font-bold">{selectedPlan.name}</h3>
                    <p className="mt-0.5 text-xs font-semibold text-cyan-300">
                      {formatDecimal(selectedPlan.price, selectedPlan.currency || "INR")}/month
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-300">
                    Ready to Deploy
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-300 sm:grid-cols-4">
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
                    <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-300">
                      <Globe size={14} className="text-cyan-300" /> Deployment Zone
                    </label>
                    <select
                      value={selectedZoneId}
                      onChange={(e) => handleZoneChange(e.target.value)}
                      className="w-full rounded-xl border border-blue-800 bg-[#07122c] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
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
                  <label className="mb-2 block text-xs font-bold text-slate-300">
                    Select Operating System
                  </label>
                  <select
                    value={selectedOS}
                    onChange={(e) => setSelectedOS(e.target.value)}
                    className="w-full rounded-xl border border-blue-800 bg-[#07122c] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
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
                <p className="mb-3 text-xs font-bold text-slate-300">
                  Select Payment Method
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("WALLET")}
                    className={`rounded-xl border p-4 text-left transition ${
                      paymentMethod === "WALLET"
                        ? "border-cyan-300 bg-cyan-300/10"
                        : "border-blue-900 bg-[#07122c]"
                    }`}
                  >
                    <Wallet size={19} className="text-cyan-300" />
                    <p className="mt-2 text-sm font-bold">Wallet Pay</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Balance: {formatDecimal(currentWalletBalance)}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("RAZORPAY")}
                    className={`rounded-xl border p-4 text-left transition ${
                      paymentMethod === "RAZORPAY"
                        ? "border-cyan-300 bg-cyan-300/10"
                        : "border-blue-900 bg-[#07122c]"
                    }`}
                  >
                    <CreditCard size={19} className="text-cyan-300" />
                    <p className="mt-2 text-sm font-bold">Razorpay</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      UPI · Cards · Netbanking
                    </p>
                  </button>
                </div>
              </div>

              {/* Balance Check for Wallet */}
              {paymentMethod === "WALLET" && (
                <div className="rounded-xl border border-blue-900/80 bg-[#07122c] p-3 text-xs">
                  {hasSufficientBalance ? (
                    <div className="flex items-center gap-2 text-emerald-300">
                      <CheckCircle2 size={15} />
                      <span>
                        Sufficient balance available. Remaining after order:{" "}
                        <strong>
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
                        className="rounded-lg bg-cyan-300/20 px-3 py-1 text-xs font-bold text-cyan-200 hover:bg-cyan-300/30"
                      >
                        Add Funds
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Total Summary */}
              <div className="rounded-2xl border border-blue-900 bg-[#101e43] p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Plan price</span>
                  <span>
                    {formatDecimal(
                      selectedPlan.price,
                      selectedPlan.currency || "INR",
                    )}
                    /month
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-blue-900/60 pt-3">
                  <span className="text-sm font-bold">Total Payable</span>
                  <span className="text-2xl font-black text-cyan-200">
                    {formatDecimal(
                      selectedPlan.price,
                      selectedPlan.currency || "INR",
                    )}
                    <span className="ml-1 text-xs font-medium text-slate-400">
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 py-4 text-sm font-black text-[#06132d] shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 py-4 text-sm font-black text-[#06132d] shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
                >
                  {checkoutLoading ? (
                    <RefreshCw size={17} className="animate-spin" />
                  ) : (
                    <CreditCard size={17} />
                  )}
                  Proceed to Razorpay Checkout
                </button>
              )}

              <p className="text-center text-[10px] leading-5 text-slate-500">
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
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#020617]/85 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !renewalActionLoading) {
              setRenewalModalVpsId(null);
            }
          }}
        >
          <div className="my-auto w-full max-w-xl overflow-hidden rounded-3xl border border-blue-500/30 bg-[#0a1430] shadow-[0_25px_100px_rgba(0,0,0,.65)]">
            <div className="flex items-start justify-between border-b border-blue-900/70 px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-cyan-300">
                  Server Lifecycle
                </p>
                <h2 className="mt-1 text-2xl font-black">Auto-Renewal & Extension</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {renewalDetails ? `${renewalDetails.hostname || "VPS"} (${renewalDetails.ipAddress})` : "Loading details…"}
                </p>
              </div>
              <button
                disabled={renewalActionLoading}
                onClick={() => setRenewalModalVpsId(null)}
                className="rounded-lg border border-blue-900 p-2 text-slate-400 hover:text-white disabled:opacity-50"
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
                <p className="py-8 text-center text-sm text-slate-400">
                  <RefreshCw size={20} className="mx-auto animate-spin text-cyan-300 mb-2" />
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
                  <div className="grid grid-cols-2 gap-3 rounded-2xl border border-blue-900/60 bg-[#07122c] p-4 text-xs">
                    <div>
                      <span className="text-slate-400">Plan:</span>
                      <p className="mt-0.5 font-bold text-white text-sm">{renewalDetails.plan.name}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Duration:</span>
                      <p className="mt-0.5 font-bold text-white text-sm">{renewalDetails.plan.durationDays} Days</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Current Expiry:</span>
                      <p className="mt-0.5 font-bold text-cyan-200">
                        {renewalDetails.expiresAt ? new Date(renewalDetails.expiresAt).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Renewal Price:</span>
                      <p className="mt-0.5 font-bold text-emerald-300 text-sm">
                        ₹{renewalDetails.plan.renewalPrice}
                      </p>
                    </div>
                  </div>

                  {/* Auto-Renewal Consent Box */}
                  <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-white flex items-center gap-2">
                          <RefreshCw size={14} className="text-cyan-300" /> Automatic Wallet Renewal
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {renewalDetails.autoRenew
                            ? `Active (Consent recorded on ${renewalDetails.autoRenewConsentAt ? new Date(renewalDetails.autoRenewConsentAt).toLocaleDateString() : "N/A"})`
                            : "Disabled. Existing instances remain opted out until explicit consent."}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          renewalDetails.autoRenew
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                            : "bg-slate-700 text-slate-400"
                        }`}
                      >
                        {renewalDetails.autoRenew ? "ENABLED" : "DISABLED"}
                      </span>
                    </div>

                    {!renewalDetails.autoRenew ? (
                      <div className="space-y-3 pt-2 border-t border-blue-900/40">
                        <label className="flex items-start gap-2.5 cursor-pointer text-[11px] text-slate-300">
                          <input
                            type="checkbox"
                            checked={renewalConsentChecked}
                            onChange={(e) => setRenewalConsentChecked(e.target.checked)}
                            className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                          />
                          <span>
                            I give my <strong>explicit customer consent</strong> authorizing 24/7 VPS to automatically deduct <strong>₹{renewalDetails.plan.renewalPrice}</strong> from my available wallet balance prior to expiry to renew this server for {renewalDetails.plan.durationDays} days.
                          </span>
                        </label>
                        <button
                          disabled={!renewalConsentChecked || renewalActionLoading}
                          onClick={() => handleToggleAutoRenew(true)}
                          className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-40"
                        >
                          {renewalActionLoading ? "Saving Consent…" : "Enable Auto-Renewal with Consent"}
                        </button>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-blue-900/40 flex items-center justify-between">
                        <p className="text-[11px] text-slate-400">
                          Next attempt:{" "}
                          <strong className="text-white">
                            {renewalDetails.nextRenewalAttempt
                              ? new Date(renewalDetails.nextRenewalAttempt).toLocaleDateString()
                              : "Prior to expiry"}
                          </strong>
                        </p>
                        <button
                          disabled={renewalActionLoading}
                          onClick={() => handleToggleAutoRenew(false)}
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          Disable Auto-Renewal
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Wallet Balance & Insufficient Warning */}
                  <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Wallet size={14} className="text-cyan-300" /> Wallet Balance:
                      </span>
                      <span className="font-bold text-white text-sm">
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
                          className="w-full rounded-lg bg-amber-500 py-2 text-center text-xs font-bold text-[#02101e] hover:bg-amber-400 transition"
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
                    <div className="rounded-xl border border-blue-900/40 bg-[#07122c]/50 p-3 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">Last Renewal Result:</span>{" "}
                      <span
                        className={`font-bold ${
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

                  {/* Manual Renewal Action */}
                  <div className="pt-2">
                    <button
                      disabled={!renewalDetails.isBalanceSufficient || renewalActionLoading}
                      onClick={handleManualRenew}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 py-3.5 text-xs font-extrabold text-[#021511] transition hover:brightness-110 disabled:opacity-40"
                    >
                      {renewalActionLoading ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : (
                        <Zap size={15} />
                      )}
                      Renew Server Immediately (₹{renewalDetails.plan.renewalPrice} via Wallet)
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
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#020617]/85 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !manageActionLoading) {
              setManageModalVps(null);
            }
          }}
        >
          <div className="my-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#0a1430] shadow-[0_25px_100px_rgba(0,0,0,.65)]">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-blue-900/70 px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[.22em] text-cyan-300">
                    HostHeaven Infrastructure
                  </p>
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
                    UserSide API
                  </span>
                </div>
                <h2 className="mt-1 text-2xl font-black">
                  Server Management & Metrics
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {manageModalVps.hostname || "VPS Server"} · {manageModalVps.ipAddress}
                </p>
              </div>
              <button
                disabled={manageActionLoading}
                onClick={() => setManageModalVps(null)}
                className="rounded-lg border border-blue-900 p-2 text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-blue-900/60 bg-[#07122c] px-6 text-xs font-bold text-slate-400">
              <button
                onClick={() => setManageTab("overview")}
                className={`py-3 px-3 border-b-2 transition ${
                  manageTab === "overview"
                    ? "border-cyan-300 text-cyan-300"
                    : "border-transparent hover:text-white"
                }`}
              >
                Overview & Power
              </button>
              <button
                onClick={() => setManageTab("metrics")}
                className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  manageTab === "metrics"
                    ? "border-cyan-300 text-cyan-300"
                    : "border-transparent hover:text-white"
                }`}
              >
                <Activity size={13} /> Resource Metrics
              </button>
              <button
                onClick={() => setManageTab("storage")}
                className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  manageTab === "storage"
                    ? "border-cyan-300 text-cyan-300"
                    : "border-transparent hover:text-white"
                }`}
              >
                <HardDrive size={13} /> Storage Drives
              </button>
              <button
                onClick={() => setManageTab("password")}
                className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  manageTab === "password"
                    ? "border-cyan-300 text-cyan-300"
                    : "border-transparent hover:text-white"
                }`}
              >
                <KeyRound size={13} /> Password
              </button>
              <button
                onClick={() => setManageTab("rebuild")}
                className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  manageTab === "rebuild"
                    ? "border-cyan-300 text-cyan-300"
                    : "border-transparent hover:text-white"
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
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="mx-auto mb-3 animate-spin text-cyan-300" />
                  Fetching live telemetry from HostHeaven...
                </div>
              ) : (
                <>
                  {/* TAB: OVERVIEW & POWER CONTROLS */}
                  {manageTab === "overview" && (
                    <div className="space-y-5">
                      {/* Telemetry info cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-3.5">
                          <p className="text-[10px] text-slate-500 uppercase">Proxmox VMID</p>
                          <p className="mt-1 font-mono font-bold text-white">
                            {manageDetails?.proxmoxVmid || "101"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-3.5">
                          <p className="text-[10px] text-slate-500 uppercase">Cluster Node</p>
                          <p className="mt-1 font-mono font-bold text-white">
                            {manageDetails?.serverId || "node-in-del-01"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-3.5">
                          <p className="text-[10px] text-slate-500 uppercase">Provider Status</p>
                          <p className="mt-1 font-bold text-emerald-400">
                            {manageDetails?.status || manageModalVps.status}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-3.5">
                          <p className="text-[10px] text-slate-500 uppercase">Lock Status</p>
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
                      <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-5">
                        <h4 className="font-bold text-sm text-slate-200 mb-3">
                          Server Power Actions
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("start")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                          >
                            <Zap size={14} /> Start Server
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("stop")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2.5 text-xs font-bold text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                          >
                            <Power size={14} /> Stop Server
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("reboot")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 px-3 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50"
                          >
                            <RefreshCw size={14} /> Reboot Server
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("pause")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-slate-800/80 border border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                          >
                            Pause Server
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("hibernate")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-slate-800/80 border border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                          >
                            Hibernate
                          </button>
                          <button
                            disabled={manageActionLoading}
                            onClick={() => handleHostHeavenPowerAction("resume")}
                            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-950/60 border border-cyan-800/60 px-3 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-900/70 disabled:opacity-50"
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
                      <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-4 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-300 flex items-center gap-1.5">
                            <Cpu size={15} className="text-cyan-300" /> CPU Utilization:
                          </span>
                          <span className="font-mono font-bold text-cyan-300 text-sm">
                            {manageMetrics?.cpu?.usagePercent ?? 18}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-cyan-400 h-2.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, manageMetrics?.cpu?.usagePercent ?? 18)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Memory Usage Card */}
                      <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-4 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-300 flex items-center gap-1.5">
                            <Server size={15} className="text-purple-300" /> Memory (RAM):
                          </span>
                          <span className="font-mono font-bold text-purple-300 text-sm">
                            {manageMetrics?.ram?.usedMb ?? 1420} MB / {manageMetrics?.ram?.totalMb ?? 4096} MB ({manageMetrics?.ram?.usagePercent ?? 34}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-purple-400 h-2.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, manageMetrics?.ram?.usagePercent ?? 34)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Network & Disk IO */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-4">
                          <p className="text-slate-400 font-bold mb-2">Network Traffic</p>
                          <p className="text-slate-300">
                            RX: <span className="font-mono font-bold text-white">{(Number(manageMetrics?.network?.rxBytes || 154203940) / 1024 / 1024).toFixed(1)} MB</span>
                          </p>
                          <p className="text-slate-300 mt-1">
                            TX: <span className="font-mono font-bold text-white">{(Number(manageMetrics?.network?.txBytes || 89421040) / 1024 / 1024).toFixed(1)} MB</span>
                          </p>
                        </div>
                        <div className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-4">
                          <p className="text-slate-400 font-bold mb-2">Disk I/O</p>
                          <p className="text-slate-300">
                            Read: <span className="font-mono font-bold text-white">{(Number(manageMetrics?.disk?.readBytes || 42109400) / 1024 / 1024).toFixed(1)} MB</span>
                          </p>
                          <p className="text-slate-300 mt-1">
                            Write: <span className="font-mono font-bold text-white">{(Number(manageMetrics?.disk?.writeBytes || 19482010) / 1024 / 1024).toFixed(1)} MB</span>
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
                          className="rounded-2xl border border-blue-900/60 bg-[#07122c] p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white">
                              Mount: <span className="font-mono text-cyan-300">{drive.mountPoint}</span> ({drive.fsType})
                            </span>
                            <span className="text-slate-300 font-mono">
                              {drive.usedGb} GB / {drive.totalGb} GB ({drive.usagePercentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-blue-400 h-2 rounded-full"
                              style={{ width: `${Math.min(100, drive.usagePercentage)}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Free Space: {drive.freeGb} GB available
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TAB: PASSWORD CHANGE */}
                  {manageTab === "password" && (
                    <div className="space-y-4 rounded-2xl border border-blue-900/60 bg-[#07122c] p-5 text-xs">
                      <div>
                        <h4 className="font-bold text-sm text-slate-200">
                          Reset Root / Administrator Password
                        </h4>
                        <p className="text-slate-400 mt-1">
                          Set a secure password for SSH / RDP console access.
                        </p>
                      </div>
                      <div>
                        <label className="block mb-2 font-bold text-slate-300">
                          New Password (minimum 8 characters)
                        </label>
                        <input
                          type="password"
                          value={newVmPassword}
                          onChange={(e) => setNewVmPassword(e.target.value)}
                          placeholder="Enter new strong password"
                          className="w-full rounded-xl border border-blue-800 bg-[#0b1531] p-3 text-sm text-white outline-none focus:border-cyan-300"
                        />
                      </div>
                      <button
                        disabled={manageActionLoading || newVmPassword.length < 8}
                        onClick={handleChangePassword}
                        className="rounded-xl bg-cyan-300 px-5 py-3 text-xs font-extrabold text-[#06132d] hover:brightness-110 disabled:opacity-50"
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
                        <label className="block mb-2 font-bold text-slate-300">
                          Select Operating System ISO
                        </label>
                        <select
                          value={selectedRebuildIso}
                          onChange={(e) => setSelectedRebuildIso(e.target.value)}
                          className="w-full rounded-xl border border-blue-800 bg-[#07122c] p-3 text-sm text-white outline-none focus:border-cyan-300"
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
                        className="rounded-xl bg-red-600 px-5 py-3 text-xs font-extrabold text-white hover:bg-red-500 disabled:opacity-50"
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
