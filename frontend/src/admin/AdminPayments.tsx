import { useEffect, useState, useCallback } from "react";
import {
  CreditCard,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  Receipt,
  Server,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import adminApi from "../adminApi";

type PaymentRecord = {
  id: string;
  userId: string;
  orderId: string | null;
  purpose: "VPS_ORDER" | "WALLET_TOPUP" | "VPS_RENEWAL";
  provider: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  amount: number | string;
  currency: string;
  status: "CREATED" | "CAPTURED" | "FAILED";
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
    email: string;
  };
  order?: {
    id: string;
    orderNumber: string;
    planName: string;
    operatingSystem: string;
  } | null;
};

type PaymentApiResponse = {
  payments: PaymentRecord[];
  totalRevenue: number | string;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export default function AdminPayments() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("");

  const fetchPayments = useCallback(async (pageToLoad = 1) => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.get<PaymentApiResponse>("/admin/dashboard/payments", {
        params: {
          page: pageToLoad,
          limit: 15,
          search: search || undefined,
          status: statusFilter || undefined,
          purpose: purposeFilter || undefined,
        },
      });

      setPayments(res.data.payments || []);
      setTotalRevenue(Number(res.data.totalRevenue || 0));
      setPagination(res.data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load payment transactions.");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, purposeFilter]);

  useEffect(() => {
    fetchPayments(1);
  }, [fetchPayments]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const getPurposeBadge = (purpose: string) => {
    switch (purpose) {
      case "VPS_ORDER":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-400">
            <Server size={10} /> New Plan Order
          </span>
        );
      case "VPS_RENEWAL":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-300">
            <RefreshCw size={10} /> Server Renewal
          </span>
        );
      case "WALLET_TOPUP":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            <CreditCard size={10} /> Wallet Top-Up
          </span>
        );
      default:
        return (
          <span className="rounded-full border border-[#332f2a] bg-[#171717] px-2.5 py-0.5 text-[10px] text-[#F1E9DA]/60">
            {purpose}
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CAPTURED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            <CheckCircle2 size={10} /> Successful
          </span>
        );
      case "CREATED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <Clock size={10} /> Pending
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
            <AlertCircle size={10} /> Failed
          </span>
        );
      default:
        return (
          <span className="rounded-full border border-[#332f2a] bg-[#171717] px-2.5 py-0.5 text-[10px] text-[#F1E9DA]/60">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Metrics */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold tracking-tight text-[#F1E9DA]">
            Payments & Billing Audit
          </h2>
          <p className="mt-1 font-mono text-xs text-[#F1E9DA]/60">
            Real-time transaction logs, direct purchases, wallet top-ups, and server renewals.
          </p>
        </div>
        <button
          onClick={() => fetchPayments(pagination.page)}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-3.5 py-2 font-mono text-xs font-bold text-[#F1E9DA] hover:border-[#C6A66B]/50 transition disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#F1E9DA]/50">
              Total Captured Revenue
            </p>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="mt-3 font-mono text-3xl font-bold text-[#F1E9DA]">
            ₹{totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-1 font-mono text-[11px] text-emerald-400">
            ✓ 100% Verified on Gateway
          </p>
        </div>

        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#F1E9DA]/50">
              Total Transaction Records
            </p>
            <div className="rounded-xl border border-[#C6A66B]/20 bg-[#C6A66B]/10 p-2.5 text-[#C6A66B]">
              <Receipt size={18} />
            </div>
          </div>
          <p className="mt-3 font-mono text-3xl font-bold text-[#F1E9DA]">
            {pagination.total}
          </p>
          <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/50">
            Across Orders, Renewals & Wallets
          </p>
        </div>

        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#F1E9DA]/50">
              Payment Gateway
            </p>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-2.5 text-sky-400">
              <CreditCard size={18} />
            </div>
          </div>
          <p className="mt-3 font-mono text-lg font-bold text-[#F1E9DA]">
            Razorpay + Webhooks
          </p>
          <p className="mt-1 font-mono text-[11px] text-sky-400">
            Server-to-Server Webhook Active
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#F1E9DA]/40" />
          <input
            type="text"
            placeholder="Search by customer name, email, Razorpay payment ID, or order ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-xl border border-[#332f2a] bg-[#171717] py-2.5 pl-9 pr-4 font-mono text-xs text-[#F1E9DA] placeholder-[#F1E9DA]/30 focus:border-[#C6A66B] focus:outline-none"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[#332f2a] bg-[#171717] px-3 py-2.5 font-mono text-xs text-[#F1E9DA] focus:border-[#C6A66B] focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="CAPTURED">Captured / Success</option>
            <option value="CREATED">Created / Pending</option>
            <option value="FAILED">Failed</option>
          </select>

          <select
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value)}
            className="rounded-xl border border-[#332f2a] bg-[#171717] px-3 py-2.5 font-mono text-xs text-[#F1E9DA] focus:border-[#C6A66B] focus:outline-none"
          >
            <option value="">All Purposes</option>
            <option value="VPS_ORDER">Plan Purchase</option>
            <option value="VPS_RENEWAL">Server Renewal</option>
            <option value="WALLET_TOPUP">Wallet Top-Up</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 font-mono text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Transactions Table */}
      <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a] shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[#332f2a] bg-[#171717]/60 text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                <th className="px-5 py-4">Date & Time</th>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4">Purpose</th>
                <th className="px-5 py-4">Plan / Ref</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">Gateway IDs</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#332f2a]/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#F1E9DA]/50">
                    <RefreshCw size={20} className="mx-auto mb-2 animate-spin text-[#C6A66B]" />
                    Loading payment records...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#F1E9DA]/50">
                    No payment transactions found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#171717]/40 transition">
                    <td className="whitespace-nowrap px-5 py-4 text-[#F1E9DA]/70">
                      {new Date(p.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#F1E9DA]">
                        {p.user?.name || "Customer"}
                      </p>
                      <p className="text-[11px] text-[#F1E9DA]/50">{p.user?.email || "—"}</p>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4">
                      {getPurposeBadge(p.purpose)}
                    </td>

                    <td className="px-5 py-4">
                      {p.order ? (
                        <div>
                          <p className="font-semibold text-[#F1E9DA]">
                            {p.order.planName}
                          </p>
                          <p className="text-[10px] text-[#F1E9DA]/50">
                            {p.order.orderNumber} ({p.order.operatingSystem})
                          </p>
                        </div>
                      ) : p.purpose === "VPS_RENEWAL" ? (
                        <span className="text-[#F1E9DA]/70">VPS Renewal</span>
                      ) : (
                        <span className="text-[#F1E9DA]/50">Wallet Top-Up</span>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 font-bold text-[#C6A66B]">
                      ₹{Number(p.amount).toFixed(2)}
                    </td>

                    <td className="px-5 py-4 font-mono text-[11px]">
                      {p.razorpayPaymentId ? (
                        <p className="text-emerald-400">{p.razorpayPaymentId}</p>
                      ) : (
                        <p className="text-[#F1E9DA]/30">Payment ID N/A</p>
                      )}
                      {p.razorpayOrderId && (
                        <p className="text-[10px] text-[#F1E9DA]/40">{p.razorpayOrderId}</p>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4">
                      {getStatusBadge(p.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#332f2a] px-5 py-3 font-mono text-xs text-[#F1E9DA]/60">
            <div>
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={pagination.page <= 1 || loading}
                onClick={() => fetchPayments(pagination.page - 1)}
                className="flex items-center gap-1 rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 hover:border-[#C6A66B] disabled:opacity-40 transition"
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => fetchPayments(pagination.page + 1)}
                className="flex items-center gap-1 rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 hover:border-[#C6A66B] disabled:opacity-40 transition"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
