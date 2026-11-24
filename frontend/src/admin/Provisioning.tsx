
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  Server,
  Layers,
  ClipboardCheck,
} from "lucide-react";
import adminApi from "../adminApi";

type TabType = "OVERVIEW" | "ALL" | "FAILED" | "RECONCILIATION";

type ProvisioningJob = {
  id: string;
  orderId: string;
  providerId: string | null;
  inventoryId: string | null;
  source: string;
  status: string;
  attemptNumber: number;
  providerRequestId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: {
    id?: string;
    orderNumber?: string;
    userId?: string;
    planName?: string;
    operatingSystem?: string;
    amount?: string | number;
    currency?: string;
    status?: string;
    vpsInstance?: {
      id: string;
      ipAddress: string;
      hostname?: string | null;
      status: string;
      provider?: string;
      providerVpsId?: string | null;
      expiresAt?: string | null;
    } | null;
  } | null;
  provider?: {
    id: string;
    name: string;
    code: string;
    isActive?: boolean;
  } | null;
  inventory?: {
    id: string;
    providerVpsId?: string | null;
    ipAddress?: string | null;
    hostname?: string | null;
    status: string;
    expiresAt?: string | null;
    vpsInstance?: {
      id: string;
      ipAddress: string;
      status: string;
    } | null;
  } | null;
};

type ReconciliationResult = {
  message: string;
  readOnly: boolean;
  assessment: string;
  recommendation: string;
  job: ProvisioningJob;
  hostheavenCheck?: unknown;
  checks: {
    orderExists: boolean;
    orderStatus: string;
    inventoryLinked: boolean;
    inventoryStatus: string | null;
    orderVpsExists: boolean;
    inventoryVpsExists: boolean;
    jobStatus: string;
  };
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusClass = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";

    case "FAILED":
      return "border-red-500/30 bg-red-500/10 text-red-400";

    case "PENDING":
    case "CHECKING_INVENTORY":
    case "RESERVED":
    case "PROVISIONING":
    case "PURCHASING":
    case "RETRYING":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";

    case "CANCELLED":
      return "border-[#332f2a] bg-[#171717] text-[#F1E9DA]/40";

    default:
      return "border-[#C6A66B]/30 bg-[#C6A66B]/10 text-[#C6A66B]";
  }
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${statusClass(status)}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
}) {
  let displayValue = "—";

  if (typeof value === "boolean") {
    displayValue = value ? "Yes" : "No";
  } else if (value !== null && value !== undefined && value !== "") {
    displayValue = String(value);
  }

  return (
    <div className="min-w-0 rounded-xl border border-[#332f2a]/60 bg-[#171717] p-3.5">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">{label}</p>
      <p className="mt-1 break-all font-mono text-xs font-semibold text-[#F1E9DA]">
        {displayValue}
      </p>
    </div>
  );
}

