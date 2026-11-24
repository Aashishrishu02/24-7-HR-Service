import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  Globe,
  Loader2,
  MapPin,
  Network,
  RefreshCw,
  Zap,
} from "lucide-react";

import api from "./api";
import logo from "./assets/247-logo.png";

type NexaPlan = {
  id: string;
  name: string;
  category: string | null;
  tier: string | null;
  controlMode: string | null;
  country: string | null;
  location: string | null;
  duration: string | number | null;
  speed: string | null;
  supportedProtocols: string[];
  currency: string;
  price: number;
  inStock: boolean;
};

type CatalogueResponse = {
  plans: NexaPlan[];
  total: number;
};

export default function BuyLinuxIP({ embedded = false }: { embedded?: boolean }) {
  const [plans, setPlans] = useState<NexaPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<CatalogueResponse>(
        "/plans/nexa-dedicated-ips",
      );
      const receivedPlans = Array.isArray(response.data?.plans)
        ? response.data.plans
        : [];
      setPlans(receivedPlans.filter((plan) => plan.inStock === true));
    } catch {
      setPlans([]);
      setError("Dedicated IP catalogue is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const formatPrice = (price: number, currency: string) => {
    const val = typeof price === "number" ? price : Number(price);
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

  return (
    <main className="min-h-screen bg-[#171717] font-sans text-[#F1E9DA]">
      {!embedded && (
        <nav className="border-b border-[#292521] bg-[#171717]/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-10">
            <a href="/" className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#C6A66B]/40 bg-[#292521] p-1">
                <img
                  src={logo}
                  alt="24/7 Logo"
                  className="h-full w-full rounded-full object-contain"
                />
              </div>
              <div>
                <span className="block font-serif text-lg font-bold text-[#F1E9DA] group-hover:text-[#C6A66B] transition">
                  24/7 CLOUD HOSTING
                </span>
                <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-[#C6A66B]">
                  Dedicated IPv4
                </span>
              </div>
            </a>
            <div className="flex items-center gap-6 text-xs font-semibold uppercase tracking-wider text-[#F1E9DA]/80">
              <a href="/" className="transition hover:text-[#C6A66B]">
                Home
              </a>
              <a
                href="/login"
                className="rounded-lg border border-[#292521] px-4 py-2 transition hover:border-[#C6A66B] hover:text-[#C6A66B]"
              >
                Login
              </a>
            </div>
          </div>
        </nav>
      )}

      {/* Header Banner */}
      <section className="border-b border-[#292521] bg-[#201d1a] px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl">
          {!embedded && (
            <a
              href="/"
              className="mb-8 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F1E9DA]/60 transition hover:text-[#C6A66B]"
            >
              <ArrowLeft size={15} /> Back to Home
            </a>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[#C6A66B]/30 bg-[#292521] px-3.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-[#C6A66B]">
              Dedicated IPv4 Solutions
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-400">
              <Network size={15} /> In-Stock Inventory
            </span>
          </div>

          <h1 className="mt-5 max-w-3xl font-serif text-3xl font-bold leading-tight text-[#F1E9DA] sm:text-5xl">
            Dedicated IPv4 Allocations
          </h1>
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-[#F1E9DA]/70 sm:text-sm">
            Dedicated IPv4 address allocations available across designated regional locations with assigned network transit specifications.
          </p>
        </div>
      </section>

      {/* Main Catalogue */}
      <section className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C6A66B]">
              AVAILABLE IP ALLOCATIONS
            </p>
            <h2 className="mt-2 font-serif text-2xl font-bold text-[#F1E9DA] sm:text-3xl">
              Choose Your Dedicated IP
            </h2>
            {!loading && (
              <p className="mt-1 text-xs text-[#F1E9DA]/60 font-mono">
                {plans.length} {plans.length === 1 ? "allocation" : "allocations"} available
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void loadPlans()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[#332f2a] bg-[#201d1a] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#F1E9DA] transition hover:border-[#C6A66B] hover:text-[#C6A66B] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh Catalogue
          </button>
        </div>

        {loading && (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-[#332f2a] bg-[#201d1a]">
            <Loader2 size={28} className="animate-spin text-[#C6A66B]" />
            <p className="font-mono text-xs text-[#F1E9DA]/60">Verifying live IP catalogue...</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center">
            <p className="text-sm font-semibold text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => void loadPlans()}
              className="mt-4 rounded-lg bg-[#C6A66B] px-5 py-2 text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8ba82]"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && plans.length === 0 && (
          <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] px-6 py-14 text-center">
            <Network size={36} className="mx-auto text-[#C6A66B]/60" />
            <h3 className="mt-4 font-serif text-xl font-bold text-[#F1E9DA]">
              No allocations available right now
            </h3>
            <p className="mt-2 text-xs text-[#F1E9DA]/60">
              Please check back shortly or speak to our infrastructure team for custom subnets.
            </p>
          </div>
        )}

        {!loading && !error && plans.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id || plan.name}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#332f2a] bg-[#201d1a] p-6 shadow-xl transition duration-200 hover:-translate-y-1 hover:border-[#C6A66B]/60"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-[#C6A66B]">
                      <Network size={18} />
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider">
                        Dedicated IPv4
                      </span>
                    </div>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                      In Stock
                    </span>
                  </div>

                  <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#C6A66B]">
                    {plan.category || "Dedicated IP"}
                  </p>
                  <h3 className="mt-1 font-serif text-xl font-bold text-[#F1E9DA]">
                    {plan.name}
                  </h3>
                  {plan.tier && (
                    <p className="mt-1 text-xs text-[#F1E9DA]/60">{plan.tier}</p>
                  )}

                  {/* Price Box */}
                  <div className="my-5 rounded-xl border border-[#332f2a] bg-[#171717] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-[#F1E9DA]/50">
                      Customer Price
                    </p>
                    <p className="mt-1 font-serif text-3xl font-bold text-[#F1E9DA]">
                      {formatPrice(plan.price, plan.currency)}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-[#C6A66B]">
                      {plan.duration ? `Duration: ${plan.duration}` : "Standard billing duration"}
                    </p>
                  </div>

                  {/* Specifications */}
                  <div className="space-y-2.5 border-t border-[#332f2a] pt-4 font-mono text-xs text-[#F1E9DA]/80">
                    {(plan.country || plan.location) && (
                      <div className="flex items-center gap-2.5">
                        <MapPin size={15} className="shrink-0 text-[#C6A66B]" />
                        <span>{[plan.location, plan.country].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                    {plan.speed && (
                      <div className="flex items-center gap-2.5">
                        <Zap size={15} className="shrink-0 text-[#C6A66B]" />
                        <span>{plan.speed} Transit</span>
                      </div>
                    )}
                    {plan.duration && (
                      <div className="flex items-center gap-2.5">
                        <Clock3 size={15} className="shrink-0 text-[#C6A66B]" />
                        <span>{plan.duration}</span>
                      </div>
                    )}
                    {plan.supportedProtocols?.length > 0 && (
                      <div className="flex items-start gap-2.5">
                        <Globe size={15} className="mt-0.5 shrink-0 text-[#C6A66B]" />
                        <span>{plan.supportedProtocols.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 border-t border-[#332f2a] pt-4">
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed rounded-lg border border-[#332f2a] bg-[#171717] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#F1E9DA]/40"
                    title="Online checkout for standalone dedicated IP will be available in the next release"
                  >
                    Allocation via Support
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-12 flex items-start gap-3.5 rounded-xl border border-[#C6A66B]/20 bg-[#201d1a] p-5">
          <Network size={20} className="mt-0.5 shrink-0 text-[#C6A66B]" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#F1E9DA]">
              Dedicated IPv4 Allocation Information
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#F1E9DA]/70">
              All listed IPv4 addresses represent discrete IP allocations from available provider inventory. Review location, duration, and transit specifications before requesting allocation.
            </p>
          </div>
        </div>
      </section>

      {!embedded && (
        <footer className="border-t border-[#292521] px-6 py-8 text-xs text-[#F1E9DA]/60">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
            <span className="font-serif text-sm font-bold text-[#F1E9DA]">
              24/7 CLOUD HOSTING
            </span>
            <p className="text-[11px] text-[#F1E9DA]/50">
              © {new Date().getFullYear()} 24/7 Cloud Hosting. All rights reserved.
            </p>
            <a href="/login" className="transition hover:text-[#C6A66B]">
              Customer Login
            </a>
          </div>
        </footer>
      )}
    </main>
  );
}
