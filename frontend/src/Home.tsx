import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Server,
  Zap,
  Globe,
  Headphones,
  CheckCircle2,
  Menu,
  X,
  Network,
  Monitor,
  Terminal,
  Activity,
  Layers,
  ChevronDown,
  Cpu,
  HardDrive,
  RefreshCw,
  Loader2,
  Camera,
  Users,
  MessageCircle,
  Video,
  Send,
} from "lucide-react";
import logo from "./assets/247-logo.png";
import api from "./api";

type VPSPlan = {
  id: string;
  name: string;
  productType: string;
  description?: string;
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  bandwidthGb?: number | null;
  price: number | string;
  monthlyPrice?: number | string;
  currency: string;
  durationDays?: number;
  supportedOS?: string[];
  location?: string;
  tier?: string;
  isHostHeaven?: boolean;
  isActive?: boolean;
};

type SmartVPSPlan = {
  ramGb: number;
  name: string;
  availableCount: number;
  price: number | string;
  monthlyPrice?: number | string;
  currency: string;
  inStock: boolean;
};

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [plans, setPlans] = useState<VPSPlan[]>([]);
  const [smartVpsPlans, setSmartVpsPlans] = useState<SmartVPSPlan[]>([]);
  const [smartVpsLoading, setSmartVpsLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [dedicatedIpAvailable, setDedicatedIpAvailable] = useState(true);
  const [selectedHeroIndex, setSelectedHeroIndex] = useState<number>(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [supportContact, setSupportContact] = useState<Record<string, string>>({});

  const closeMenu = () => setMobileMenuOpen(false);

  // Fetch real plans directly from existing backend API
  const fetchPlans = useCallback(async () => {
    try {
      setPlansLoading(true);
      setPlansError("");
      const res = await api.get("/plans");
      const raw = Array.isArray(res.data) ? res.data : res.data?.plans;
      if (Array.isArray(raw)) {
        setPlans(raw.filter((p: VPSPlan) => p.isActive !== false));
      } else {
        setPlans([]);
      }
    } catch (err: any) {
      console.warn("Could not fetch live plans:", err);
      setPlans([]);
      setPlansError(
        err?.response?.data?.message ||
          "Unable to load live VPS plans at this time. Please refresh shortly."
      );
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const fetchSmartVpsPlans = useCallback(async () => {
    try {
      setSmartVpsLoading(true);
      const res = await api.get("/plans/smartvps");
      const rows = Array.isArray(res.data?.plans) ? res.data.plans : [];
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

  // Fetch dedicated IP status from existing admin setting
  const fetchDedicatedIpStatus = useCallback(async () => {
    try {
      const res = await api.get("/plans/dedicated-ip-status");
      setDedicatedIpAvailable(res.data?.enabled === true);
    } catch {
      setDedicatedIpAvailable(false);
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

  useEffect(() => {
    void fetchPlans();
    void fetchSmartVpsPlans();
    void fetchDedicatedIpStatus();
    void fetchSupportContact();
  }, [fetchPlans, fetchSmartVpsPlans, fetchDedicatedIpStatus, fetchSupportContact]);

  // Representative dynamic plans directly from backend (No hardcoded fallback plans)
  const pricingPlans = useMemo(() => {
    if (plans.length === 0) return [];

    // Sort by actual backend customer selling price ascending
    const sorted = [...plans].sort(
      (a, b) => Number(a.monthlyPrice ?? a.price) - Number(b.monthlyPrice ?? b.price)
    );

    const first = sorted[0];
    const dedicated =
      sorted.find(
        (p) =>
          p.tier?.toLowerCase().includes("dedicated") ||
          p.name?.toLowerCase().includes("dedicated")
      ) || sorted[sorted.length - 1];
    const middle =
      sorted.find((p) => p.id !== first?.id && p.id !== dedicated?.id) ||
      sorted[Math.min(1, sorted.length - 1)];

    const selected: VPSPlan[] = [];
    if (first) selected.push(first);
    if (middle && middle.id !== first?.id) selected.push(middle);
    if (dedicated && dedicated.id !== first?.id && dedicated.id !== middle?.id) {
      selected.push(dedicated);
    }

    return selected.map((p, idx) => ({
      ...p,
      isRecommended: idx === 1 || selected.length === 1,
    }));
  }, [plans]);

  // Selected hero preview plan from real loaded plans
  const activeHeroPlan = useMemo(() => {
    if (plans.length === 0) return null;
    return plans[selectedHeroIndex] || plans[0];
  }, [plans, selectedHeroIndex]);

  // Format backend selling price respecting currency and locale
  const formatSellingPrice = (amount?: number | string, currency?: string) => {
    const val = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(val) || val <= 0) return "—";

    if (!currency || typeof currency !== "string") return "—";
    const curr = currency.trim().toUpperCase();
    const isValidCurrency = /^[A-Z]{3}$/.test(curr);
    if (!isValidCurrency) return "—";

    try {
      const locale = curr === "INR" ? "en-IN" : "en-US";
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: curr,
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(val);
    } catch {
      return "—";
    }
  };

  // Handle plan purchase click -> checkout or login
  const handleSelectPlan = (planId?: string) => {
    const token = sessionStorage.getItem("indiccloud_token");
    if (token) {
      window.location.href = planId ? `/checkout?planId=${planId}` : "/checkout";
    } else {
      window.location.href = planId ? `/login?planId=${planId}` : "/login";
    }
  };

  const faqs = [
    {
      q: "What operating systems are supported?",
      a: "Supported operating systems depend on the selected plan catalogue and provider availability, commonly including Linux distributions (such as Ubuntu, Debian, AlmaLinux, or Rocky) and Windows Server where indicated on the plan.",
    },
    {
      q: "Can I upgrade my VPS resources?",
      a: "Resource upgrades depend on the provider plan and available host capacity. If you require additional compute, memory, or storage, check available plans in your dashboard or contact support.",
    },
    {
      q: "How are Dedicated IP addresses assigned?",
      a: "Dedicated IP addresses are assigned from available provider inventory based on the selected region and specifications listed in the catalogue.",
    },
    {
      q: "Can I install custom operating system images?",
      a: "Operating system options are limited to the pre-configured choices supported by the provider for each plan.",
    },
    {
      q: "What support is provided for hosted services?",
      a: "Support is available for account assistance, order processing, and control panel access. Operating system configuration and application maintenance are managed by the server administrator.",
    },
  ];

  return (
    <main className="min-h-screen bg-[#171717] font-sans text-[#F1E9DA] selection:bg-[#C6A66B]/30 selection:text-[#F1E9DA]">
      {/* =========================================================================
          1. NAVIGATION BAR
          ========================================================================= */}
      <nav className="sticky top-0 z-50 border-b border-[#292521] bg-[#171717]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-10">
          {/* Brand Logo */}
          <a href="/" className="flex shrink-0 items-center gap-3 group">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#C6A66B]/40 bg-[#292521] p-1 shadow-md transition group-hover:border-[#C6A66B]">
              <img
                src={logo}
                alt="24/7 Logo"
                className="h-full w-full rounded-full object-contain"
              />
            </div>
            <div>
              <span className="block font-serif text-lg font-bold tracking-tight text-[#F1E9DA] transition group-hover:text-[#C6A66B]">
                24/7 CLOUD HOSTING
              </span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-[#C6A66B]">
                Enterprise Infrastructure
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <div className="hidden items-center gap-7 text-xs font-medium uppercase tracking-[0.15em] text-[#F1E9DA]/80 lg:flex">
            <a href="/" className="transition hover:text-[#C6A66B]">
              Home
            </a>
            <a href="#workloads" className="transition hover:text-[#C6A66B]">
              Linux VPS
            </a>
            <a href="#workloads" className="transition hover:text-[#C6A66B]">
              Windows VPS
            </a>
            {dedicatedIpAvailable && (
              <a href="/dedicated-ip" className="transition hover:text-[#C6A66B]">
                Dedicated IP
              </a>
            )}
            <a href="#architecture" className="transition hover:text-[#C6A66B]">
              Infrastructure
            </a>
            <a href="#pricing" className="transition hover:text-[#C6A66B]">
              Pricing
            </a>
            <a href="#faq" className="transition hover:text-[#C6A66B]">
              FAQ
            </a>
          </div>

          {/* Desktop Actions */}
          <div className="hidden shrink-0 items-center gap-4 lg:flex">
            <a
              href="/login"
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#F1E9DA] transition hover:text-[#C6A66B]"
            >
              Login
            </a>
            <button
              onClick={() => handleSelectPlan()}
              className="rounded-full bg-[#C6A66B] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#171717] shadow-lg shadow-[#C6A66B]/15 transition duration-200 hover:bg-[#d8ba82]"
            >
              Get Started
            </button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg border border-[#292521] p-2 text-[#F1E9DA] transition hover:bg-[#292521] lg:hidden"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="border-t border-[#292521] bg-[#171717] px-6 py-6 shadow-2xl lg:hidden">
            <div className="flex flex-col gap-3 text-sm font-semibold text-[#F1E9DA]">
              <a onClick={closeMenu} href="/" className="rounded-lg px-4 py-2 hover:bg-[#292521]">
                Home
              </a>
              <a onClick={closeMenu} href="#workloads" className="rounded-lg px-4 py-2 hover:bg-[#292521]">
                Linux VPS
              </a>
              <a onClick={closeMenu} href="#workloads" className="rounded-lg px-4 py-2 hover:bg-[#292521]">
                Windows VPS
              </a>
              {dedicatedIpAvailable && (
                <a onClick={closeMenu} href="/dedicated-ip" className="rounded-lg px-4 py-2 hover:bg-[#292521]">
                  Dedicated IP
                </a>
              )}
              <a onClick={closeMenu} href="#architecture" className="rounded-lg px-4 py-2 hover:bg-[#292521]">
                Infrastructure
              </a>
              <a onClick={closeMenu} href="#pricing" className="rounded-lg px-4 py-2 hover:bg-[#292521]">
                Pricing
              </a>
              <a onClick={closeMenu} href="#faq" className="rounded-lg px-4 py-2 hover:bg-[#292521]">
                FAQ
              </a>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#292521] pt-4">
                <a
                  onClick={closeMenu}
                  href="/login"
                  className="rounded-lg border border-[#292521] px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-[#F1E9DA]"
                >
                  Login
                </a>
                <button
                  onClick={() => {
                    closeMenu();
                    handleSelectPlan();
                  }}
                  className="rounded-lg bg-[#C6A66B] px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-[#171717]"
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* =========================================================================
          2. LARGE DARK HERO SECTION (Obsidian #171717)
          ========================================================================= */}
      <section className="relative overflow-hidden bg-[#171717] px-6 pb-24 pt-16 lg:px-10 lg:pb-32 lg:pt-24">
        {/* Subtle Ambient Gold Glow Background */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-[#C6A66B]/5 blur-[160px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Headline & Value Proposition */}
          <div className="lg:col-span-7">
            {/* Eyebrow Pill */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#C6A66B]/30 bg-[#292521]/70 px-4 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-[#C6A66B]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C6A66B] animate-pulse" />
              ENTERPRISE INFRASTRUCTURE · PURE NVME · DEDICATED IP
            </div>

            {/* Serif Luxury Heading */}
            <h1 className="max-w-2xl font-serif text-4xl font-bold leading-[1.12] tracking-tight text-[#F1E9DA] sm:text-5xl lg:text-6xl">
              Power Your Digital World with{" "}
              <span className="italic text-[#C6A66B]">Premium VPS Hosting</span>
            </h1>

            {/* Subtitle */}
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-[#F1E9DA]/75 sm:text-base">
              High-performance virtual private servers engineered for mission-critical applications and scalable workloads. Reliable cloud infrastructure powered by verified enterprise hardware.
            </p>

            {/* CTA Buttons */}
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button
                onClick={() => handleSelectPlan()}
                className="inline-flex items-center gap-2.5 rounded-lg bg-[#C6A66B] px-7 py-3.5 text-xs font-bold uppercase tracking-wider text-[#171717] shadow-xl shadow-[#C6A66B]/20 transition duration-200 hover:bg-[#d8ba82]"
              >
                Deploy VPS Now <ArrowRight size={16} />
              </button>

              <a
                href="#pricing"
                className="inline-flex items-center gap-2 rounded-lg border border-[#292521] bg-[#292521]/40 px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#F1E9DA] transition hover:border-[#C6A66B]/40 hover:bg-[#292521]"
              >
                View Available Plans
              </a>
            </div>

            {/* Verified Architectural Highlights */}
            <div className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-[#292521] pt-8">
              <div>
                <p className="font-serif text-xl font-bold text-[#C6A66B]">NVMe Storage</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-[#F1E9DA]/60">
                  Solid-State Arrays
                </p>
              </div>
              <div>
                <p className="font-serif text-xl font-bold text-[#F1E9DA]">Cloud Compute</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-[#F1E9DA]/60">
                  Verified Catalogue
                </p>
              </div>
              <div>
                <p className="font-serif text-xl font-bold text-[#F1E9DA]">Network Peering</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-[#F1E9DA]/60">
                  Regional Routing
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Live Server Telemetry Preview Widget */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-2xl shadow-black/60">
              {/* Header with Switcher Tabs */}
              <div className="flex items-center justify-between border-b border-[#332f2a] pb-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#C6A66B]">
                    HARDWARE PREVIEW
                  </span>
                </div>

                {plans.length > 0 ? (
                  <div className="flex gap-1 rounded-lg border border-[#332f2a] bg-[#171717] p-1">
                    {plans.slice(0, 3).map((p, idx) => (
                      <button
                        key={p.id || idx}
                        onClick={() => setSelectedHeroIndex(idx)}
                        className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase transition ${
                          selectedHeroIndex === idx
                            ? "bg-[#C6A66B] text-[#171717]"
                            : "text-[#F1E9DA]/60 hover:text-[#F1E9DA]"
                        }`}
                      >
                        Node {idx + 1}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="font-mono text-[10px] text-[#F1E9DA]/40">
                    {plansLoading ? "Loading..." : "Catalogue Sync"}
                  </span>
                )}
              </div>

              {/* Node Specifications Grid */}
              {activeHeroPlan ? (
                <div className="mt-5 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between rounded-lg border border-[#332f2a]/80 bg-[#171717] p-3">
                    <div className="flex items-center gap-2.5 text-[#F1E9DA]/80">
                      <Cpu size={15} className="text-[#C6A66B]" />
                      <span>vCPU Compute</span>
                    </div>
                    <span className="font-semibold text-[#F1E9DA]">
                      {activeHeroPlan.cpuCores} vCPU Cores
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-[#332f2a]/80 bg-[#171717] p-3">
                    <div className="flex items-center gap-2.5 text-[#F1E9DA]/80">
                      <Layers size={15} className="text-[#C6A66B]" />
                      <span>Memory Allocation</span>
                    </div>
                    <span className="font-semibold text-[#F1E9DA]">
                      {activeHeroPlan.ramGb} GB RAM
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-[#332f2a]/80 bg-[#171717] p-3">
                    <div className="flex items-center gap-2.5 text-[#F1E9DA]/80">
                      <HardDrive size={15} className="text-[#C6A66B]" />
                      <span>NVMe Storage</span>
                    </div>
                    <span className="font-semibold text-[#F1E9DA]">
                      {activeHeroPlan.storageGb} GB NVMe
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-[#332f2a]/80 bg-[#171717] p-3">
                    <div className="flex items-center gap-2.5 text-[#F1E9DA]/80">
                      <Network size={15} className="text-[#C6A66B]" />
                      <span>Transit Bandwidth</span>
                    </div>
                    <span className="font-semibold text-[#F1E9DA]">
                      {activeHeroPlan.bandwidthGb ? `${activeHeroPlan.bandwidthGb} GB` : "Included"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="my-8 flex flex-col items-center justify-center gap-2 text-center text-xs text-[#F1E9DA]/50">
                  {plansLoading ? (
                    <>
                      <Loader2 size={24} className="animate-spin text-[#C6A66B]" />
                      <p className="mt-2 font-mono">Loading live hardware catalogue...</p>
                    </>
                  ) : (
                    <>
                      <Server size={24} className="text-[#C6A66B]/50" />
                      <p className="mt-2 font-mono">Specifications available upon catalogue sync</p>
                    </>
                  )}
                </div>
              )}

              {/* Clearly Labelled Non-Numeric Decorative Visual Indicators */}
              <div className="mt-5 space-y-2.5 border-t border-[#332f2a] pt-4 text-xs font-mono">
                <div>
                  <div className="flex justify-between text-[11px] text-[#F1E9DA]/70">
                    <span>Compute Allocation</span>
                    <span className="text-[#C6A66B]">Allocated Hardware</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-[#171717]">
                    <div className="h-full w-full rounded-full bg-[#C6A66B]/80" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#F1E9DA]/70">
                    <span>Storage Engine</span>
                    <span className="text-[#C6A66B]">Enterprise NVMe Array</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-[#171717]">
                    <div className="h-full w-full rounded-full bg-[#C6A66B]/80" />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px] text-[#F1E9DA]/70">
                  <span>Network Routing</span>
                  <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <Activity size={13} /> Active Network Routing
                  </span>
                </div>
              </div>

              {/* Bottom Price & Direct Action */}
              <div className="mt-6 flex items-center justify-between border-t border-[#332f2a] pt-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/60">Customer Price</p>
                  <p className="font-serif text-2xl font-bold text-[#F1E9DA]">
                    {formatSellingPrice(activeHeroPlan?.monthlyPrice ?? activeHeroPlan?.price, activeHeroPlan?.currency)}{" "}
                    <span className="text-xs font-sans font-normal text-[#F1E9DA]/60">/ mo</span>
                  </p>
                </div>
                <button
                  disabled={!activeHeroPlan}
                  onClick={() => handleSelectPlan(activeHeroPlan?.id)}
                  className="rounded-lg bg-[#C6A66B] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8ba82] disabled:opacity-50"
                >
                  Configure
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. LIGHT PERFORMANCE BENEFITS SECTION (Warm Ivory #F1E9DA)
          ========================================================================= */}
      <section id="architecture" className="bg-[#F1E9DA] px-6 py-20 text-[#171717] lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          {/* Section Header */}
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
                ENTERPRISE CLOUD ARCHITECTURE
              </p>
              <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#171717] sm:text-4xl lg:text-5xl">
                Architected for Uncompromising Performance
              </h2>
            </div>
            <div className="lg:col-span-4">
              <p className="text-sm leading-relaxed text-[#292521]/80">
                Virtual servers are provisioned across enterprise hardware architectures designed for steady performance and predictable resource availability.
              </p>
            </div>
          </div>

          {/* 6 Elegant Dark Charcoal Cards */}
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Server,
                title: "Enterprise Infrastructure",
                desc: "Powered by high-performance multi-core processors paired with enterprise NVMe storage arrays for high IOPS throughput.",
                tag: "Enterprise NVMe",
              },
              {
                icon: Activity,
                title: "Performance-Focused Routing",
                desc: "Regional network peering providing responsive connectivity for your hosted applications.",
                tag: "Network Peering",
              },
              {
                icon: Layers,
                title: "Flexible Configurations",
                desc: "Choose between varying CPU cores, RAM allocations, and storage options matched to your workload demands.",
                tag: "Dynamic Scaling",
              },
              {
                icon: Zap,
                title: "High-Availability Architecture",
                desc: "Multi-tenant cloud infrastructure designed for hardware resilience and operational consistency.",
                tag: "High Availability",
              },
              {
                icon: Headphones,
                title: "Dedicated Support Desk",
                desc: "Customer support assistance for account management, service provisioning, and billing inquiries.",
                tag: "Support Desk",
              },
              {
                icon: ShieldCheck,
                title: "Predictable Pricing",
                desc: "No renewal rate jumps. No hidden egress surcharges. Straightforward, predictable billing based on actual resource allocation.",
                tag: "Predictable Billing",
              },
            ].map(({ icon: Icon, title, desc, tag }) => (
              <div
                key={title}
                className="group relative flex flex-col justify-between rounded-xl border border-[#332f2a] bg-[#201d1a] p-7 text-[#F1E9DA] shadow-lg transition duration-200 hover:-translate-y-1 hover:border-[#C6A66B]/50"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="rounded-lg border border-[#C6A66B]/20 bg-[#171717] p-2.5 text-[#C6A66B]">
                      <Icon size={20} />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6A66B]">
                      {tag}
                    </span>
                  </div>
                  <h3 className="mt-5 font-serif text-xl font-bold tracking-tight text-[#F1E9DA]">
                    {title}
                  </h3>
                  <p className="mt-3 text-xs leading-relaxed text-[#F1E9DA]/70">
                    {desc}
                  </p>
                </div>
                <div className="mt-6 border-t border-[#332f2a] pt-4 font-mono text-[11px] text-[#F1E9DA]/40 group-hover:text-[#C6A66B] transition">
                  → Infrastructure Verified
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. DARK PRODUCT WORKLOAD CATEGORY SECTION (Obsidian #171717)
          ========================================================================= */}
      <section id="workloads" className="bg-[#171717] px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
              LINUX · WINDOWS · DEDICATED
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#F1E9DA] sm:text-4xl lg:text-5xl">
              Tailored Compute for Every Workload
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-[#F1E9DA]/70">
              Select between root-level Linux architectures, enterprise Windows Server environments, or dedicated IPv4 allocations.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {/* Linux VPS Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#332f2a] bg-[#201d1a] p-8 shadow-xl transition hover:border-[#C6A66B]/50">
              <div>
                <div className="flex items-center justify-between">
                  <div className="rounded-lg border border-[#C6A66B]/20 bg-[#171717] p-3 text-[#C6A66B]">
                    <Terminal size={22} />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6A66B]">
                    ROOT ACCESS
                  </span>
                </div>
                <h3 className="mt-6 font-serif text-2xl font-bold text-[#F1E9DA]">Linux VPS</h3>
                <p className="mt-3 text-xs leading-relaxed text-[#F1E9DA]/70">
                  Full root SSH access with verified templates including Ubuntu, Debian, AlmaLinux, and Rocky. Engineered for web servers, databases, and microservices.
                </p>

                <ul className="mt-6 space-y-2.5 text-xs text-[#F1E9DA]/85">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Ubuntu, Debian, AlmaLinux & Rocky</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Full root access & control panel management</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Solid-state NVMe disk arrays</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Standard IPv4 public network connectivity</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 border-t border-[#332f2a] pt-6">
                <a
                  href="#pricing"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#332f2a] bg-[#171717] py-3 text-xs font-bold uppercase tracking-wider text-[#F1E9DA] transition hover:border-[#C6A66B] hover:text-[#C6A66B]"
                >
                  View Linux Plans <ArrowRight size={15} />
                </a>
              </div>
            </div>

            {/* Windows VPS Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#332f2a] bg-[#201d1a] p-8 shadow-xl transition hover:border-[#C6A66B]/50">
              <div>
                <div className="flex items-center justify-between">
                  <div className="rounded-lg border border-[#C6A66B]/20 bg-[#171717] p-3 text-[#C6A66B]">
                    <Monitor size={22} />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6A66B]">
                    RDP READY
                  </span>
                </div>
                <h3 className="mt-6 font-serif text-2xl font-bold text-[#F1E9DA]">Windows VPS</h3>
                <p className="mt-3 text-xs leading-relaxed text-[#F1E9DA]/70">
                  Licensed Windows Server environments with Remote Desktop (RDP) connectivity and full administrator control panel privileges.
                </p>

                <ul className="mt-6 space-y-2.5 text-xs text-[#F1E9DA]/85">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Windows Server 2022 & 2019 Datacenter</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Remote Desktop (RDP) connectivity</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Dedicated RAM & unshared CPU limits</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Ideal for ASP.NET, MSSQL & Remote Tasks</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 border-t border-[#332f2a] pt-6">
                <a
                  href="#pricing"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#332f2a] bg-[#171717] py-3 text-xs font-bold uppercase tracking-wider text-[#F1E9DA] transition hover:border-[#C6A66B] hover:text-[#C6A66B]"
                >
                  View Windows Plans <ArrowRight size={15} />
                </a>
              </div>
            </div>

            {/* Dedicated IP Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#332f2a] bg-[#201d1a] p-8 shadow-xl transition hover:border-[#C6A66B]/50">
              <div>
                <div className="flex items-center justify-between">
                  <div className="rounded-lg border border-[#C6A66B]/20 bg-[#171717] p-3 text-[#C6A66B]">
                    <Network size={22} />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6A66B]">
                    DEDICATED IP
                  </span>
                </div>
                <h3 className="mt-6 font-serif text-2xl font-bold text-[#F1E9DA]">Dedicated IP</h3>
                <p className="mt-3 text-xs leading-relaxed text-[#F1E9DA]/70">
                  Discrete IPv4 address assignments for your server networking requirements.
                </p>

                <ul className="mt-6 space-y-2.5 text-xs text-[#F1E9DA]/85">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Dedicated IPv4 address resource</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Designated IP routing and protocol support</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Public network routing</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-[#C6A66B]" />
                    <span>Separate standalone IP catalogue</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 border-t border-[#332f2a] pt-6">
                <a
                  href="/dedicated-ip"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#C6A66B] py-3 text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8ba82]"
                >
                  Explore IP Allocations <ArrowRight size={15} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. LIGHT TRANSPARENT PRICING SECTION (Warm Ivory #F1E9DA)
          ========================================================================= */}
      <section id="pricing" className="bg-[#F1E9DA] px-6 py-20 text-[#171717] lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
              VERIFIED CATALOGUE PRICING
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#171717] sm:text-4xl lg:text-5xl">
              Transparent, Predictable Pricing
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-[#292521]/75">
              Clear, upfront pricing with no hidden bandwidth surcharges or surprise renewal fees. All prices are calculated server-side by the backend.
            </p>

            {/* Billing Interval Indicator */}
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#332f2a]/20 bg-[#292521] px-5 py-2 font-mono text-xs uppercase tracking-wider text-[#C6A66B] shadow-md">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C6A66B] animate-pulse" />
              <span>Standard Monthly Cloud Subscription</span>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="mt-14">
            {plansLoading && (
              <div className="grid gap-8 lg:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="flex flex-col justify-between rounded-2xl border border-[#332f2a] bg-[#201d1a] p-8 shadow-xl animate-pulse"
                  >
                    <div>
                      <div className="h-6 w-32 rounded bg-[#332f2a]" />
                      <div className="mt-2 h-4 w-20 rounded bg-[#332f2a]" />
                      <div className="my-6 h-12 w-40 rounded bg-[#332f2a]" />
                      <div className="space-y-3 pt-4">
                        <div className="h-4 w-full rounded bg-[#332f2a]" />
                        <div className="h-4 w-full rounded bg-[#332f2a]" />
                        <div className="h-4 w-full rounded bg-[#332f2a]" />
                      </div>
                    </div>
                    <div className="mt-8 h-10 w-full rounded bg-[#332f2a]" />
                  </div>
                ))}
              </div>
            )}

            {!plansLoading && plansError && (
              <div className="rounded-2xl border border-red-500/30 bg-[#201d1a] p-10 text-center text-[#F1E9DA]">
                <p className="text-sm font-semibold text-red-300">{plansError}</p>
                <button
                  onClick={() => void fetchPlans()}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#C6A66B] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#171717]"
                >
                  <RefreshCw size={14} /> Retry Loading Plans
                </button>
              </div>
            )}

            {!plansLoading && !plansError && pricingPlans.length === 0 && (
              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-12 text-center text-[#F1E9DA]">
                <Server size={36} className="mx-auto text-[#C6A66B]/60" />
                <h3 className="mt-4 font-serif text-xl font-bold">Catalogue Updating</h3>
                <p className="mt-2 text-xs text-[#F1E9DA]/60">
                  Available VPS configurations are being synchronized with the provider. Please refresh shortly.
                </p>
                <button
                  onClick={() => void fetchPlans()}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#C6A66B] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#171717]"
                >
                  <RefreshCw size={14} /> Refresh Catalogue
                </button>
              </div>
            )}

            {!plansLoading && !plansError && pricingPlans.length > 0 && (
              <div className="grid gap-8 lg:grid-cols-3">
                {pricingPlans.map((plan, idx) => {
                  const isRecommended = plan.isRecommended;

                  return (
                    <div
                      key={plan.id || idx}
                      className={`relative flex flex-col justify-between rounded-2xl p-8 transition duration-200 ${
                        isRecommended
                          ? "border-2 border-[#C6A66B] bg-[#201d1a] text-[#F1E9DA] shadow-2xl shadow-[#C6A66B]/20 scale-105 z-10"
                          : "border border-[#332f2a] bg-[#201d1a] text-[#F1E9DA] shadow-xl hover:border-[#C6A66B]/40"
                      }`}
                    >
                      {isRecommended && (
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#C6A66B] px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-[#171717] shadow-md">
                          RECOMMENDED TIER
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="font-serif text-2xl font-bold text-[#F1E9DA]">
                            {plan.name}
                          </h3>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6A66B]">
                            {plan.tier || "Cloud VPS"}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-[#F1E9DA]/60">
                          {plan.description || "High-performance virtual server backed by verified cloud hardware."}
                        </p>

                        {/* Verified Price Block */}
                        <div className="my-6 border-y border-[#332f2a] py-5">
                          <div className="flex items-baseline gap-1">
                            <span className="font-serif text-4xl font-bold text-[#F1E9DA]">
                              {formatSellingPrice(plan.monthlyPrice ?? plan.price, plan.currency)}
                            </span>
                            <span className="text-xs text-[#F1E9DA]/60">/ month</span>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-[#C6A66B]">
                            Standard monthly subscription · Cancel anytime
                          </p>
                        </div>

                        {/* Hardware Specifications */}
                        <div className="space-y-3 font-mono text-xs text-[#F1E9DA]/80">
                          <div className="flex justify-between">
                            <span className="text-[#F1E9DA]/50">Processor:</span>
                            <span className="font-semibold text-[#F1E9DA]">
                              {plan.cpuCores} vCPU Cores
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#F1E9DA]/50">Memory:</span>
                            <span className="font-semibold text-[#F1E9DA]">
                              {plan.ramGb} GB RAM
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#F1E9DA]/50">NVMe Storage:</span>
                            <span className="font-semibold text-[#F1E9DA]">
                              {plan.storageGb} GB NVMe
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#F1E9DA]/50">Bandwidth:</span>
                            <span className="font-semibold text-[#F1E9DA]">
                              {plan.bandwidthGb ? `${plan.bandwidthGb} GB` : "Standard Allocation"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#F1E9DA]/50">Datacenter:</span>
                            <span className="font-semibold text-[#F1E9DA]">
                              {plan.location || "Location information unavailable"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 pt-4">
                        <button
                          onClick={() => handleSelectPlan(plan.id)}
                          className={`w-full rounded-lg py-3.5 text-xs font-bold uppercase tracking-wider transition ${
                            isRecommended
                              ? "bg-[#C6A66B] text-[#171717] hover:bg-[#d8ba82] shadow-lg shadow-[#C6A66B]/25"
                              : "border border-[#332f2a] bg-[#171717] text-[#F1E9DA] hover:border-[#C6A66B] hover:text-[#C6A66B]"
                          }`}
                        >
                          {isRecommended ? "Buy Plan Now" : "Configure Server"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>


      {/* SmartVPS Live Catalogue */}
      <section id="smartvps" className="bg-[#171717] px-6 py-20 text-[#F1E9DA] lg:px-10 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
              HIGH PERFORMANCE CLOUD INFRASTRUCTURE
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">
              High Performance VPS Plans
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-[#F1E9DA]/65">
              RAM-based cloud plans with live provider availability and transparent monthly pricing.
            </p>
          </div>

          {smartVpsLoading ? (
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-64 animate-pulse rounded-2xl border border-[#332f2a] bg-[#201d1a]" />
              ))}
            </div>
          ) : smartVpsPlans.length > 0 ? (
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {smartVpsPlans.map((plan) => (
                <div key={plan.ramGb} className="rounded-2xl border border-[#C6A66B]/30 bg-[#201d1a] p-7 shadow-xl">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#C6A66B]">
                    HIGH PERFORMANCE VPS
                  </p>
                  <h3 className="mt-3 font-serif text-2xl font-bold">
                    {plan.ramGb} GB RAM
                  </h3>
                  <p className="mt-5 text-3xl font-bold text-[#C6A66B]">
                    {formatSellingPrice(plan.monthlyPrice ?? plan.price, plan.currency)}
                    <span className="ml-1 text-xs font-normal text-[#F1E9DA]/50">/ month</span>
                  </p>
                  <div className="mt-6 border-t border-[#332f2a] pt-5">
                    <p className="text-sm text-emerald-400">
                      {plan.availableCount} available
                    </p>
                    <p className="mt-2 text-xs text-[#F1E9DA]/45">
                      Live infrastructure stock
                    </p>
                  </div>
                  <div className="mt-6 rounded-lg border border-[#C6A66B]/20 bg-[#171717] px-3 py-3 text-center font-mono text-[10px] font-bold uppercase tracking-wider text-[#C6A66B]">
                    Ordering coming soon
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-10 text-center text-sm text-[#F1E9DA]/50">
              High-performance VPS plans are currently unavailable. Please check again later.
            </p>
          )}
          <p className="mt-7 text-center font-mono text-[10px] text-[#F1E9DA]/35">
            Availability is checked live. Displayed plans are not yet available for online purchase.
          </p>
        </div>
      </section>

      {/* =========================================================================
          6. DARK DEDICATED IP PROMOTIONAL SECTION (Obsidian #171717)
          ========================================================================= */}
      <section id="dedicated-ip" className="bg-[#171717] px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            {/* Left Column: Information & Bullet Points */}
            <div className="lg:col-span-7">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
                NETWORK ALLOCATIONS
              </p>
              <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#F1E9DA] sm:text-4xl lg:text-5xl">
                Dedicated IPv4 Address Allocations
              </h2>
              <p className="mt-5 text-sm leading-relaxed text-[#F1E9DA]/75 sm:text-base">
                Individual dedicated IPv4 address allocations available for your server instances, matched to provider catalogue specifications.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <Network size={18} className="text-[#C6A66B] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold uppercase text-[#F1E9DA]">Dedicated IPv4 Address</h4>
                    <p className="mt-1 text-[11px] text-[#F1E9DA]/60">Individual IPv4 address assignments for your server workloads.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Globe size={18} className="text-[#C6A66B] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold uppercase text-[#F1E9DA]">Regional Locations</h4>
                    <p className="mt-1 text-[11px] text-[#F1E9DA]/60">Available across designated provider datacenter locations.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Zap size={18} className="text-[#C6A66B] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold uppercase text-[#F1E9DA]">Port & Network Speeds</h4>
                    <p className="mt-1 text-[11px] text-[#F1E9DA]/60">Network throughput matched to available catalogue profiles.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Layers size={18} className="text-[#C6A66B] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold uppercase text-[#F1E9DA]">Catalogue Visibility</h4>
                    <p className="mt-1 text-[11px] text-[#F1E9DA]/60">Live inventory status indicating in-stock allocation availability.</p>
                  </div>
                </div>
              </div>

              <div className="mt-9">
                <a
                  href="/dedicated-ip"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#C6A66B] px-7 py-3.5 text-xs font-bold uppercase tracking-wider text-[#171717] shadow-xl shadow-[#C6A66B]/20 transition hover:bg-[#d8ba82]"
                >
                  View Available Dedicated IPs <ArrowRight size={16} />
                </a>
              </div>
            </div>

            {/* Right Column: Clearly Labelled Non-Numeric IP Telemetry Visual */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-2xl shadow-black/80">
                <div className="flex items-center justify-between border-b border-[#332f2a] pb-4">
                  <div className="flex items-center gap-2 font-mono text-[11px] text-[#C6A66B]">
                    <Network size={16} />
                    <span>IP ALLOCATION SPECIFICATIONS</span>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                    IN STOCK
                  </span>
                </div>

                <div className="mt-6 space-y-3.5 font-mono text-xs">
                  <div className="flex justify-between border-b border-[#332f2a]/60 pb-2.5">
                    <span className="text-[#F1E9DA]/50">Resource Model:</span>
                    <span className="font-bold text-[#F1E9DA]">Dedicated Slot IPv4</span>
                  </div>

                  <div className="flex justify-between border-b border-[#332f2a]/60 pb-2.5">
                    <span className="text-[#F1E9DA]/50">Allocation Tenancy:</span>
                    <span className="text-[#F1E9DA]">Individual IP Assignment</span>
                  </div>

                  <div className="flex justify-between border-b border-[#332f2a]/60 pb-2.5">
                    <span className="text-[#F1E9DA]/50">Location Mapping:</span>
                    <span className="text-[#C6A66B]">Designated Provider Datacenter</span>
                  </div>

                  <div className="flex justify-between border-b border-[#332f2a]/60 pb-2.5">
                    <span className="text-[#F1E9DA]/50">Network Protocols:</span>
                    <span className="font-bold text-emerald-400">TCP / UDP / HTTP / HTTPS</span>
                  </div>

                  <div className="flex justify-between border-b border-[#332f2a]/60 pb-2.5">
                    <span className="text-[#F1E9DA]/50">Inventory Status:</span>
                    <span className="text-[#F1E9DA]">Catalogue In-Stock Allocation</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#F1E9DA]/50">Network Transit:</span>
                    <span className="font-bold text-emerald-400">Standard Network Routing</span>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-[#332f2a] bg-[#171717] p-3 text-[11px] font-mono text-[#F1E9DA]/60">
                  Catalogue specifications derived from verified provider inventory records.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          7. LIGHT THREE-STEP CUSTOMER JOURNEY (Warm Ivory #F1E9DA)
          ========================================================================= */}
      <section className="bg-[#F1E9DA] px-6 py-20 text-[#171717] lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
              STREAMLINED ONBOARDING
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#171717] sm:text-4xl lg:text-5xl">
              From Configuration to Active Server Deployment
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-[#292521]/75">
              Select your preferred server specifications, complete checkout, and access your instance credentials via the customer dashboard.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Choose Your Server",
                desc: "Select your preferred CPU cores, RAM, solid-state NVMe storage, operating system (Linux or Windows), and available datacenter zone.",
              },
              {
                step: "02",
                title: "Complete Your Order",
                desc: "Complete your purchase using your preferred payment method or prepaid account balance.",
              },
              {
                step: "03",
                title: "Manage Your Service",
                desc: "Access your server details and management credentials directly within your customer dashboard once provisioning finishes.",
              },
            ].map(({ step, title, desc }) => (
              <div
                key={step}
                className="relative flex flex-col justify-between rounded-xl border border-[#332f2a] bg-[#201d1a] p-8 text-[#F1E9DA] shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-3xl font-bold text-[#C6A66B]">{step}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#F1E9DA]/40">
                      STEP {step}
                    </span>
                  </div>
                  <h3 className="mt-5 font-serif text-xl font-bold text-[#F1E9DA]">{title}</h3>
                  <p className="mt-3 text-xs leading-relaxed text-[#F1E9DA]/70">{desc}</p>
                </div>
                <div className="mt-6 border-t border-[#332f2a] pt-4 font-mono text-[11px] text-[#C6A66B]">
                  ✓ Verified Orchestration
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          8. FREQUENTLY ASKED QUESTIONS SECTION (Warm Ivory #F1E9DA)
          ========================================================================= */}
      <section id="faq" className="bg-[#F1E9DA] border-t border-[#292521]/10 px-6 py-20 text-[#171717] lg:px-10 lg:py-28">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
              KNOWLEDGE & COMMON INQUIRIES
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#171717] sm:text-4xl lg:text-5xl">
              Frequently Asked Questions
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm text-[#292521]/75">
              Factual details about our cloud infrastructure, operating systems, and service management.
            </p>
          </div>

          <div className="mt-12 space-y-3">
            {faqs.map(({ q, a }, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={q}
                  className="rounded-xl border border-[#332f2a] bg-[#201d1a] text-[#F1E9DA] shadow-md transition"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between p-5 text-left transition hover:text-[#C6A66B]"
                  >
                    <span className="font-serif text-base font-semibold text-[#F1E9DA]">
                      {q}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-[#C6A66B] transition-transform duration-200 shrink-0 ml-4 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#332f2a] px-5 pb-5 pt-3 text-xs leading-relaxed text-[#F1E9DA]/75">
                      {a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
          9. BESPOKE PRIVATE CLUSTER CTA BANNER (Obsidian #171717)
          ========================================================================= */}
      <section className="bg-[#171717] px-6 py-20 lg:px-10">
        <div className="mx-auto max-w-7xl rounded-2xl border border-[#C6A66B]/30 bg-[#201d1a] p-8 shadow-2xl lg:p-12">
          <div className="grid items-center gap-8 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
                CUSTOM HARDWARE & CLUSTERS
              </p>
              <h2 className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl lg:text-4xl">
                Require Bespoke Cloud Configurations or Custom Routing?
              </h2>
              <p className="mt-3 max-w-2xl text-xs leading-relaxed text-[#F1E9DA]/70 sm:text-sm">
                Our infrastructure team can engineer custom hybrid server allocations, dedicated routing configurations, or high-throughput storage clusters upon request.
              </p>
            </div>
            <div className="flex justify-start lg:col-span-4 lg:justify-end">
              <a
                href="/support"
                className="inline-flex items-center gap-2 rounded-lg bg-[#C6A66B] px-7 py-4 text-xs font-bold uppercase tracking-wider text-[#171717] shadow-xl shadow-[#C6A66B]/20 transition hover:bg-[#d8ba82]"
              >
                Contact Support Desk <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          10. PREMIUM MULTI-COLUMN FOOTER (Obsidian #171717)
          ========================================================================= */}
      <footer className="border-t border-[#292521] bg-[#171717] px-6 py-14 text-xs text-[#F1E9DA]/70 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            {/* Col 1: Brand Info */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3">
                <img src={logo} alt="24/7 Logo" className="h-9 w-9 rounded-full object-contain" />
                <span className="font-serif text-lg font-bold text-[#F1E9DA]">
                  24/7 CLOUD HOSTING
                </span>
              </div>
              <p className="mt-4 max-w-sm text-xs leading-relaxed text-[#F1E9DA]/60">
                Premium virtual private server infrastructure, engineered for mission-critical applications with high availability and verified cloud compute.
              </p>
              <div className="mt-4 flex items-center gap-2 font-mono text-[10px] text-[#C6A66B]">
                <ShieldCheck size={14} />
                <span>ENTERPRISE-GRADE HOSTING INFRASTRUCTURE</span>
              </div>
            </div>

            {/* Col 2: Products */}
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#C6A66B]">
                COMPUTE PRODUCTS
              </p>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a href="#workloads" className="transition hover:text-[#C6A66B]">
                    Linux Cloud VPS
                  </a>
                </li>
                <li>
                  <a href="#workloads" className="transition hover:text-[#C6A66B]">
                    Windows Server VPS
                  </a>
                </li>
                {dedicatedIpAvailable && (
                  <li>
                    <a href="/dedicated-ip" className="transition hover:text-[#C6A66B]">
                      Dedicated IP
                    </a>
                  </li>
                )}
                <li>
                  <a href="#pricing" className="transition hover:text-[#C6A66B]">
                    Available Cloud Plans
                  </a>
                </li>
                <li>
                  <a href="/support" className="transition hover:text-[#C6A66B]">
                    Custom Solutions
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Verified Regions */}
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#C6A66B]">
                DATACENTER REGIONS
              </p>
              <ul className="mt-4 space-y-2.5">
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Primary Cloud Datacenter</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Primary Verified Zones</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>High-Speed Regional Peering</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Custom Routing upon Request</span>
                </li>
              </ul>
            </div>

            {/* Col 4: Trust & Legal */}
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#C6A66B]">
                LEGAL & TRUST
              </p>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a href="/support" className="transition hover:text-[#C6A66B]">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/support" className="transition hover:text-[#C6A66B]">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/support" className="transition hover:text-[#C6A66B]">
                    Acceptable Use Policy
                  </a>
                </li>
                <li>
                  <a href="/support" className="transition hover:text-[#C6A66B]">
                    Support Desk
                  </a>
                </li>
                <li>
                  <a href="/login" className="transition hover:text-[#C6A66B]">
                    Customer Portal
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Configured Social Links */}
          {(supportContact.instagramUrl || supportContact.facebookUrl ||
            supportContact.whatsappUrl || supportContact.youtubeUrl || supportContact.telegramUrl) && (
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3 border-t border-[#292521] pt-6 sm:justify-end">
              {supportContact.instagramUrl && (
                <a href={supportContact.instagramUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#332f2a] px-3 py-2 text-xs text-[#F1E9DA]/75 transition hover:border-[#C6A66B] hover:text-[#C6A66B]">
                  <Camera size={15} /> Instagram
                </a>
              )}
              {supportContact.facebookUrl && (
                <a href={supportContact.facebookUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#332f2a] px-3 py-2 text-xs text-[#F1E9DA]/75 transition hover:border-[#C6A66B] hover:text-[#C6A66B]">
                  <Users size={15} /> Facebook
                </a>
              )}
              {supportContact.whatsappUrl && (
                <a href={supportContact.whatsappUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#332f2a] px-3 py-2 text-xs text-[#F1E9DA]/75 transition hover:border-[#C6A66B] hover:text-[#C6A66B]">
                  <MessageCircle size={15} /> WhatsApp
                </a>
              )}
              {supportContact.youtubeUrl && (
                <a href={supportContact.youtubeUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#332f2a] px-3 py-2 text-xs text-[#F1E9DA]/75 transition hover:border-[#C6A66B] hover:text-[#C6A66B]">
                  <Video size={15} /> YouTube
                </a>
              )}
              {supportContact.telegramUrl && (
                <a href={supportContact.telegramUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#332f2a] px-3 py-2 text-xs text-[#F1E9DA]/75 transition hover:border-[#C6A66B] hover:text-[#C6A66B]">
                  <Send size={15} /> Telegram
                </a>
              )}
            </div>
          )}

          {/* Bottom Bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#292521] pt-6 sm:flex-row">
            <p className="text-[11px] text-[#F1E9DA]/50">
              © {new Date().getFullYear()} 24/7 Cloud Hosting. All rights reserved.
            </p>
            <div className="flex items-center gap-2 font-mono text-[10px] text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>SYSTEMS OPERATIONAL · CATALOGUE VERIFIED</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