function HostHeavenVerification({
  result,
}: {
  result: unknown;
}) {
  const data =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : null;

  const skipped = data?.skipped === true;
  const verified = data?.verified === true;
  const error = data?.error;

  return (
    <div className="rounded-xl border border-[#332f2a] bg-[#171717] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-serif text-sm font-bold text-[#F1E9DA]">
          HostHeaven Provider Verification
        </h4>

        <span
          className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
            skipped
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : verified
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : error
                  ? "border-red-500/30 bg-red-500/10 text-red-300"
                  : "border-[#332f2a] bg-[#201d1a] text-[#F1E9DA]/70"
          }`}
        >
          {skipped
            ? "MANUAL REVIEW REQUIRED"
            : verified
              ? "PROVIDER RESPONSE RECEIVED"
              : error
                ? "LOOKUP FAILED"
                : "RESPONSE RECEIVED"}
        </span>
      </div>

      {typeof data?.reason === "string" && (
        <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
          <p className="font-mono text-[10px] uppercase text-[#F1E9DA]/50">Reason</p>
          <p className="mt-1 font-mono text-xs text-amber-300">
            {data.reason}
          </p>
        </div>
      )}

      {typeof error === "string" && (
        <div className="mb-3 rounded-lg border border-red-500/20 bg-red-950/20 p-3">
          <p className="font-mono text-[10px] uppercase text-[#F1E9DA]/50">Lookup Error</p>
          <p className="mt-1 break-words font-mono text-xs text-red-300">
            {error}
          </p>
        </div>
      )}

      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[#332f2a] bg-[#201d1a] p-3.5 font-mono text-xs text-[#F1E9DA]/70">
        {typeof result === "string"
          ? result
          : JSON.stringify(result, null, 2)}
      </pre>

      <p className="mt-3 font-mono text-[11px] text-[#F1E9DA]/40">
        A provider response or skipped lookup does not by itself prove
        that a VPS was successfully created. Verify the actual provider
        VM record before taking action.
      </p>
    </div>
  );
}

export default function Provisioning() {
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState<TabType>("OVERVIEW");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedJob, setSelectedJob] =
    useState<ProvisioningJob | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const [reconciliation, setReconciliation] =
    useState<ReconciliationResult | null>(null);

  const loadJobs = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await adminApi.get("/admin/provisioning/jobs");

      setJobs(response.data?.jobs || []);
      setError("");
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to load provisioning jobs.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const counts = useMemo(
    () => ({
      total: jobs.length,

      completed: jobs.filter(
        (job) => job.status === "COMPLETED",
      ).length,

      pending: jobs.filter((job) =>
        [
          "PENDING",
          "CHECKING_INVENTORY",
          "RESERVED",
          "PROVISIONING",
          "PURCHASING",
          "RETRYING",
        ].includes(job.status),
      ).length,

      failed: jobs.filter(
        (job) => job.status === "FAILED",
      ).length,
    }),
    [jobs],
  );

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesStatus =
        statusFilter === "ALL" ||
        job.status === statusFilter;

      const matchesSearch =
        !term ||
        job.id.toLowerCase().includes(term) ||
        job.orderId.toLowerCase().includes(term) ||
        (job.order?.orderNumber || "").toLowerCase().includes(term) ||
        (job.provider?.name || "").toLowerCase().includes(term) ||
        (job.inventory?.ipAddress || "").toLowerCase().includes(term) ||
        (job.providerRequestId || "").toLowerCase().includes(term);

      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  const displayedJobs = useMemo(() => {
    switch (activeTab) {
      case "OVERVIEW":
        return filteredJobs.slice(0, 5);

      case "FAILED":
        return filteredJobs.filter(
          (job) => job.status === "FAILED",
        );

      case "RECONCILIATION":
      case "ALL":
      default:
        return filteredJobs;
    }
  }, [activeTab, filteredJobs]);

  const openJob = async (id: string) => {
    setDetailLoading(true);
    setSelectedJob(null);
    setReconciliation(null);

    try {
      const response = await adminApi.get(
        `/admin/provisioning/jobs/${id}`,
      );

      setSelectedJob(response.data);
      setError("");
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to load job details.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const inspectJob = async () => {
    if (!selectedJob) return;

    setReconciling(true);
    setReconciliation(null);

    try {
      const response = await adminApi.post(
        `/admin/provisioning/jobs/${selectedJob.id}/reconcile`,
      );

      setReconciliation(response.data);
      setError("");
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Reconciliation inspection failed.",
      );
    } finally {
      setReconciling(false);
    }
  };

  const closeModal = () => {
    setSelectedJob(null);
    setReconciliation(null);
  };

  const tabs: {
    id: TabType;
    label: string;
    icon: typeof Activity;
    count?: number;
  }[] = [
    {
      id: "OVERVIEW",
      label: "Overview",
      icon: Activity,
    },
    {
      id: "ALL",
      label: "All Jobs",
      icon: Layers,
      count: counts.total,
    },
    {
      id: "FAILED",
      label: "Failed Jobs",
      icon: AlertCircle,
      count: counts.failed,
    },
    {
      id: "RECONCILIATION",
      label: "Reconciliation",
      icon: ClipboardCheck,
    },
  ];

  const tableTitle = {
    OVERVIEW: "Recent Provisioning Activity",
    ALL: "All Provisioning Jobs",
    FAILED: "Failed Provisioning Jobs",
    RECONCILIATION: "Jobs for Reconciliation Inspection",
  }[activeTab];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="text-[#C6A66B]" size={22} />
            <h1 className="font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">
              Provisioning Management
            </h1>
          </div>

          <p className="mt-1 font-sans text-xs text-[#F1E9DA]/60">
            Monitor VPS allocation jobs, provider assignments, and reconciliation audits.
          </p>
        </div>

        <button
          onClick={() => void loadJobs(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-2 font-mono text-xs font-bold text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521] disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={refreshing ? "animate-spin" : ""}
          />
          Refresh Jobs
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-950/20 p-4 font-mono text-xs text-red-300">
          <span>{error}</span>

          <button
            onClick={() => setError("")}
            aria-label="Dismiss error"
            className="rounded p-1 text-[#F1E9DA]/50 hover:text-[#F1E9DA]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          {
            label: "Total Jobs",
            value: counts.total,
            icon: Activity,
            color: "text-[#C6A66B]",
          },
          {
            label: "Completed",
            value: counts.completed,
            icon: CheckCircle2,
            color: "text-emerald-400",
          },
          {
            label: "In Progress",
            value: counts.pending,
            icon: Clock3,
            color: "text-amber-400",
          },
          {
            label: "Failed",
            value: counts.failed,
            icon: AlertCircle,
            color: "text-red-400",
          },
        ].map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">
                  {card.label}
                </p>

                <Icon size={18} className={card.color} />
              </div>

              <p className="mt-4 font-serif text-3xl font-bold text-[#F1E9DA]">
                {loading ? "—" : card.value}
              </p>

              <p className="mt-1 font-mono text-[11px] text-[#F1E9DA]/40">
                Provisioning records
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#332f2a] pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setStatusFilter("ALL");
                setSearch("");
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${
                active
                  ? "bg-[#C6A66B] text-[#171717] shadow-sm"
                  : "border border-[#332f2a] bg-[#201d1a] text-[#F1E9DA]/70 hover:bg-[#292521] hover:text-[#F1E9DA]"
              }`}
            >
              <Icon size={14} />
              {tab.label}

              {tab.count !== undefined && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    active
                      ? "bg-[#171717]/20 text-[#171717]"
                      : "bg-[#171717] text-[#F1E9DA]/60"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "OVERVIEW" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#332f2a] bg-[#171717] text-[#C6A66B]">
                <Server size={16} />
              </div>

              <div>
                <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">
                  VPS Allocation Engine
                </h3>

                <p className="font-mono text-xs text-[#F1E9DA]/50">
                  Inventory-first provisioning architecture
                </p>
              </div>
            </div>

            <p className="mt-3 font-sans text-xs leading-5 text-[#F1E9DA]/60">
              Paid customer orders are matched against available pre-configured VPS inventory.
              Allocated servers are provisioned securely and verified before customer handoff.
            </p>
          </div>

          <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#332f2a] bg-[#171717] text-emerald-400">
                <ShieldCheck size={16} />
              </div>

              <div>
                <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">
                  Safe Reconciliation
                </h3>

                <p className="font-mono text-xs text-[#F1E9DA]/50">
                  Read-only discrepancy audit
                </p>
              </div>
            </div>

            <p className="mt-3 font-sans text-xs leading-5 text-[#F1E9DA]/60">
              Inspect order, VPS and inventory records to verify configuration consistency
              without taking mutating actions against production servers.
            </p>
          </div>
        </div>
      )}

      {activeTab === "RECONCILIATION" && (
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#332f2a] bg-[#171717] text-[#C6A66B]">
              <ShieldCheck size={16} />
            </div>

            <div>
              <h3 className="font-serif text-sm font-bold text-[#F1E9DA]">
                Reconciliation Inspection Mode
              </h3>

              <p className="mt-1 font-sans text-xs leading-5 text-[#F1E9DA]/60">
                Select a provisioning job, open its details and click Inspect Job.
                The system audits order, inventory, VPS and live provider records.
              </p>

              <p className="mt-2 font-mono text-xs text-emerald-400">
                This operation is read-only. It does not re-purchase servers or mutate database records.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a]">
        <div className="flex flex-col gap-3 border-b border-[#332f2a] p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-3.5 text-[#F1E9DA]/40"
            />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search job ID, order, provider or IP..."
              className="w-full rounded-xl border border-[#332f2a] bg-[#171717] py-3 pl-10 pr-4 font-sans text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 outline-none transition focus:border-[#C6A66B]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-[#332f2a] bg-[#171717] p-3 font-mono text-xs text-[#F1E9DA] outline-none transition focus:border-[#C6A66B]"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="CHECKING_INVENTORY">Checking inventory</option>
            <option value="RESERVED">Reserved</option>
            <option value="PROVISIONING">Provisioning</option>
            <option value="PURCHASING">Purchasing</option>
            <option value="COMPLETED">Completed</option>
            <option value="RETRYING">Retrying</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[#332f2a] px-6 py-3.5">
          <h2 className="font-serif text-sm font-bold text-[#F1E9DA]">{tableTitle}</h2>

          <span className="font-mono text-xs text-[#F1E9DA]/50">
            {displayedJobs.length} of {jobs.length} jobs
          </span>
        </div>

        {loading ? (
          <div className="p-16 text-center font-mono text-xs text-[#F1E9DA]/50">
            <RefreshCw
              className="mx-auto mb-3 animate-spin text-[#C6A66B]"
              size={22}
            />
            Loading provisioning jobs...
          </div>
        ) : displayedJobs.length === 0 ? (
          <div className="p-16 text-center">
            <Activity
              className="mx-auto mb-3 text-[#F1E9DA]/30"
              size={36}
            />

            <p className="font-serif text-sm font-bold text-[#F1E9DA]">
              {activeTab === "FAILED"
                ? "No failed jobs found"
                : "No provisioning jobs found"}
            </p>

            <p className="mt-1 font-sans text-xs text-[#F1E9DA]/50">
              {search || statusFilter !== "ALL"
                ? "Try changing your search or status filter."
                : "Jobs will appear here when an order enters the provisioning flow."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left font-sans text-sm">
              <thead className="border-b border-[#332f2a] bg-[#171717] font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">
                <tr>
                  <th className="px-5 py-3.5">Job / Order</th>
                  <th className="px-5 py-3.5">Provider</th>
                  <th className="px-5 py-3.5">Source</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Attempt</th>
                  <th className="px-5 py-3.5">Created</th>
                  <th className="px-5 py-3.5">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#332f2a]">
                {displayedJobs.map((job) => (
                  <tr key={job.id} className="transition hover:bg-[#292521]/60">
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs font-semibold text-[#C6A66B]">
                        {job.id.slice(0, 12)}...
                      </p>

                      <p className="mt-0.5 font-mono text-xs text-[#F1E9DA]/50">
                        {job.order?.orderNumber || job.orderId}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-medium text-[#F1E9DA]">
                        {job.provider?.name || "—"}
                      </p>

                      <p className="font-mono text-xs text-[#F1E9DA]/40">
                        {job.provider?.code || "Not assigned"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-md border border-[#332f2a] bg-[#171717] px-2 py-0.5 font-mono text-[11px] text-[#F1E9DA]/70">
                        {job.source.replaceAll("_", " ")}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={job.status} />
                    </td>

                    <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]">
                      #{job.attemptNumber}
                    </td>

                    <td className="px-5 py-4 font-mono text-xs text-[#F1E9DA]/60">
                      {formatDate(job.createdAt)}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        onClick={() => void openJob(job.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-xs text-[#C6A66B] transition hover:border-[#C6A66B]/50 hover:bg-[#292521]"
                      >
                        <Eye size={13} />
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-[#332f2a] bg-[#201d1a] px-6 py-4 font-mono text-xs text-[#F1E9DA]">
            <RefreshCw className="animate-spin text-[#C6A66B]" size={16} />
            Loading job details...
          </div>
        </div>
      )}

      {selectedJob && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-2xl sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-3 border-b border-[#332f2a] pb-4">
              <div>
                <h2 className="font-serif text-xl font-bold text-[#F1E9DA]">
                  Provisioning Job Details
                </h2>

                <p className="mt-1 break-all font-mono text-xs text-[#C6A66B]">
                  {selectedJob.id}
                </p>
              </div>

              <button
                onClick={closeModal}
                className="rounded-lg p-1.5 text-[#F1E9DA]/50 hover:bg-[#171717] hover:text-[#F1E9DA]"
                aria-label="Close details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-6 flex flex-wrap items-center gap-3">
              <StatusBadge status={selectedJob.status} />

              <span className="font-mono text-xs text-[#F1E9DA]/50">
                Attempt #{selectedJob.attemptNumber}
              </span>

              <span className="font-mono text-xs text-[#F1E9DA]/50">
                Source: {selectedJob.source}
              </span>
            </div>

            <div className="space-y-6">
              <section>
                <h3 className="mb-3 font-serif text-sm font-bold text-[#F1E9DA]">
                  Job Information
                </h3>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem label="Job ID" value={selectedJob.id} />
                  <InfoItem label="Order ID" value={selectedJob.orderId} />
                  <InfoItem
                    label="Order Number"
                    value={selectedJob.order?.orderNumber}
                  />
                  <InfoItem label="Job Source" value={selectedJob.source} />
                  <InfoItem
                    label="Created At"
                    value={formatDate(selectedJob.createdAt)}
                  />
                  <InfoItem
                    label="Started At"
                    value={formatDate(selectedJob.startedAt)}
                  />
                  <InfoItem
                    label="Completed At"
                    value={formatDate(selectedJob.completedAt)}
                  />
                  <InfoItem
                    label="Provider Request ID"
                    value={selectedJob.providerRequestId}
                  />
                  <InfoItem
                    label="Updated At"
                    value={formatDate(selectedJob.updatedAt)}
                  />
                </div>
              </section>

              <section>
                <h3 className="mb-3 font-serif text-sm font-bold text-[#F1E9DA]">
                  Order Information
                </h3>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem
                    label="Plan"
                    value={selectedJob.order?.planName}
                  />
                  <InfoItem
                    label="Order Status"
                    value={selectedJob.order?.status}
                  />
                  <InfoItem
                    label="Order Amount"
                    value={
                      selectedJob.order?.amount !== undefined
                        ? `${selectedJob.order.currency || "INR"} ${selectedJob.order.amount}`
                        : "—"
                    }
                  />
                  <InfoItem
                    label="Operating System"
                    value={selectedJob.order?.operatingSystem}
                  />
                  <InfoItem
                    label="Customer ID"
                    value={selectedJob.order?.userId}
                  />
                </div>
              </section>

              <section>
                <h3 className="mb-3 font-serif text-sm font-bold text-[#F1E9DA]">
                  VPS Information
                </h3>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem
                    label="VPS Instance ID"
                    value={selectedJob.order?.vpsInstance?.id}
                  />
                  <InfoItem
                    label="VPS IP Address"
                    value={selectedJob.order?.vpsInstance?.ipAddress}
                  />
                  <InfoItem
                    label="VPS Hostname"
                    value={selectedJob.order?.vpsInstance?.hostname}
                  />
                  <InfoItem
                    label="VPS Status"
                    value={selectedJob.order?.vpsInstance?.status}
                  />
                  <InfoItem
                    label="VPS Provider"
                    value={selectedJob.order?.vpsInstance?.provider}
                  />
                  <InfoItem
                    label="Provider VM ID"
                    value={selectedJob.order?.vpsInstance?.providerVpsId}
                  />
                  <InfoItem
                    label="VPS Expiry"
                    value={formatDate(
                      selectedJob.order?.vpsInstance?.expiresAt,
                    )}
                  />
                </div>
              </section>

              <section>
                <h3 className="mb-3 font-serif text-sm font-bold text-[#F1E9DA]">
                  Provider & Inventory
                </h3>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem
                    label="Provider"
                    value={selectedJob.provider?.name}
                  />
                  <InfoItem
                    label="Provider Code"
                    value={selectedJob.provider?.code}
                  />
                  <InfoItem
                    label="Provider Active"
                    value={selectedJob.provider?.isActive}
                  />
                  <InfoItem
                    label="Inventory ID"
                    value={selectedJob.inventory?.id || selectedJob.inventoryId}
                  />
                  <InfoItem
                    label="Inventory Provider VM ID"
                    value={selectedJob.inventory?.providerVpsId}
                  />
                  <InfoItem
                    label="Inventory IP"
                    value={selectedJob.inventory?.ipAddress}
                  />
                  <InfoItem
                    label="Inventory Hostname"
                    value={selectedJob.inventory?.hostname}
                  />
                  <InfoItem
                    label="Inventory Status"
                    value={selectedJob.inventory?.status}
                  />
                  <InfoItem
                    label="Inventory VPS ID"
                    value={selectedJob.inventory?.vpsInstance?.id}
                  />
                  <InfoItem
                    label="Inventory VPS IP"
                    value={selectedJob.inventory?.vpsInstance?.ipAddress}
                  />
                </div>
              </section>

              {selectedJob.errorMessage && (
                <section className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                  <h3 className="mb-2 flex items-center gap-2 font-serif text-sm font-bold text-red-400">
                    <AlertCircle size={15} />
                    Failure Information
                  </h3>

                  <p className="font-mono text-xs text-[#F1E9DA]/50">
                    Code: {selectedJob.errorCode || "—"}
                  </p>

                  <p className="mt-2 break-words font-mono text-xs text-red-300">
                    {selectedJob.errorMessage}
                  </p>
                </section>
              )}

              <section className="rounded-2xl border border-[#332f2a] bg-[#171717] p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="flex items-center gap-2 font-serif text-sm font-bold text-[#F1E9DA]">
                      <ShieldCheck
                        size={16}
                        className="text-[#C6A66B]"
                      />
                      Reconciliation Inspection
                    </h3>

                    <p className="mt-1 font-sans text-xs text-[#F1E9DA]/50">
                      Audit database and available provider state
                      without altering VPS or inventory records.
                    </p>
                  </div>

                  <button
                    onClick={() => void inspectJob()}
                    disabled={reconciling}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8b87d] disabled:opacity-50"
                  >
                    <RefreshCw
                      size={14}
                      className={reconciling ? "animate-spin" : ""}
                    />
                    {reconciling ? "Inspecting..." : "Inspect Job"}
                  </button>
                </div>

                {reconciliation && (
                  <div className="mt-5 space-y-4 border-t border-[#332f2a] pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-serif text-sm font-bold text-[#F1E9DA]">
                        Assessment
                      </p>

                      <span className="rounded-full border border-[#C6A66B]/30 bg-[#C6A66B]/10 px-3 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#C6A66B]">
                        {reconciliation.assessment.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="rounded-xl border border-[#332f2a] bg-[#201d1a] p-3.5">
                      <p className="font-mono text-[10px] uppercase text-[#F1E9DA]/50">
                        Recommendation
                      </p>

                      <p className="mt-1 font-sans text-xs text-[#F1E9DA]">
                        {reconciliation.recommendation}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(reconciliation.checks).map(
                        ([key, value]) => (
                          <InfoItem
                            key={key}
                            label={key.replace(/([A-Z])/g, " $1")}
                            value={value}
                          />
                        ),
                      )}
                    </div>

                    {reconciliation.hostheavenCheck !== undefined &&
                      reconciliation.hostheavenCheck !== null && (
                        <HostHeavenVerification
                          result={reconciliation.hostheavenCheck}
                        />
                      )}

                    <p className="flex items-center gap-2 font-mono text-xs text-emerald-400">
                      <ShieldCheck size={14} />
                      Read-only inspection completed. No records were modified.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
