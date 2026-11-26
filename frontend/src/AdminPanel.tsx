import { useEffect, useState, type FormEvent } from "react";
import {
  LayoutDashboard, Users, Server,
  ShieldCheck, LogOut, RefreshCw, Menu, X,
  Search, ChevronLeft, ChevronRight, Eye, EyeOff, Power, Mail, Calendar, Package,
  Network, Activity, Cloud, Headphones, CreditCard,
} from "lucide-react";
import adminApi from "./adminApi";
import AdminPlans from "./AdminPlans";
import Providers from "./admin/Providers";
import PlanProviderMapping from "./admin/PlanProviderMapping";
import Provisioning from "./admin/Provisioning";
import RenewalLifecycle from "./admin/RenewalLifecycle";
import HostHeavenMapping from "./admin/HostHeavenMapping";
import DedicatedIpCatalogue from "./admin/DedicatedIpCatalogue";
import AdminSupportDesk from "./admin/AdminSupportDesk";
import SupportContact from "./admin/SupportContact";
import AdminPayments from "./admin/AdminPayments";

type Stats = {
  totalCustomers: number;
  totalVps: number;
  activeVps: number;
  pendingVps: number;
  totalAdmins: number;
};

type Customer = {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  _count: { vpsInstances: number };
};

type CustomerDetails = {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  vpsInstances: {
    id: string;
    provider: string;
    ipAddress: string;
    hostname: string | null;
    operatingSystem: string | null;
    ram: number | null;
    status: string;
    expiresAt: string | null;
  }[];
};

type VpsRecord = {
  id: string;
  userId: string;
  provider: string;
  providerVpsId: string | null;
  ipAddress: string;
  hostname: string | null;
  operatingSystem: string | null;
  ram: number | null;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
};

