import React, { useEffect, useState, useMemo } from "react";
import {
  Headphones,
  Plus,
  Search,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Clock,
  Server,
  ArrowRight,
  Send,
  X,
  RefreshCw,
  ShieldAlert,
  ChevronLeft,
  LifeBuoy,
  UserCheck,
  Shield,
} from "lucide-react";
import api from "./api";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "AWAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketCategory = "VPS_TECHNICAL" | "BILLING_WALLET" | "DEDICATED_IP" | "ACCOUNT_GENERAL";

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: "CUSTOMER" | "ADMIN";
  senderName: string;
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  vpsInstanceId?: string | null;
  vpsInstance?: {
    id: string;
    hostname: string | null;
    ipAddress: string;
    operatingSystem?: string | null;
    status?: string;
  } | null;
  _count?: {
    messages: number;
  };
  messages?: TicketMessage[];
  createdAt: string;
  updatedAt: string;
}

interface UserServer {
  id: string;
  hostname: string | null;
  ipAddress: string;
  operatingSystem: string | null;
  status: string;
}

interface EligibilityData {
  hasPurchased: boolean;
  servers: UserServer[];
}

interface CustomerSupportDeskProps {
  user: any;
  onGoToPlans?: () => void;
  supportContact?: Record<string, string>;
}

export const CATEGORY_LABELS: Record<TicketCategory, { label: string; icon: string }> = {
  VPS_TECHNICAL: { label: "VPS & Server Technical", icon: "🖥️" },
  BILLING_WALLET: { label: "Billing & Wallet Top-up", icon: "💳" },
  DEDICATED_IP: { label: "Dedicated IP & Routing", icon: "🌐" },
  ACCOUNT_GENERAL: { label: "Account & General", icon: "👤" },
};

export const PRIORITY_STYLES: Record<TicketPriority, { label: string; color: string; badge: string }> = {
  LOW: { label: "Low", color: "text-neutral-400", badge: "bg-neutral-800 text-neutral-300 border-neutral-700" },
  MEDIUM: { label: "Medium", color: "text-blue-400", badge: "bg-blue-900/30 text-blue-300 border-blue-800/40" },
  HIGH: { label: "High", color: "text-amber-400", badge: "bg-amber-900/30 text-amber-300 border-amber-800/40" },
  URGENT: { label: "Urgent", color: "text-red-400", badge: "bg-red-900/40 text-red-300 border-red-800/50" },
};

