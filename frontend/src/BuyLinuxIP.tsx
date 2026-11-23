import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  Globe,
  Loader2,
  MapPin,
  Network,
  RefreshCw,
  ShieldCheck,
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
      setError("Plans are temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const formatPrice = (price: number, currency: string) => {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency || "INR",
        maximumFractionDigits: 2,
      }).format(price);
    } catch {
      return `₹${price.toFixed(2)}`;
    }
  };

  return (
    <main className="min-h-screen bg-[#080e1b] text-white">
      {!embedded && <nav className="bg-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-10">
          <a href="/" className="flex items-center gap-2">
            <img
              src={logo}
              alt="24/7 Logo"
              className="h-11 w-11 rounded-full object-contain"
            />
            <span className="text-base font-extrabold tracking-tight text-slate-900 sm:text-xl">
              24/7 HR SERVICE EVERYDAY
            </span>
          </a>
          <div className="flex items-center gap-4 text-sm font-semibold text-slate-700">
            <a href="/" className="transition hover:text-blue-600">
              Home
            </a>
            <a href="/login" className="transition hover:text-blue-600">
              Login
            </a>
          </div>
        </div>
      </nav>}

      <section className="border-b border-slate-800 bg-[#0c1424] px-5 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl">
          {!embedded && <a
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-white"
          >
            <ArrowLeft size={16} /> Back to Home
          </a>}

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300">
              Dedicated IP Solutions
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <ShieldCheck size={15} /> Live plan catalogue
            </span>
          </div>

          <h1 className="mt-5 max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl">
            Dedicated IP Plans
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Explore dedicated IP options with clear pricing, locations,
            network speed and availability. Choose a plan that fits your
            requirements.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 lg:px-10 lg:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[2px] text-cyan-400">
              Available catalogue
            </p>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">
              Choose your IP plan
            </h2>
            {!loading && (
              <p className="mt-2 text-sm text-slate-400">
                {plans.length} {plans.length === 1 ? "plan" : "plans"} listed
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void loadPlans()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh plans
          </button>
        </div>

        {loading && (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-slate-800 bg-[#111a2b]">
            <Loader2 size={32} className="animate-spin text-cyan-400" />
            <p className="text-sm text-slate-400">Loading dedicated IP plans...</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
            <p className="font-semibold text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => void loadPlans()}
              className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && plans.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-[#111a2b] px-6 py-14 text-center">
            <Network size={36} className="mx-auto text-slate-500" />
            <h3 className="mt-4 text-xl font-bold">No plans available right now</h3>
            <p className="mt-2 text-sm text-slate-400">
              Please check again later.
            </p>
          </div>
        )}

        {!loading && !error && plans.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan, index) => (
              <article
                key={plan.id || plan.name}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-[#0b1531]/90 p-5 shadow-[0_16px_50px_rgba(0,0,0,.22)] transition duration-300 hover:-translate-y-1 hover:border-cyan-400/70 ${index === 1 ? "border-cyan-400/60" : "border-blue-900/70"}`}
              >
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-500 via-cyan-300 to-blue-600" />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-cyan-100">
                    <Network size={18} />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Dedicated IP
                    </span>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
                    Available
                  </span>
                </div>

                <p className="mt-5 text-xs font-bold uppercase tracking-wider text-cyan-400">
                  {plan.category || "Dedicated IP"}
                </p>
                <h3 className="mt-2 text-xl font-extrabold leading-snug">
                  {plan.name}
                </h3>
                {plan.tier && (
                  <p className="mt-2 text-sm text-slate-400">{plan.tier}</p>
                )}

                <div className="my-5 rounded-xl border border-blue-900/60 bg-[#08132d] p-4">
                  <p className="text-xs font-semibold text-slate-400">
                    Customer price
                  </p>
                  <p className="mt-1 text-3xl font-extrabold text-white">
                    {formatPrice(plan.price, plan.currency)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {plan.duration ? `Duration: ${plan.duration}` : "Plan duration as listed"}
                  </p>
                </div>

                <div className="flex-1 space-y-3 border-y border-blue-900/60 py-4 text-sm text-slate-200">
                  {(plan.country || plan.location) && (
                    <div className="flex items-center gap-3">
                      <MapPin size={16} className="shrink-0 text-cyan-400" />
                      <span>
                        {[plan.location, plan.country]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                  {plan.speed && (
                    <div className="flex items-center gap-3">
                      <Zap size={16} className="shrink-0 text-cyan-400" />
                      <span>{plan.speed}</span>
                    </div>
                  )}
                  {plan.duration && (
                    <div className="flex items-center gap-3">
                      <Clock3 size={16} className="shrink-0 text-cyan-400" />
                      <span>{plan.duration}</span>
                    </div>
                  )}
                  {plan.supportedProtocols?.length > 0 && (
                    <div className="flex items-start gap-3">
                      <Globe size={16} className="mt-0.5 shrink-0 text-cyan-400" />
                      <span>{plan.supportedProtocols.join(", ")}</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 border-t border-slate-700 pt-4">
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed rounded-xl bg-blue-600/40 px-4 py-3 text-sm font-bold text-blue-100/70"
                    title="Online payments are not available yet"
                  >
                    Buy Now
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-10 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-cyan-400" />
          <div>
            <p className="text-sm font-bold text-white">
              Secure and transparent pricing
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Prices shown are customer prices. Plan ordering and checkout are
              not enabled yet. Availability may change when the catalogue is
              refreshed.
            </p>
          </div>
        </div>
      </section>

      {!embedded && <footer className="border-t border-slate-800 px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <span className="text-sm font-extrabold">
            24<span className="text-cyan-400">/7</span>
          </span>
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} 24/7. All rights reserved.
          </p>
          <a
            href="/login"
            className="text-xs text-slate-400 transition hover:text-cyan-400"
          >
            Customer Login
          </a>
        </div>
      </footer>}
    </main>
  );
}