type VpsStats = {
  total: number;
  running: number;
  stopped: number;
  pending: number;
  expired: number;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default function AdminPanel() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("admin_token") || ""
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [admin, setAdmin] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [page, setPage] = useState("Dashboard");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerStats, setCustomerStats] = useState({
    total: 0, active: 0, inactive: 0,
  });
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerDetails | null>(null);
  const [actionLoading, setActionLoading] = useState("");

  const [vpsInstances, setVpsInstances] = useState<VpsRecord[]>([]);
  const [vpsStats, setVpsStats] = useState<VpsStats | null>(null);
  const [vpsSearchInput, setVpsSearchInput] = useState("");
  const [vpsSearch, setVpsSearch] = useState("");
  const [vpsStatus, setVpsStatus] = useState("");
  const [vpsProvider, setVpsProvider] = useState("");
  const [vpsPage, setVpsPage] = useState(1);
  const [vpsTotalPages, setVpsTotalPages] = useState(1);
  const [vpsLoading, setVpsLoading] = useState(false);
  const [selectedVps, setSelectedVps] = useState<VpsRecord | null>(null);

  const logout = () => {
    sessionStorage.removeItem("admin_token");
    setToken("");
    setStats(null);
    setAdmin(null);
    setCustomers([]);
    setSelectedCustomer(null);
  };

  const loadDashboard = async () => {
    try {
      const [profile, dashboard] = await Promise.all([
        adminApi.get("/admin-auth/profile"),
        adminApi.get("/admin/dashboard/stats"),
      ]);
      setAdmin(profile.data);
      setStats(dashboard.data);
      setError("");
    } catch (err: any) {
      if ([401, 403].includes(err.response?.status)) logout();
      else setError(err.response?.data?.message || "Dashboard load failed.");
    }
  };

  const loadCustomers = async () => {
    setCustomerLoading(true);
    try {
      const [listResponse, statsResponse] = await Promise.all([
        adminApi.get("/admin/customers", {
          params: { search, page: currentPage, limit: 10 },
        }),
        adminApi.get("/admin/customers/stats"),
      ]);

      setCustomers(listResponse.data.customers);
      setTotalPages(Math.max(1, listResponse.data.pagination.totalPages));
      setCustomerStats(statsResponse.data);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to load customers.");
    } finally {
      setCustomerLoading(false);
    }
  };

  const loadVps = async () => {
    setVpsLoading(true);
    try {
      const [listResponse, statsResponse] = await Promise.all([
        adminApi.get("/admin/vps", {
          params: {
            search: vpsSearch || undefined,
            status: vpsStatus || undefined,
            provider: vpsProvider || undefined,
            page: vpsPage,
            limit: 10,
          },
        }),
        adminApi.get("/admin/vps/stats"),
      ]);

      setVpsInstances(listResponse.data.vpsInstances || []);
      setVpsTotalPages(
        Math.max(1, listResponse.data.pagination?.totalPages || 1)
      );
      setVpsStats(statsResponse.data);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to load VPS instances.");
    } finally {
      setVpsLoading(false);
    }
  };

  const openVps = async (id: string) => {
    try {
      const response = await adminApi.get(`/admin/vps/${id}`);
      setSelectedVps(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to load VPS details.");
    }
  };

  useEffect(() => {
    if (token) loadDashboard();
  }, [token]);

  useEffect(() => {
    if (token) loadCustomers();
  }, [token, search, currentPage]);

  useEffect(() => {
    if (token) loadVps();
  }, [token, vpsSearch, vpsStatus, vpsProvider, vpsPage]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await adminApi.post("/admin-auth/login", {
        email, password,
      });
      const receivedToken = response.data?.token;
      if (!receivedToken) throw new Error("Token not received from server.");

      sessionStorage.setItem("admin_token", receivedToken);
      setToken(receivedToken);
      setPassword("");
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const openCustomer = async (id: string) => {
    try {
      setActionLoading(id);
      const response = await adminApi.get(`/admin/customers/${id}`);
      setSelectedCustomer(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to load customer.");
    } finally {
      setActionLoading("");
    }
  };

  const toggleCustomer = async (customer: Customer) => {
    const action = customer.isActive ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${action} this customer?`)) {
      return;
    }

    try {
      setActionLoading(customer.id);
      await adminApi.patch(`/admin/customers/${customer.id}/status`, {
        isActive: !customer.isActive,
      });
      await loadCustomers();

      if (selectedCustomer?.id === customer.id) {
        const response = await adminApi.get(`/admin/customers/${customer.id}`);
        setSelectedCustomer(response.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Status update failed.");
    } finally {
      setActionLoading("");
    }
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    setSearch(searchInput.trim());
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#171717] px-4 text-[#F1E9DA]">
        <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[#C6A66B]/30 bg-[#201d1a] p-8 shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#C6A66B] to-transparent" />
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-black tracking-tight text-[#F1E9DA]">
              24<span className="text-[#C6A66B]">/7</span>
            </h1>
            <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[3px] text-[#C6A66B]">
              Admin Control Center
            </p>
          </div>

          <h2 className="mb-6 font-serif text-2xl font-bold text-[#F1E9DA]">
            Admin Sign In
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="mb-2 block font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 outline-none focus:border-[#C6A66B] transition"
              />
            </div>

            <div>
              <label className="mb-2 block font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full rounded-xl border border-[#332f2a] bg-[#171717] py-3 pl-4 pr-12 text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 outline-none focus:border-[#C6A66B] transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-[#F1E9DA]/40 hover:text-[#C6A66B] transition"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#C6A66B] py-3.5 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/15 transition hover:bg-[#d8ba82] disabled:opacity-50"
            >
              {loading ? "Authenticating..." : "Access Control Center"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const links = [
    ["Dashboard", LayoutDashboard],
    ["Customers", Users],
    ["VPS Management", Server],
    ["Payments & Billing", CreditCard],
    ["Support Desk", Headphones],
    ["Providers", Network],
    ["Dedicated IP Catalogue", Package],
    ["HostHeaven Mappings", Cloud],
    ["Plan Provider Mapping", Network],
    ["Provisioning", Activity],
    ["Auto-Renewal & Lifecycle", RefreshCw],
    ["Plans", Package],
    ["Support & Contact", Headphones],
  ] as const;

  const cards = [
    ["Total Customers", stats?.totalCustomers, Users],
    ["Total VPS", stats?.totalVps, Server],
    ["Active VPS", stats?.activeVps, ShieldCheck],
    ["Pending VPS", stats?.pendingVps, RefreshCw],
    ["Total Admins", stats?.totalAdmins, Users],
  ] as const;

  return (
    <div className="min-h-screen bg-[#171717] text-[#F1E9DA]">
      {menuOpen && (
        <button
          aria-label="Close menu overlay"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-[#171717]/80 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden border-r border-[#332f2a] bg-[#201d1a] p-5 transition-transform lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between border-b border-[#332f2a] pb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#F1E9DA]">
              24<span className="text-[#C6A66B]">/7</span>
            </h1>
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#C6A66B]">
              Admin Control Center
            </p>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="rounded-lg p-1 text-[#F1E9DA]/50 hover:text-[#F1E9DA] lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-4 pr-1">
          {links.map(([label, Icon]) => {
            const isActive = page === label;
            return (
              <button
                key={label}
                onClick={() => {
                  setPage(label);
                  setMenuOpen(false);
                  setError("");
                  setSelectedCustomer(null);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-semibold transition ${
                  isActive
                    ? "bg-[#C6A66B] text-[#171717] shadow-lg shadow-[#C6A66B]/15"
                    : "text-[#F1E9DA]/70 hover:bg-[#292521] hover:text-[#F1E9DA]"
                }`}
              >
                <Icon size={17} className={isActive ? "text-[#171717]" : "text-[#C6A66B]"} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={logout}
          className="mt-3 flex w-full shrink-0 items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-3 text-xs font-bold text-red-400 hover:bg-red-500/10 transition"
        >
          <LogOut size={16} /> Sign Out
        </button>
      </aside>

      <main className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 flex min-h-20 items-center justify-between gap-3 border-b border-[#332f2a] bg-[#171717]/95 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-lg border border-[#332f2a] p-2 text-[#F1E9DA]/70 hover:bg-[#201d1a] lg:hidden"
            >
              <Menu size={18} />
            </button>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#F1E9DA] sm:text-xl">
                {page === "Dashboard" ? "Dashboard Overview" : page}
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                24/7 Hosting Administration
              </p>
            </div>
          </div>
          <button
            onClick={
              page === "Customers"
                ? loadCustomers
                : page === "VPS Management"
                ? loadVps
                : loadDashboard
            }
            className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-3.5 py-2 font-mono text-xs font-bold text-[#C6A66B] hover:border-[#C6A66B]/50 hover:bg-[#292521] transition"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </header>

        <section className="p-5 sm:p-8">
          {error && (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-300">
              <div className="flex items-center gap-3">
                <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError("")} className="rounded p-1 text-[#F1E9DA]/50 hover:text-[#F1E9DA]"><X size={16} /></button>
            </div>
          )}

          {page === "Dashboard" && (
            <>
              <div className="mb-8">
                <h1 className="font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">
                  Welcome back, <span className="text-[#C6A66B]">{admin?.name || "Admin"}</span>
                </h1>
                <p className="mt-1 font-mono text-xs text-[#F1E9DA]/50">{admin?.email}</p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map(([label, value, Icon]) => (
                  <div key={label} className="group relative overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 transition-all hover:border-[#C6A66B]/50 hover:bg-[#25221e]">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">{label}</p>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#332f2a] bg-[#171717] text-[#C6A66B] transition group-hover:border-[#C6A66B]/40 group-hover:bg-[#C6A66B]/10">
                        <Icon size={18} />
                      </div>
                    </div>
                    <p className="mt-5 font-serif text-3xl font-bold tracking-tight text-[#F1E9DA]">{value ?? "—"}</p>
                    <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-[#F1E9DA]/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#C6A66B]" />
                      <span>Live database count</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {page === "Customers" && (
            <>
              <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h1 className="font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">Customer Management</h1>
                  <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">View, audit, and manage registered client accounts.</p>
                </div>
              </div>

              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                {[
                  ["Total Customers", customerStats.total, Users],
                  ["Active Customers", customerStats.active, ShieldCheck],
                  ["Inactive Customers", customerStats.inactive, Power],
                ].map(([label, value, Icon]: any) => (
                  <div key={label} className="rounded-xl border border-[#332f2a] bg-[#201d1a] p-5">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">{label}</p>
                      <Icon size={18} className="text-[#C6A66B]" />
                    </div>
                    <p className="mt-4 font-serif text-3xl font-bold text-[#F1E9DA]">{value}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSearch} className="mb-6 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-3.5 text-[#F1E9DA]/40" size={18} />
                  <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search customer by name or email..."
                    className="w-full rounded-xl border border-[#332f2a] bg-[#201d1a] py-3 pl-11 pr-4 font-sans text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 outline-none transition focus:border-[#C6A66B] focus:ring-1 focus:ring-[#C6A66B]"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-[#C6A66B] px-7 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d]"
                >
                  Search
                </button>
              </form>

              <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
                <div className="flex items-center justify-between border-b border-[#332f2a] px-6 py-4">
                  <h3 className="font-serif text-base font-bold text-[#F1E9DA]">Client Roster</h3>
                  <span className="font-mono text-xs text-[#F1E9DA]/50">{customerStats.total} registered</span>
                </div>

                {customerLoading ? (
                  <div className="p-16 text-center text-[#F1E9DA]/50 font-mono text-xs">
                    <RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]" size={22} />
                    Retrieving customer records...
                  </div>
                ) : customers.length === 0 ? (
                  <div className="p-16 text-center text-[#F1E9DA]/50 font-mono text-xs">
                    <Users className="mx-auto mb-3 text-[#F1E9DA]/30" size={32} />
                    No customers found matching search criteria.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-sans text-sm">
                      <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                        <tr>
                          <th className="px-6 py-4">Customer</th>
                          <th className="px-6 py-4">VPS Count</th>
                          <th className="px-6 py-4">Registered</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#332f2a]">
                        {customers.map(customer => (
                          <tr key={customer.id} className="transition hover:bg-[#292521]/60">
                            <td className="px-6 py-4">
                              <p className="font-medium text-[#F1E9DA]">{customer.name || "Unnamed Client"}</p>
                              <p className="mt-0.5 font-mono text-xs text-[#F1E9DA]/50">{customer.email}</p>
                            </td>
                            <td className="px-6 py-4 font-mono text-sm text-[#F1E9DA]">{customer._count.vpsInstances}</td>
                            <td className="px-6 py-4 font-mono text-xs text-[#F1E9DA]/60">{formatDate(customer.createdAt)}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
                                customer.isActive
                                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : "border border-red-500/30 bg-red-500/10 text-red-400"
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${customer.isActive ? "bg-emerald-400" : "bg-red-400"}`} />
                                {customer.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  title="View details"
                                  onClick={() => openCustomer(customer.id)}
                                  disabled={actionLoading === customer.id}
                                  className="rounded-lg border border-[#332f2a] bg-[#171717] p-2 text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521] disabled:opacity-40"
                                >
                                  <Eye size={15} />
                                </button>
                                <button
                                  title={customer.isActive ? "Deactivate" : "Activate"}
                                  onClick={() => toggleCustomer(customer)}
                                  disabled={actionLoading === customer.id}
                                  className={`rounded-lg border border-[#332f2a] bg-[#171717] p-2 transition disabled:opacity-40 ${
                                    customer.isActive
                                      ? "text-red-400 hover:border-red-500/40 hover:bg-red-950/20"
                                      : "text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-950/20"
                                  }`}
                                >
                                  <Power size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[#332f2a] px-6 py-4">
                  <p className="font-mono text-xs text-[#F1E9DA]/50">Page {currentPage} of {totalPages}</p>
                  <div className="flex gap-2">
                    <button
                      disabled={currentPage <= 1 || customerLoading}
                      onClick={() => setCurrentPage(p => p - 1)}
                      className="rounded-lg border border-[#332f2a] bg-[#171717] p-2 text-[#F1E9DA]/70 transition hover:bg-[#292521] hover:text-[#F1E9DA] disabled:opacity-30"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      disabled={currentPage >= totalPages || customerLoading}
                      onClick={() => setCurrentPage(p => p + 1)}
                      className="rounded-lg border border-[#332f2a] bg-[#171717] p-2 text-[#F1E9DA]/70 transition hover:bg-[#292521] hover:text-[#F1E9DA] disabled:opacity-30"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {page === "VPS Management" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">VPS Management</h2>
                <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">
                  Monitor, query, and inspect customer server deployments.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                {[
                  ["Total VPS", vpsStats?.total ?? 0],
                  ["Running", vpsStats?.running ?? 0],
                  ["Stopped", vpsStats?.stopped ?? 0],
                  ["Pending", vpsStats?.pending ?? 0],
                  ["Expired", vpsStats?.expired ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[#332f2a] bg-[#201d1a] p-5">
                    <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">{label}</p>
                    <p className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row">
                  <div className="flex flex-1 gap-2">
                    <input
                      value={vpsSearchInput}
                      onChange={e => setVpsSearchInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          setVpsPage(1);
                          setVpsSearch(vpsSearchInput);
                        }
                      }}
                      placeholder="Search IP, hostname, customer name or email..."
                      className="min-w-0 flex-1 rounded-xl border border-[#332f2a] bg-[#171717] p-3 font-sans text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 outline-none transition focus:border-[#C6A66B]"
                    />
                    <button
                      onClick={() => {
                        setVpsPage(1);
                        setVpsSearch(vpsSearchInput);
                      }}
                      className="rounded-xl bg-[#C6A66B] px-5 text-xs font-mono font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d]"
                    >
                      Search
                    </button>
                  </div>

                  <select
                    value={vpsStatus}
                    onChange={e => {
                      setVpsPage(1);
                      setVpsStatus(e.target.value);
                    }}
                    className="rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 font-mono text-xs text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
                  >
                    <option value="">All statuses</option>
                    <option value="RUNNING">Running</option>
                    <option value="STOPPED">Stopped</option>
                    <option value="PENDING">Pending</option>
                  </select>

                  <select
                    value={vpsProvider}
                    onChange={e => {
                      setVpsPage(1);
                      setVpsProvider(e.target.value);
                    }}
                    className="rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 font-mono text-xs text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
                  >
                    <option value="">All providers</option>
                    <option value="SMARTVPS">SMARTVPS</option>
                  </select>
                </div>

                {vpsLoading ? (
                  <div className="p-16 text-center text-[#F1E9DA]/50 font-mono text-xs">
                    <RefreshCw className="mx-auto mb-3 animate-spin text-[#C6A66B]" size={22} />
                    Loading VPS instances...
                  </div>
                ) : vpsInstances.length === 0 ? (
                  <div className="p-16 text-center text-[#F1E9DA]/50 font-mono text-xs">
                    <Server className="mx-auto mb-3 text-[#F1E9DA]/30" size={34} />
                    No VPS instances found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-left font-sans text-sm">
                      <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                        <tr>
                          <th className="px-5 py-4">IP Address</th>
                          <th className="px-5 py-4">Customer</th>
                          <th className="px-5 py-4">Provider</th>
                          <th className="px-5 py-4">OS</th>
                          <th className="px-5 py-4">RAM</th>
                          <th className="px-5 py-4">Status</th>
                          <th className="px-5 py-4">Expiry</th>
                          <th className="px-5 py-4">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#332f2a]">
                        {vpsInstances.map(vps => (
                          <tr key={vps.id} className="transition hover:bg-[#292521]/60">
                            <td className="px-5 py-4 font-mono text-sm font-semibold text-[#C6A66B]">{vps.ipAddress}</td>
                            <td className="px-5 py-4">
                              <p className="font-medium text-[#F1E9DA]">{vps.user?.name || "Unnamed Client"}</p>
                              <p className="font-mono text-xs text-[#F1E9DA]/50">{vps.user?.email}</p>
                            </td>
                            <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">{vps.provider}</td>
                            <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">{vps.operatingSystem || "—"}</td>
                            <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/70">{vps.ram ? `${vps.ram} GB` : "—"}</td>
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
                                vps.status === "RUNNING"
                                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : vps.status === "STOPPED"
                                  ? "border border-[#332f2a] bg-[#171717] text-[#F1E9DA]/50"
                                  : "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${
                                  vps.status === "RUNNING"
                                    ? "bg-emerald-400"
                                    : vps.status === "STOPPED"
                                    ? "bg-[#F1E9DA]/40"
                                    : "bg-amber-400"
                                }`} />
                                {vps.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/60">
                              {vps.expiresAt ? formatDate(vps.expiresAt) : "—"}
                            </td>
                            <td className="px-5 py-4">
                              <button
                                onClick={() => openVps(vps.id)}
                                className="flex items-center gap-1.5 rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-xs text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521]"
                              >
                                <Eye size={13} /> View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-between border-t border-[#332f2a] pt-4">
                  <p className="font-mono text-xs text-[#F1E9DA]/50">
                    Page {vpsPage} of {vpsTotalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={vpsPage <= 1 || vpsLoading}
                      onClick={() => setVpsPage(p => p - 1)}
                      className="rounded-lg border border-[#332f2a] bg-[#171717] p-2 text-[#F1E9DA]/70 transition hover:bg-[#292521] hover:text-[#F1E9DA] disabled:opacity-30"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      disabled={vpsPage >= vpsTotalPages || vpsLoading}
                      onClick={() => setVpsPage(p => p + 1)}
                      className="rounded-lg border border-[#332f2a] bg-[#171717] p-2 text-[#F1E9DA]/70 transition hover:bg-[#292521] hover:text-[#F1E9DA] disabled:opacity-30"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: page === "Payments & Billing" ? "block" : "none" }}><AdminPayments /></div>
          <div style={{ display: page === "Support Desk" ? "block" : "none" }}><AdminSupportDesk /></div>
          <div style={{ display: page === "Plans" ? "block" : "none" }}><AdminPlans /></div>
          <div style={{ display: page === "Providers" ? "block" : "none" }}><Providers /></div>
          <div style={{ display: page === "Dedicated IP Catalogue" ? "block" : "none" }}><DedicatedIpCatalogue /></div>
          <div style={{ display: page === "HostHeaven Mappings" ? "block" : "none" }}><HostHeavenMapping /></div>
          <div style={{ display: page === "Plan Provider Mapping" ? "block" : "none" }}><PlanProviderMapping /></div>
          <div style={{ display: page === "Provisioning" ? "block" : "none" }}><Provisioning /></div>
          <div style={{ display: page === "Auto-Renewal & Lifecycle" ? "block" : "none" }}><RenewalLifecycle /></div>
          <div style={{ display: page === "Support & Contact" ? "block" : "none" }}><SupportContact /></div>
        </section>
      </main>

      {selectedVps && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedVps(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between border-b border-[#332f2a] pb-4">
              <div>
                <h2 className="font-serif text-xl font-bold text-[#F1E9DA]">VPS Instance Details</h2>
                <p className="font-mono text-xs text-[#C6A66B]">{selectedVps.ipAddress}</p>
              </div>
              <button onClick={() => setSelectedVps(null)} className="rounded-lg p-1.5 text-[#F1E9DA]/50 hover:bg-[#171717] hover:text-[#F1E9DA]"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {[
                ["IP Address", selectedVps.ipAddress],
                ["Hostname", selectedVps.hostname || "—"],
                ["Provider", selectedVps.provider],
                ["Provider VPS ID", selectedVps.providerVpsId || "—"],
                ["Operating System", selectedVps.operatingSystem || "—"],
                ["RAM", selectedVps.ram ? `${selectedVps.ram} GB` : "—"],
                ["Status", selectedVps.status],
                ["Expiry Date", selectedVps.expiresAt ? formatDate(selectedVps.expiresAt) : "—"],
                ["Customer", selectedVps.user?.name || "Unnamed Client"],
                ["Customer Email", selectedVps.user?.email || "—"],
                ["Created", formatDate(selectedVps.createdAt)],
                ["VPS ID", selectedVps.id],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-3.5">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">{label}</p>
                  <p className="mt-1 break-all font-mono text-xs font-semibold text-[#F1E9DA]">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedCustomer(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between border-b border-[#332f2a] pb-4">
              <div>
                <h2 className="font-serif text-xl font-bold text-[#F1E9DA]">Customer Profile</h2>
                <p className="font-mono text-xs text-[#F1E9DA]/50">Account details and allocated services</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="rounded-lg p-1.5 text-[#F1E9DA]/50 hover:bg-[#171717] hover:text-[#F1E9DA]">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-4">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">Customer Name</p>
                <p className="font-serif text-base font-bold text-[#F1E9DA]">{selectedCustomer.name || "Unnamed Client"}</p>
              </div>
              <div className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-4">
                <p className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50"><Mail size={12}/> Email Address</p>
                <p className="break-all font-mono text-xs font-semibold text-[#F1E9DA]">{selectedCustomer.email}</p>
              </div>
              <div className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-4">
                <p className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50"><Calendar size={12}/> Member Since</p>
                <p className="font-mono text-xs font-semibold text-[#F1E9DA]">{formatDate(selectedCustomer.createdAt)}</p>
              </div>
              <div className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-4">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">Account Status</p>
                <p className={selectedCustomer.isActive ? "font-mono text-xs font-semibold text-emerald-400" : "font-mono text-xs font-semibold text-red-400"}>
                  {selectedCustomer.isActive ? "Active Account" : "Deactivated / Suspended"}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-3 font-serif text-sm font-bold text-[#F1E9DA]">Customer VPS Instances ({selectedCustomer.vpsInstances.length})</h3>
              {selectedCustomer.vpsInstances.length === 0 ? (
                <p className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-5 text-center font-mono text-xs text-[#F1E9DA]/50">No VPS instances provisioned for this customer.</p>
              ) : (
                <div className="space-y-2.5">
                  {selectedCustomer.vpsInstances.map(vps => (
                    <div key={vps.id} className="rounded-xl border border-[#332f2a]/60 bg-[#171717] p-4">
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="font-mono text-sm font-bold text-[#C6A66B]">{vps.ipAddress}</p>
                        <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">{vps.status}</span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-[#F1E9DA]/60">
                        {vps.provider} · {vps.operatingSystem || "OS not specified"} · {vps.ram ? `${vps.ram} GB RAM` : "RAM N/A"}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/40">
                        Expires: {vps.expiresAt ? formatDate(vps.expiresAt) : "Not specified"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                const customer = customers.find(c => c.id === selectedCustomer.id);
                if (customer) toggleCustomer(customer);
              }}
              disabled={actionLoading === selectedCustomer.id}
              className={`mt-6 w-full rounded-xl py-3.5 font-mono text-xs font-bold uppercase tracking-wider transition ${
                selectedCustomer.isActive
                  ? "border border-red-500/40 bg-red-950/30 text-red-300 hover:bg-red-900/40"
                  : "border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40"
              }`}
            >
              {selectedCustomer.isActive ? "Deactivate Customer Account" : "Activate Customer Account"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
