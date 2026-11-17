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
      return "border-green-500/30 bg-green-500/10 text-green-400";

    case "FAILED":
      return "border-red-500/30 bg-red-500/10 text-red-400";

    case "PENDING":
    case "CHECKING_INVENTORY":
    case "RESERVED":
    case "PROVISIONING":
    case "PURCHASING":
    case "RETRYING":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";

    case "CANCELLED":
      return "border-slate-500/30 bg-slate-500/10 text-slate-400";

    default:
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";
  }
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}
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
    <div className="min-w-0 rounded-lg border border-slate-800 bg-[#080e1c] p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-slate-200">
        {displayValue}
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

  // Load provisioning jobs
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

  // Dashboard counts
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

  // Search and status filtering
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
        (job.inventory?.ipAddress || "").toLowerCase().includes(term);

      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  // Different tab views
  const displayedJobs = useMemo(() => {
    switch (activeTab) {
      case "OVERVIEW":
        return filteredJobs.slice(0, 5);

      case "FAILED":
        return filteredJobs.filter(
          (job) => job.status === "FAILED",
        );

      case "RECONCILIATION":
        // Inspection is performed individually from job details.
        return filteredJobs;

      case "ALL":
      default:
        return filteredJobs;
    }
  }, [activeTab, filteredJobs]);

  // Open job details
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

  // Read-only reconciliation
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

      {/* PAGE HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="text-blue-400" size={22} />

            <h1 className="text-2xl font-bold">
              Provisioning Management
            </h1>
          </div>

          <p className="mt-1 text-sm text-slate-400">
            Monitor VPS allocation jobs, provider assignments and failures.
          </p>
        </div>

        <button
          onClick={() => void loadJobs(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={refreshing ? "animate-spin" : ""}
          />

          Refresh Jobs
        </button>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <span>{error}</span>

          <button
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          {
            label: "Total Jobs",
            value: counts.total,
            icon: Activity,
            color: "text-blue-400",
          },
          {
            label: "Completed",
            value: counts.completed,
            icon: CheckCircle2,
            color: "text-green-400",
          },
          {
            label: "In Progress",
            value: counts.pending,
            icon: Clock3,
            color: "text-yellow-400",
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
              className="rounded-xl border border-slate-800 bg-[#111a2b] p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-400">
                  {card.label}
                </p>

                <Icon size={20} className={card.color} />
              </div>

              <p className="mt-4 text-3xl font-bold">
                {loading ? "—" : card.value}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Provisioning records
              </p>
            </div>
          );
        })}
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4">
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
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                  : "border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={16} />

              {tab.label}

              {tab.count !== undefined && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW INFORMATION */}
      {activeTab === "OVERVIEW" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-5">
            <div className="flex items-center gap-3">
              <Server className="text-blue-400" size={22} />

              <div>
                <h3 className="font-semibold">
                  VPS Allocation
                </h3>

                <p className="text-xs text-slate-500">
                  Inventory-first provisioning
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-400">
              Paid orders are checked against available VPS inventory.
              Matching inventory can be reserved for allocation.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#111a2b] p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-green-400" size={22} />

              <div>
                <h3 className="font-semibold">
                  Safe Reconciliation
                </h3>

                <p className="text-xs text-slate-500">
                  Read-only inspection
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-400">
              Inspect order, VPS and inventory records to identify
              inconsistent provisioning states without changing records.
            </p>
          </div>
        </div>
      )}

      {/* RECONCILIATION INFORMATION */}
      {activeTab === "RECONCILIATION" && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 text-blue-400"
              size={22}
            />

            <div>
              <h3 className="font-semibold">
                Reconciliation Inspection
              </h3>

              <p className="mt-1 text-sm leading-6 text-slate-400">
                Select any provisioning job, open its details and click
                Inspect Job. The system will compare order, inventory
                and VPS records and provide a recommendation.
              </p>

              <p className="mt-2 text-xs text-green-400">
                This operation is read-only. It does not retry jobs,
                purchase VPS servers or modify inventory.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* JOBS TABLE */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#111a2b]">

        {/* SEARCH AND FILTER */}
        <div className="flex flex-col gap-3 border-b border-slate-800 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              size={17}
              className="absolute left-3 top-3.5 text-slate-500"
            />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search job ID, order, provider or IP..."
              className="w-full rounded-lg border border-slate-700 bg-[#080e1c] py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-700 bg-[#080e1c] p-3 text-sm outline-none focus:border-blue-500"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="CHECKING_INVENTORY">
              Checking inventory
            </option>
            <option value="RESERVED">Reserved</option>
            <option value="PROVISIONING">Provisioning</option>
            <option value="PURCHASING">Purchasing</option>
            <option value="COMPLETED">Completed</option>
            <option value="RETRYING">Retrying</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* TABLE HEADER */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-semibold">
            {tableTitle}
          </h2>

          <span className="text-xs text-slate-500">
            {displayedJobs.length} of {jobs.length} jobs
          </span>
        </div>

        {/* TABLE CONTENT */}
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw
              className="mx-auto mb-3 animate-spin"
              size={25}
            />

            Loading provisioning jobs...
          </div>
        ) : displayedJobs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity
              className="mx-auto mb-3 text-slate-500"
              size={36}
            />

            <p className="font-medium text-slate-300">
              {activeTab === "FAILED"
                ? "No failed jobs found"
                : "No provisioning jobs found"}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {search || statusFilter !== "ALL"
                ? "Try changing your search or status filter."
                : "Jobs will appear here when an order enters the provisioning flow."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-[#0d1525] text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-4">Job / Order</th>
                  <th className="px-4 py-4">Provider</th>
                  <th className="px-4 py-4">Source</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Attempt</th>
                  <th className="px-4 py-4">Created</th>
                  <th className="px-4 py-4">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {displayedJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-4">
                      <p className="font-mono text-xs text-slate-300">
                        {job.id.slice(0, 12)}...
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {job.order?.orderNumber || job.orderId}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-medium">
                        {job.provider?.name || "—"}
                      </p>

                      <p className="text-xs text-slate-500">
                        {job.provider?.code || "Not assigned"}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <span className="rounded-md bg-slate-700/50 px-2 py-1 text-xs">
                        {job.source.replaceAll("_", " ")}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <StatusBadge status={job.status} />
                    </td>

                    <td className="px-4 py-4">
                      {job.attemptNumber}
                    </td>

                    <td className="px-4 py-4 text-xs text-slate-400">
                      {formatDate(job.createdAt)}
                    </td>

                    <td className="px-4 py-4">
                      <button
                        onClick={() => void openJob(job.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-blue-400 hover:bg-slate-700"
                      >
                        <Eye size={14} />

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

      {/* DETAIL LOADING */}
      {detailLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70">
          <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-[#111a2b] px-6 py-4 text-sm">
            <RefreshCw
              className="animate-spin"
              size={18}
            />

            Loading job details...
          </div>
        </div>
      )}

      {/* JOB DETAILS MODAL */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4"
          onClick={closeModal}
        >
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#111a2b] p-5 sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            {/* MODAL HEADER */}
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">
                  Provisioning Job Details
                </h2>

                <p className="mt-1 break-all font-mono text-xs text-slate-500">
                  {selectedJob.id}
                </p>
              </div>

              <button
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"
                aria-label="Close details"
              >
                <X size={20} />
              </button>
            </div>

            {/* STATUS */}
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <StatusBadge status={selectedJob.status} />

              <span className="text-xs text-slate-500">
                Attempt #{selectedJob.attemptNumber}
              </span>

              <span className="text-xs text-slate-500">
                Source: {selectedJob.source}
              </span>
            </div>

            <div className="space-y-5">

              {/* JOB INFORMATION */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
                  Job Information
                </h3>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem
                    label="Job ID"
                    value={selectedJob.id}
                  />

                  <InfoItem
                    label="Order ID"
                    value={selectedJob.orderId}
                  />

                  <InfoItem
                    label="Order Number"
                    value={selectedJob.order?.orderNumber}
                  />

                  <InfoItem
                    label="Job Source"
                    value={selectedJob.source}
                  />

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

              {/* ORDER INFORMATION */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
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

              {/* VPS INFORMATION */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
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
                    label="VPS Expiry"
                    value={formatDate(
                      selectedJob.order?.vpsInstance?.expiresAt,
                    )}
                  />
                </div>
              </section>

              {/* PROVIDER AND INVENTORY */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
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

              {/* FAILURE INFORMATION */}
              {selectedJob.errorMessage && (
                <section className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-400">
                    <AlertCircle size={16} />

                    Failure Information
                  </h3>

                  <p className="text-xs text-slate-400">
                    Code: {selectedJob.errorCode || "—"}
                  </p>

                  <p className="mt-2 break-words text-sm text-red-300">
                    {selectedJob.errorMessage}
                  </p>
                </section>
              )}

              {/* RECONCILIATION */}
              <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold">
                      <ShieldCheck
                        size={18}
                        className="text-blue-400"
                      />

                      Reconciliation Inspection
                    </h3>

                    <p className="mt-1 text-xs text-slate-400">
                      Inspect database consistency without changing VPS
                      or inventory records.
                    </p>
                  </div>

                  <button
                    onClick={() => void inspectJob()}
                    disabled={reconciling}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                  >
                    <RefreshCw
                      size={15}
                      className={reconciling ? "animate-spin" : ""}
                    />

                    {reconciling ? "Inspecting..." : "Inspect Job"}
                  </button>
                </div>

                {reconciliation && (
                  <div className="mt-5 space-y-4 border-t border-slate-700/70 pt-4">

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        Assessment
                      </p>

                      <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                        {reconciliation.assessment.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="rounded-lg bg-[#080e1c] p-3">
                      <p className="text-xs text-slate-500">
                        Recommendation
                      </p>

                      <p className="mt-1 text-sm text-slate-200">
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

                    <p className="flex items-center gap-2 text-xs text-green-400">
                      <ShieldCheck size={15} />

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
