import React, { useEffect, useState, useMemo } from "react";
import {
  Headphones,
  Search,
  RefreshCw,
  Server,
  User,
  Send,
  ChevronLeft,
  ShieldCheck,
  AlertCircle,
  X,
} from "lucide-react";
import adminApi from "../adminApi";
import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../CustomerSupportDesk";
import {
  CATEGORY_LABELS,
  PRIORITY_STYLES,
  STATUS_STYLES,
} from "../CustomerSupportDesk";

interface AdminTicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: "CUSTOMER" | "ADMIN";
  senderName: string;
  message: string;
  createdAt: string;
}

interface AdminSupportTicket {
  id: string;
  userId: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  vpsInstanceId?: string | null;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  vpsInstance?: {
    id: string;
    hostname: string | null;
    ipAddress: string;
    status?: string;
    operatingSystem?: string | null;
  } | null;
  _count?: {
    messages: number;
  };
  messages?: AdminTicketMessage[];
  createdAt: string;
  updatedAt: string;
}

const CANNED_REPLIES = [
  {
    title: "Investigating Server",
    text: "Hello! Our engineering team is currently investigating your server instance and network route. We will update you shortly.",
    status: "IN_PROGRESS" as TicketStatus,
  },
  {
    title: "Credentials & RDP",
    text: "Please verify you are connecting via Remote Desktop Protocol (RDP) using the credentials provided in your server management panel. If password was reset, please allow 60 seconds.",
    status: "AWAITING_CUSTOMER" as TicketStatus,
  },
  {
    title: "Issue Resolved",
    text: "We have resolved the reported problem. All services and ports are operational. Please verify from your side and let us know if you need anything else.",
    status: "RESOLVED" as TicketStatus,
  },
  {
    title: "Request Details",
    text: "Could you please provide any specific error messages or screenshots you are observing? This will help our team isolate the issue faster.",
    status: "AWAITING_CUSTOMER" as TicketStatus,
  },
];