export const STATUS_STYLES: Record<TicketStatus, { label: string; badge: string }> = {
  OPEN: { label: "Open", badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  IN_PROGRESS: { label: "In Progress", badge: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
  AWAITING_CUSTOMER: { label: "Awaiting Your Reply", badge: "bg-purple-500/10 text-purple-300 border-purple-500/20" },
  RESOLVED: { label: "Resolved", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  CLOSED: { label: "Closed", badge: "bg-neutral-800 text-neutral-400 border-neutral-700" },
};

export default function CustomerSupportDesk({ user: _user, onGoToPlans, supportContact }: CustomerSupportDeskProps) {
  const [eligibility, setEligibility] = useState<EligibilityData | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [counts, setCounts] = useState({ total: 0, open: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active view: List or Detail
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // New ticket modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formSubject, setFormSubject] = useState("");
  const [formCategory, setFormCategory] = useState<TicketCategory>("VPS_TECHNICAL");
  const [formPriority, setFormPriority] = useState<TicketPriority>("MEDIUM");
  const [formServerId, setFormServerId] = useState<string>("");
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [closingTicket, setClosingTicket] = useState(false);

  // Fetch initial eligibility & tickets
  const fetchData = async () => {
    try {
      setError(null);
      const [eligRes, ticketsRes] = await Promise.all([
        api.get("/support/tickets/eligibility"),
        api.get("/support/tickets"),
      ]);

      setEligibility(eligRes.data);
      setTickets(ticketsRes.data.tickets || []);
      setCounts(ticketsRes.data.counts || { total: 0, open: 0, resolved: 0 });
    } catch (err: any) {
      console.error("Failed to load support data:", err);
      setError(err?.response?.data?.message || "Failed to load support information.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch thread details when selectedTicketId changes
  useEffect(() => {
    if (!selectedTicketId) {
      setSelectedTicket(null);
      return;
    }

    const loadThread = async () => {
      setLoadingThread(true);
      try {
        const res = await api.get(`/support/tickets/${selectedTicketId}`);
        setSelectedTicket(res.data);
      } catch (err: any) {
        console.error("Failed to load ticket thread:", err);
        setError("Failed to load ticket discussion.");
      } finally {
        setLoadingThread(false);
      }
    };

    loadThread();
  }, [selectedTicketId]);

  const handleRefresh = () => {
    setRefreshing(true);
    if (selectedTicketId) {
      api.get(`/support/tickets/${selectedTicketId}`)
        .then((res) => setSelectedTicket(res.data))
        .catch((e) => console.error(e))
        .finally(() => setRefreshing(false));
    } else {
      fetchData();
    }
  };

  // Submit new ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formSubject.trim() || formSubject.trim().length < 3) {
      setFormError("Please provide a descriptive subject (at least 3 characters).");
      return;
    }
    if (!formMessage.trim() || formMessage.trim().length < 5) {
      setFormError("Please provide details in the message (at least 5 characters).");
      return;
    }

    setCreating(true);
    try {
      const res = await api.post("/support/tickets", {
        subject: formSubject.trim(),
        category: formCategory,
        priority: formPriority,
        vpsInstanceId: formServerId ? formServerId : undefined,
        message: formMessage.trim(),
      });

      // Reset modal and form
      setShowCreateModal(false);
      setFormSubject("");
      setFormMessage("");
      setFormServerId("");
      setFormPriority("MEDIUM");
      setFormCategory("VPS_TECHNICAL");

      // Reload tickets and open the newly created ticket
      await fetchData();
      if (res.data?.id) {
        setSelectedTicketId(res.data.id);
      }
    } catch (err: any) {
      console.error("Create ticket error:", err);
      setFormError(err?.response?.data?.message || "Failed to create support ticket.");
    } finally {
      setCreating(false);
    }
  };

  // Submit reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyText.trim()) return;

    setSendingReply(true);
    try {
      const res = await api.post(`/support/tickets/${selectedTicketId}/reply`, {
        message: replyText.trim(),
      });

      setReplyText("");
      // Append message to current thread
      setSelectedTicket((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: "IN_PROGRESS",
          updatedAt: new Date().toISOString(),
          messages: [...(prev.messages || []), res.data],
        };
      });

      // Update list state in background
      api.get("/support/tickets").then((res) => {
        setTickets(res.data.tickets || []);
        setCounts(res.data.counts || counts);
      });
    } catch (err: any) {
      console.error("Failed to post reply:", err);
      alert(err?.response?.data?.message || "Failed to submit reply.");
    } finally {
      setSendingReply(false);
    }
  };

  // Close ticket
  const handleCloseTicket = async () => {
    if (!selectedTicketId) return;
    if (!confirm("Are you sure you want to mark this ticket as resolved and close it?")) return;

    setClosingTicket(true);
    try {
      await api.patch(`/support/tickets/${selectedTicketId}/close`);
      setSelectedTicket((prev) => (prev ? { ...prev, status: "CLOSED" } : null));
      fetchData();
    } catch (err: any) {
      console.error("Failed to close ticket:", err);
      alert(err?.response?.data?.message || "Failed to close ticket.");
    } finally {
      setClosingTicket(false);
    }
  };

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Status filter
      if (statusFilter === "ACTIVE") {
        if (t.status === "RESOLVED" || t.status === "CLOSED") return false;
      } else if (statusFilter === "RESOLVED") {
        if (t.status !== "RESOLVED" && t.status !== "CLOSED") return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSubject = t.subject.toLowerCase().includes(q);
        const matchId = t.id.toLowerCase().includes(q);
        const matchCategory = t.category.toLowerCase().includes(q);
        const matchIp = t.vpsInstance?.ipAddress.toLowerCase().includes(q);
        return matchSubject || matchId || matchCategory || matchIp;
      }

      return true;
    });
  }, [tickets, statusFilter, searchQuery]);

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
  // THREAD / DETAIL VIEW
  // ==========================================
  if (selectedTicketId && loadingThread && !selectedTicket) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-[#C6A66B]" />
          <p className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/60">
            Loading Discussion Thread...
          </p>
        </div>
      </div>
    );
  }

  if (selectedTicketId && selectedTicket) {
    const isClosed = selectedTicket.status === "CLOSED";

    return (
      <div className="mx-auto max-w-5xl space-y-6 pt-6 pb-12">
        {/* Top Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#332f2a] pb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedTicketId(null)}
              className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-3.5 py-2 font-mono text-xs font-semibold text-[#F1E9DA]/80 hover:border-[#C6A66B]/50 hover:text-[#C6A66B] transition"
            >
              <ChevronLeft size={16} /> Back to Tickets
            </button>
            <span className="font-mono text-xs text-[#F1E9DA]/40">
              Ticket #{selectedTicket.id.slice(0, 8).toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-[#332f2a] bg-[#201d1a] px-3 py-2 font-mono text-xs text-[#F1E9DA]/70 hover:text-[#F1E9DA] transition"
              title="Refresh discussion"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>

            {!isClosed && (
              <button
                onClick={handleCloseTicket}
                disabled={closingTicket}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 font-mono text-xs font-semibold text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                <span>{closingTicket ? "Closing..." : "Mark as Resolved"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Ticket Header Card */}
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
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
            </div>

            {selectedTicket.vpsInstance && (
              <div className="flex items-center gap-3 rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-xs">
                <Server className="text-[#C6A66B]" size={18} />
                <div>
                  <div className="font-mono font-bold text-[#F1E9DA]">
                    {selectedTicket.vpsInstance.ipAddress}
                  </div>
                  <div className="text-[11px] text-[#F1E9DA]/50">
                    {selectedTicket.vpsInstance.hostname || "VPS Instance"}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-4 border-t border-[#332f2a]/60 pt-3 text-[11px] text-[#F1E9DA]/50">
            <span>Opened: {new Date(selectedTicket.createdAt).toLocaleString("en-IN")}</span>
            <span>•</span>
            <span>Last Activity: {new Date(selectedTicket.updatedAt).toLocaleString("en-IN")}</span>
          </div>
        </div>

        {/* Conversation Thread */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#332f2a] pb-2">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B]">
              Communication History ({selectedTicket.messages?.length || 0})
            </h2>
            <span className="font-mono text-[11px] text-[#F1E9DA]/40">
              Support Staff (Left) · You (Right)
            </span>
          </div>

          <div className="space-y-4 rounded-2xl border border-[#332f2a] bg-[#181614]/70 p-4 sm:p-6 shadow-inner">
            {selectedTicket.messages?.map((msg, index) => {
              const isStaff = msg.senderRole === "ADMIN";
              const isCustomer = !isStaff;

              if (isCustomer) {
                // Customer Message -> ALIGNED TO RIGHT
                return (
                  <div key={msg.id || index} className="flex justify-end w-full">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs border border-[#C6A66B]/35 bg-gradient-to-br from-[#2b241c] to-[#221c16] p-4 text-[#F1E9DA] shadow-xl shadow-black/40">
                      <div className="flex items-center justify-between gap-3 border-b border-[#C6A66B]/20 pb-2 mb-2.5">
                        <span className="font-mono text-[10px] text-[#F1E9DA]/45">
                          {new Date(msg.createdAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-sans text-xs font-bold text-[#F1E9DA]">
                            {msg.senderName || "You"}
                          </span>
                          <span className="rounded bg-[#C6A66B]/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#C6A66B] border border-[#C6A66B]/30">
                            You
                          </span>
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#C6A66B]/20 text-[#C6A66B]">
                            <UserCheck size={13} />
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

              // Staff Message -> ALIGNED TO LEFT
              return (
                <div key={msg.id || index} className="flex justify-start w-full">
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tl-xs border border-[#3e3830] bg-[#1d1b18] p-4 text-[#F1E9DA] shadow-xl shadow-black/40">
                    <div className="flex items-center justify-between gap-3 border-b border-[#332f2a]/70 pb-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#C6A66B] text-[#171717] shadow-sm shadow-[#C6A66B]/30">
                          <Shield size={13} />
                        </div>
                        <span className="font-sans text-xs font-bold text-[#C6A66B]">
                          24/7 Support Engineer
                        </span>
                        <span className="rounded bg-[#C6A66B]/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#C6A66B] border border-[#C6A66B]/40">
                          Official Staff
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

        {/* Reply Box */}
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-xl">
          {isClosed ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 size={36} className="text-emerald-400 mb-2" />
              <h3 className="font-serif text-lg font-bold text-[#F1E9DA]">
                This ticket has been marked as resolved
              </h3>
              <p className="mt-1 text-xs text-[#F1E9DA]/60 max-w-md">
                Need more help on this subject? Type a message below to reopen this inquiry immediately.
              </p>
            </div>
          ) : (
            <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B]">
              Add Response to Support Team
            </h3>
          )}

          <form onSubmit={handleSendReply} className="space-y-4">
            <textarea
              rows={4}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Provide more information, server details, or answer questions from our staff..."
              className="w-full rounded-xl border border-[#332f2a] bg-[#171717] p-4 text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 focus:border-[#C6A66B] focus:outline-none focus:ring-1 focus:ring-[#C6A66B]"
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#F1E9DA]/40">
                {isClosed ? "Sending a reply will reopen this ticket." : "Our support team replies typically within 15 minutes."}
              </span>

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
                    Send Reply <Send size={14} />
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
  // TICKETS LIST / OVERVIEW VIEW
  // ==========================================
  return (
    <div className="mx-auto max-w-6xl space-y-8 pt-8 pb-16">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[#C6A66B]">
            <Headphones size={15} /> 24/7 Dedicated Support Desk
          </div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-[#F1E9DA] sm:text-4xl">
            Customer Support & Inquiries
          </h1>
          <p className="mt-2 text-sm text-[#F1E9DA]/65 max-w-2xl">
            Direct access to senior cloud engineers for infrastructure assistance, wallet top-ups, dedicated IP routing, and server troubleshooting.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-3 font-mono text-xs font-semibold text-[#F1E9DA]/80 hover:text-[#F1E9DA] hover:border-[#C6A66B]/40 transition"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              if (eligibility && !eligibility.hasPurchased) {
                alert("Ticketing is reserved for active VPS subscribers. Please purchase an instance or contact sales.");
                return;
              }
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/15 hover:bg-[#d8ba82] transition"
          >
            <Plus size={16} /> Open New Ticket
          </button>
        </div>
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

      {/* Post-Purchase Requirement Notice if not eligible */}
      {eligibility && !eligibility.hasPurchased && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-[#F1E9DA]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <h3 className="font-serif text-base font-bold text-amber-300">
                  Support Desk Reserved for Active VPS Subscribers
                </h3>
                <p className="mt-1 text-xs leading-5 text-[#F1E9DA]/75 max-w-xl">
                  Our 24/7 technical ticketing infrastructure is dedicated to customers with an active server instance.
                  Once you order any Windows or Linux VPS, this ticketing desk will automatically unlock with priority 15-minute SLA.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {onGoToPlans && (
                <button
                  onClick={onGoToPlans}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#C6A66B] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82] transition"
                >
                  Browse VPS Plans <ArrowRight size={14} />
                </button>
              )}
              {supportContact?.whatsappUrl && (
                <a
                  href={supportContact.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#C6A66B] bg-[#C6A66B]/10 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B] hover:bg-[#C6A66B]/20 transition"
                >
                  WhatsApp
                </a>
              )}
              <a
                href={supportContact?.email ? `mailto:${supportContact.email}` : "mailto:sales@247hrservice.com"}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#332f2a] bg-[#201d1a] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/80 hover:text-[#F1E9DA] transition"
              >
                Pre-Sales Inquiry
              </a>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Total Tickets</span>
            <MessageSquare size={18} className="text-[#C6A66B]" />
          </div>
          <div className="mt-3 font-serif text-3xl font-bold text-[#F1E9DA]">{counts.total}</div>
          <p className="mt-1 text-[11px] text-[#F1E9DA]/40">All customer support requests</p>
        </div>

        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Active & In Progress</span>
            <Clock size={18} className="text-amber-400" />
          </div>
          <div className="mt-3 font-serif text-3xl font-bold text-amber-400">{counts.open}</div>
          <p className="mt-1 text-[11px] text-[#F1E9DA]/40">Currently being handled by engineers</p>
        </div>

        <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-[#F1E9DA]/50">Resolved Inquiries</span>
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div className="mt-3 font-serif text-3xl font-bold text-emerald-400">{counts.resolved}</div>
          <p className="mt-1 text-[11px] text-[#F1E9DA]/40">Successfully closed inquiries</p>
        </div>
      </div>

      {/* Main List Container */}
      <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] shadow-xl overflow-hidden">
        {/* Filters and Search Bar */}
        <div className="flex flex-col gap-4 border-b border-[#332f2a] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {[
              { id: "ALL", label: `All Tickets (${tickets.length})` },
              { id: "ACTIVE", label: `Active (${counts.open})` },
              { id: "RESOLVED", label: `Resolved (${counts.resolved})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-xl px-3.5 py-2 font-mono text-xs font-semibold transition ${
                  statusFilter === tab.id
                    ? "bg-[#C6A66B] text-[#171717] shadow-md shadow-[#C6A66B]/15"
                    : "text-[#F1E9DA]/60 hover:bg-[#292521] hover:text-[#F1E9DA]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#F1E9DA]/40" size={15} />
            <input
              type="text"
              placeholder="Search by subject or IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#332f2a] bg-[#171717] py-2 pl-9 pr-3 text-xs text-[#F1E9DA] placeholder-[#F1E9DA]/40 focus:border-[#C6A66B] focus:outline-none"
            />
          </div>
        </div>

        {/* Tickets Table / List */}
        {filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <LifeBuoy className="h-12 w-12 text-[#C6A66B]/40 mb-3" />
            <h3 className="font-serif text-lg font-bold text-[#F1E9DA]">No support tickets found</h3>
            <p className="mt-1 text-xs text-[#F1E9DA]/60 max-w-sm">
              {searchQuery || statusFilter !== "ALL"
                ? "No tickets match your filter criteria."
                : "You don't have any support tickets yet. Click 'Open New Ticket' if you need assistance."}
            </p>
            {(!searchQuery && statusFilter === "ALL" && eligibility?.hasPurchased) && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-5 rounded-xl bg-[#C6A66B] px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82] transition"
              >
                Open Your First Ticket
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#332f2a]/60">
            {filteredTickets.map((ticket) => {
              const statusCfg = STATUS_STYLES[ticket.status] || STATUS_STYLES.OPEN;
              const priorityCfg = PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.MEDIUM;
              const categoryCfg = CATEGORY_LABELS[ticket.category] || CATEGORY_LABELS.VPS_TECHNICAL;

              return (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className="group flex flex-col justify-between gap-4 p-5 transition hover:bg-[#25201b] sm:flex-row sm:items-center cursor-pointer"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-[#C6A66B]">
                        #{ticket.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusCfg.badge}`}>
                        {statusCfg.label}
                      </span>
                      <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityCfg.badge}`}>
                        {priorityCfg.label}
                      </span>
                      <span className="inline-flex items-center rounded-lg border border-[#332f2a] bg-[#171717] px-2 py-0.5 text-[10px] text-[#F1E9DA]/70">
                        {categoryCfg.icon} {categoryCfg.label}
                      </span>
                    </div>

                    <h4 className="font-sans text-base font-bold text-[#F1E9DA] group-hover:text-[#C6A66B] transition">
                      {ticket.subject}
                    </h4>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#F1E9DA]/45">
                      {ticket.vpsInstance && (
                        <span className="flex items-center gap-1 font-mono text-[#F1E9DA]/70">
                          <Server size={12} className="text-[#C6A66B]" /> {ticket.vpsInstance.ipAddress}
                        </span>
                      )}
                      <span>Updated {new Date(ticket.updatedAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}</span>
                      <span>•</span>
                      <span>{ticket._count?.messages || 1} message(s)</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className="font-mono text-xs font-semibold text-[#C6A66B] group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      View Discussion <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* NEW TICKET MODAL */}
      {/* ========================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-[#332f2a] bg-[#201d1a] p-7 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#332f2a] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#C6A66B]/10 text-[#C6A66B]">
                  <LifeBuoy size={20} />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#F1E9DA]">Open Support Ticket</h3>
                  <p className="text-xs text-[#F1E9DA]/50">Certified technical support desk</p>
                </div>
              </div>

              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-[#F1E9DA]/50 hover:bg-[#292521] hover:text-[#F1E9DA] transition"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTicket} className="mt-5 space-y-4">
              <div>
                <label className="block font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B] mb-1.5">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cannot connect to RDP on Windows VPS / Wallet top-up query"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 focus:border-[#C6A66B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B] mb-1.5">
                    Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as TicketCategory)}
                    className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-3.5 py-3 text-xs text-[#F1E9DA] focus:border-[#C6A66B] focus:outline-none"
                  >
                    <option value="VPS_TECHNICAL">🖥️ VPS Technical Issue</option>
                    <option value="BILLING_WALLET">💳 Billing & Wallet</option>
                    <option value="DEDICATED_IP">🌐 Dedicated IP & Routing</option>
                    <option value="ACCOUNT_GENERAL">👤 Account & General</option>
                  </select>
                </div>

                <div>
                  <label className="block font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B] mb-1.5">
                    Priority *
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as TicketPriority)}
                    className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-3.5 py-3 text-xs text-[#F1E9DA] focus:border-[#C6A66B] focus:outline-none"
                  >
                    <option value="LOW">Low (General Inquiry)</option>
                    <option value="MEDIUM">Medium (Non-critical)</option>
                    <option value="HIGH">High (Service Degraded)</option>
                    <option value="URGENT">Urgent (Server Offline)</option>
                  </select>
                </div>
              </div>

              {/* Server selector if available */}
              {eligibility?.servers && eligibility.servers.length > 0 && (
                <div>
                  <label className="block font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B] mb-1.5">
                    Select Affected Server (Optional)
                  </label>
                  <select
                    value={formServerId}
                    onChange={(e) => setFormServerId(e.target.value)}
                    className="w-full rounded-xl border border-[#332f2a] bg-[#171717] px-3.5 py-3 text-xs text-[#F1E9DA] focus:border-[#C6A66B] focus:outline-none"
                  >
                    <option value="">-- No Specific Server --</option>
                    {eligibility.servers.map((srv) => (
                      <option key={srv.id} value={srv.id}>
                        {srv.ipAddress} ({srv.hostname || "Server"}) - {srv.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-mono text-xs font-bold uppercase tracking-wider text-[#C6A66B] mb-1.5">
                  Detailed Message *
                </label>
                <textarea
                  required
                  rows={5}
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  placeholder="Please describe the issue in detail. If applicable, mention the error code, steps you tried, or connection screenshots..."
                  className="w-full rounded-xl border border-[#332f2a] bg-[#171717] p-4 text-sm text-[#F1E9DA] placeholder-[#F1E9DA]/30 focus:border-[#C6A66B] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-[#332f2a] bg-[#171717] px-5 py-3 font-mono text-xs font-semibold text-[#F1E9DA]/70 hover:text-[#F1E9DA] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 rounded-xl bg-[#C6A66B] px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#171717] hover:bg-[#d8ba82] transition disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Submitting...
                    </>
                  ) : (
                    <>
                      Submit Ticket <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