export default function AdminSupportDesk() {
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [counts, setCounts] = useState({ total: 0, open: 0, inProgress: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Thread detail view
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<AdminSupportTicket | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [replyStatus, setReplyStatus] = useState<TicketStatus>("AWAITING_CUSTOMER");
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchTickets = async () => {
    try {
      setError(null);
      const params: any = {};
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (priorityFilter !== "ALL") params.priority = priorityFilter;

      const res = await adminApi.get("/admin/support/tickets", { params });
      setTickets(res.data.tickets || []);
      setCounts(res.data.counts || { total: 0, open: 0, inProgress: 0, resolved: 0 });
    } catch (err: any) {
      console.error("Failed to fetch admin tickets:", err);
      setError(err?.response?.data?.message || "Failed to load support tickets.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, priorityFilter]);

  // Load ticket details when selectedTicketId changes
  useEffect(() => {
    if (!selectedTicketId) {
      setSelectedTicket(null);
      return;
    }

    const loadThread = async () => {
      setLoadingThread(true);
      try {
        const res = await adminApi.get(`/admin/support/tickets/${selectedTicketId}`);
        setSelectedTicket(res.data);
        if (res.data.status === "OPEN") {
          setReplyStatus("AWAITING_CUSTOMER");
        } else {
          setReplyStatus(res.data.status);
        }
      } catch (err: any) {
        console.error("Failed to load admin ticket thread:", err);
        setError("Failed to load ticket thread.");
      } finally {
        setLoadingThread(false);
      }
    };

    loadThread();
  }, [selectedTicketId]);

  const handleRefresh = () => {
    setRefreshing(true);
    if (selectedTicketId) {
      adminApi.get(`/admin/support/tickets/${selectedTicketId}`)
        .then((res) => setSelectedTicket(res.data))
        .catch((e) => console.error(e))
        .finally(() => setRefreshing(false));
    } else {
      fetchTickets();
    }
  };

  // Change status directly
  const handleUpdateStatus = async (newStatus: TicketStatus) => {
    if (!selectedTicketId) return;
    setUpdatingStatus(true);
    try {
      await adminApi.patch(`/admin/support/tickets/${selectedTicketId}/status`, {
        status: newStatus,
      });

      setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : null));
      setReplyStatus(newStatus);
      fetchTickets();
    } catch (err: any) {
      console.error("Failed to update status:", err);
      alert(err?.response?.data?.message || "Failed to update status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Submit Admin reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyText.trim()) return;

    setSendingReply(true);
    try {
      const res = await adminApi.post(`/admin/support/tickets/${selectedTicketId}/reply`, {
        message: replyText.trim(),
        newStatus: replyStatus,
      });

      setReplyText("");
      setSelectedTicket((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: replyStatus,
          updatedAt: new Date().toISOString(),
          messages: [...(prev.messages || []), res.data],
        };
      });

      fetchTickets();
    } catch (err: any) {
      console.error("Failed to post staff reply:", err);
      alert(err?.response?.data?.message || "Failed to post reply.");
    } finally {
      setSendingReply(false);
    }
  };

  // Filtered tickets by search
  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) return tickets;
    const q = searchQuery.toLowerCase();
    return tickets.filter((t) => {
      const matchSubject = t.subject.toLowerCase().includes(q);
      const matchEmail = t.user?.email.toLowerCase().includes(q);
      const matchName = t.user?.name?.toLowerCase().includes(q);
      const matchIp = t.vpsInstance?.ipAddress.toLowerCase().includes(q);
      const matchId = t.id.toLowerCase().includes(q);
      return matchSubject || matchEmail || matchName || matchIp || matchId;
    });
  }, [tickets, searchQuery]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-[#C6A66B]" />
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
            Loading Support Desk...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // DETAIL / THREAD MODAL OR FULL VIEW
  // ==========================================
  if (selectedTicketId && loadingThread && !selectedTicket) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-[#C6A66B]" />
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
            Loading Ticket Details...
          </p>
        </div>
      </div>
    );
  }

  if (selectedTicketId && selectedTicket) {
    return (
      <div className="space-y-6">
        {/* Navigation & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#332f2a] pb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedTicketId(null)}
              className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-3.5 py-2 font-mono text-xs font-semibold text-[#F1E9DA]/80 hover:border-[#C6A66B]/50 hover:text-[#C6A66B] transition"
            >
              <ChevronLeft size={16} /> Back to Desk
            </button>
            <span className="font-mono text-xs text-[#F1E9DA]/40">
              Ticket #{selectedTicket.id.slice(0, 8).toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-[#332f2a] bg-[#201d1a] px-3.5 py-2 font-mono text-xs text-[#F1E9DA]/70 hover:text-[#F1E9DA] transition"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>

            {/* Direct Status Selector */}
            <div className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-3 py-1.5">
              <span className="font-mono text-[11px] text-[#F1E9DA]/50 uppercase">Status:</span>
              <select
                value={selectedTicket.status}
                disabled={updatingStatus}
                onChange={(e) => handleUpdateStatus(e.target.value as TicketStatus)}
                className="bg-transparent font-mono text-xs font-bold text-[#C6A66B] focus:outline-none cursor-pointer"
              >
                <option value="OPEN" className="bg-[#201d1a] text-blue-400">OPEN</option>
                <option value="IN_PROGRESS" className="bg-[#201d1a] text-amber-400">IN PROGRESS</option>
                <option value="AWAITING_CUSTOMER" className="bg-[#201d1a] text-purple-400">AWAITING CUSTOMER</option>
                <option value="RESOLVED" className="bg-[#201d1a] text-emerald-400">RESOLVED</option>
                <option value="CLOSED" className="bg-[#201d1a] text-neutral-400">CLOSED</option>
              </select>
            </div>
          </div>
        </div>

        {/* Customer & Ticket Info Cards */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLES[selectedTicket.status]?.badge}`}>
                {STATUS_STYLES[selectedTicket.status]?.label}
              </span>
              <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${PRIORITY_STYLES[selectedTicket.priority]?.badge}`}>
                {PRIORITY_STYLES[selectedTicket.priority]?.label} Priority
              </span>
              <span className="inline-flex items-center rounded-lg border border-[#332f2a] bg-[#171717] px-2.5 py-1 text-[11px] font-medium text-[#F1E9DA]/70">
                {CATEGORY_LABELS[selectedTicket.category]?.icon} {CATEGORY_LABELS[selectedTicket.category]?.label}
              </span>
            </div>

            <h1 className="font-serif text-2xl font-bold text-[#F1E9DA]">
              {selectedTicket.subject}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-[#F1E9DA]/50 border-t border-[#332f2a]/60 pt-3">
              <span>Opened: {new Date(selectedTicket.createdAt).toLocaleString("en-IN")}</span>
              <span>•</span>
              <span>Updated: {new Date(selectedTicket.updatedAt).toLocaleString("en-IN")}</span>
            </div>
          </div>

          {/* Customer & Server Context */}
          <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-xl space-y-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6A66B]">
                Customer Account
              </span>
              <div className="mt-1 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#292521] text-[#F1E9DA] font-bold text-xs">
                  <User size={15} />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#F1E9DA]">
                    {selectedTicket.user?.name || "Customer"}
                  </div>
                  <div className="font-mono text-xs text-[#F1E9DA]/60">
                    {selectedTicket.user?.email}
                  </div>
                </div>
              </div>
            </div>

            {selectedTicket.vpsInstance ? (
              <div className="border-t border-[#332f2a]/60 pt-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6A66B]">
                  Linked VPS Server
                </span>
                <div className="mt-1 flex items-center gap-2.5">
                  <Server size={16} className="text-[#C6A66B]" />
                  <div>
                    <div className="font-mono text-xs font-bold text-[#F1E9DA]">
                      {selectedTicket.vpsInstance.ipAddress}
                    </div>
                    <div className="text-[11px] text-[#F1E9DA]/50">
                      {selectedTicket.vpsInstance.hostname || "Server"} ({selectedTicket.vpsInstance.status})
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-t border-[#332f2a]/60 pt-3 text-xs text-[#F1E9DA]/40">
                No specific VPS instance linked.
              </div>
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#332f2a] pb-2">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B]">
              Conversation History ({selectedTicket.messages?.length || 0})
            </h2>
            <span className="font-mono text-[11px] text-[#F1E9DA]/40">
              Customer (Left) · Support Staff (Right)
            </span>
          </div>

          <div className="space-y-4 rounded-2xl border border-[#332f2a] bg-[#181614]/70 p-4 sm:p-6 shadow-inner">
            {selectedTicket.messages?.map((msg, index) => {
              const isStaff = msg.senderRole === "ADMIN";

              if (isStaff) {
                // Support Staff reply -> ALIGNED TO RIGHT
                return (
                  <div key={msg.id || index} className="flex justify-end w-full">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs border border-[#C6A66B]/40 bg-gradient-to-br from-[#2b241c] to-[#221c16] p-4 text-[#F1E9DA] shadow-xl shadow-black/40">
                      <div className="flex items-center justify-between gap-3 border-b border-[#C6A66B]/25 pb-2 mb-2.5">
                        <span className="font-mono text-[10px] text-[#F1E9DA]/45">
                          {new Date(msg.createdAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-sans text-xs font-bold text-[#C6A66B]">
                            {msg.senderName || "Support Engineer"}
                          </span>
                          <span className="rounded bg-[#C6A66B]/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#C6A66B] border border-[#C6A66B]/30">
                            Support Staff (You)
                          </span>
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#C6A66B] text-[#171717] shadow-sm shadow-[#C6A66B]/20">
                            <ShieldCheck size={13} />
                          </div>
                        </div>
                      </div>

                      <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#F1E9DA]/95">
                        {msg.message}
                      </div>
                    </div>
                  </div>
                );
              }

              // Customer query -> ALIGNED TO LEFT
              return (
                <div key={msg.id || index} className="flex justify-start w-full">
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tl-xs border border-[#3a352e] bg-[#1c1a17] p-4 text-[#F1E9DA] shadow-xl shadow-black/40">
                    <div className="flex items-center justify-between gap-3 border-b border-[#332f2a]/70 pb-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#292521] text-[#F1E9DA]">
                          <User size={13} />
                        </div>
                        <span className="font-sans text-xs font-bold text-[#F1E9DA]">
                          {selectedTicket.user?.name || msg.senderName || "Customer"}
                        </span>
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#F1E9DA]/60 border border-neutral-700">
                          Customer
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-[#F1E9DA]/45">
                        {new Date(msg.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#F1E9DA]/90">
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Staff Reply Box */}
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B]">
              Reply as Official Support Engineer
            </h3>

            {/* Canned responses dropdown / buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[#F1E9DA]/40 font-mono">Quick Snippets:</span>
              {CANNED_REPLIES.map((canned, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setReplyText(canned.text);
                    setReplyStatus(canned.status);
                  }}
                  className="rounded-lg border border-[#332f2a] bg-[#171717] px-2.5 py-1 text-[11px] font-mono text-[#F1E9DA]/70 hover:border-[#C6A66B]/50 hover:text-[#C6A66B] transition"
                >
                  {canned.title}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSendReply} className="space-y-4">
            <textarea
              rows={4}
              required
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your official technical response here..."
              className="w-full rounded-xl border border-[#332f2a] bg-[#171717] p-4 text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 focus:border-[#C6A66B] focus:outline-none focus:ring-1 focus:ring-[#C6A66B]"
            />

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#F1E9DA]/60">Set Ticket Status on Send:</span>
                <select
                  value={replyStatus}
                  onChange={(e) => setReplyStatus(e.target.value as TicketStatus)}
                  className="rounded-xl border border-[#332f2a] bg-[#171717] px-3 py-2 text-xs text-[#F1E9DA] focus:border-[#C6A66B] focus:outline-none"
                >
                  <option value="AWAITING_CUSTOMER">Awaiting Customer Reply</option>
                  <option value="IN_PROGRESS">In Progress (Staff Working)</option>
                  <option value="RESOLVED">Resolved (Issue Fixed)</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82] transition disabled:opacity-40"
              >
                {sendingReply ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    Send Staff Reply <Send size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // TABLE / LIST VIEW
  // ==========================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[#C6A66B]">
            <Headphones size={15} /> Support Desk Control
          </div>
          <h1 className="mt-1 font-serif text-2xl font-bold text-[#F1E9DA]">
            Customer Support Tickets
          </h1>
          <p className="text-xs text-[#F1E9DA]/60">
            Review, investigate, and reply to customer inquiries and technical issues.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-2.5 font-mono text-xs font-semibold text-[#F1E9DA]/80 hover:text-[#F1E9DA] hover:border-[#C6A66B]/40 transition self-start sm:self-center"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          <span>Refresh Desk</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[#F1E9DA]/50 hover:text-[#F1E9DA]"><X size={14} /></button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#F1E9DA]/50">Total Tickets</span>
          <div className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA]">{counts.total}</div>
        </div>

        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-blue-400">Open Tickets</span>
          <div className="mt-2 font-serif text-2xl font-bold text-blue-300">{counts.open}</div>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-amber-400">In Progress</span>
          <div className="mt-2 font-serif text-2xl font-bold text-amber-300">{counts.inProgress}</div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">Resolved</span>
          <div className="mt-2 font-serif text-2xl font-bold text-emerald-300">{counts.resolved}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#332f2a] bg-[#201d1a] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {["ALL", "OPEN", "IN_PROGRESS", "AWAITING_CUSTOMER", "RESOLVED", "CLOSED"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-xl px-3 py-1.5 font-mono text-[11px] font-semibold transition ${
                statusFilter === st
                  ? "bg-[#C6A66B] text-[#171717] shadow-md shadow-[#C6A66B]/15"
                  : "text-[#F1E9DA]/60 hover:bg-[#292521] hover:text-[#F1E9DA]"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-xl border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-[11px] text-[#F1E9DA] focus:border-[#C6A66B] focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent Priority</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#F1E9DA]/40" size={14} />
            <input
              type="text"
              placeholder="Search tickets, email, IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl border border-[#332f2a] bg-[#171717] py-1.5 pl-8 pr-3 text-xs text-[#F1E9DA] placeholder-[#F1E9DA]/40 focus:border-[#C6A66B] focus:outline-none w-56"
            />
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a] shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#332f2a] bg-[#1c1a17] font-mono text-[10px] uppercase tracking-wider text-[#C6A66B]">
              <tr>
                <th className="px-5 py-4">Ticket</th>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4">Subject & Category</th>
                <th className="px-5 py-4">Server</th>
                <th className="px-5 py-4">Priority</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Updated</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#332f2a]/60">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#F1E9DA]/50">
                    No tickets found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => {
                  const statusCfg = STATUS_STYLES[ticket.status] || STATUS_STYLES.OPEN;
                  const priorityCfg = PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.MEDIUM;
                  const categoryCfg = CATEGORY_LABELS[ticket.category] || CATEGORY_LABELS.VPS_TECHNICAL;

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className="group cursor-pointer hover:bg-[#25201b] transition"
                    >
                      <td className="px-5 py-4 font-mono font-bold text-[#C6A66B]">
                        #{ticket.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#F1E9DA]">
                          {ticket.user?.name || "Customer"}
                        </div>
                        <div className="font-mono text-[11px] text-[#F1E9DA]/50">
                          {ticket.user?.email}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#F1E9DA] group-hover:text-[#C6A66B] transition">
                          {ticket.subject}
                        </div>
                        <div className="text-[11px] text-[#F1E9DA]/50">
                          {categoryCfg.icon} {categoryCfg.label} • {ticket._count?.messages || 1} msg
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-[11px]">
                        {ticket.vpsInstance ? (
                          <span className="text-[#F1E9DA]/80">
                            {ticket.vpsInstance.ipAddress}
                          </span>
                        ) : (
                          <span className="text-[#F1E9DA]/30">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityCfg.badge}`}>
                          {priorityCfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusCfg.badge}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-[11px] text-[#F1E9DA]/50">
                        {new Date(ticket.updatedAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTicketId(ticket.id);
                          }}
                          className="rounded-xl border border-[#332f2a] bg-[#171717] px-3 py-1.5 font-mono text-xs font-semibold text-[#C6A66B] hover:bg-[#C6A66B] hover:text-[#171717] transition"
                        >
                          Review Thread
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
