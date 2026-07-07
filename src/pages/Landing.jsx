import { Link } from "react-router-dom";
import HawkIcon from "../components/HawkIcon";
import { useState, useEffect } from "react";
import DataUseCaseCards from "../components/landing/DataUseCaseCards";
import LandingMapBackground from "../components/landing/LandingMapBackground";

const FEATURES = [
  {
    icon: "🛰",
    title: "AI-Powered Parcel Scanning",
    desc: "Drop a pin anywhere in the US and SiteHawk instantly identifies the top buildable parcels within a 0.5-mile radius — scored, ranked, and ready to act on.",
  },
  {
    icon: "✈️",
    title: "Airport Proximity Intelligence",
    desc: "Every candidate parcel includes the nearest airport — IATA code, full name, distance in miles, and coordinates — critical for FAA compliance filings.",
  },
  {
    icon: "📡",
    title: "Cell Tower Density Analysis",
    desc: "Automatically surfaces the nearest existing cell towers per parcel: carrier, tower type, distance, and coordinates. Know your RF landscape before you negotiate.",
  },
  {
    icon: "🏛",
    title: "Local Zoning Ordinance Lookup",
    desc: "SiteHawk pulls the local zoning ordinance for your search area — setbacks, height limits, permitted use — so you never walk into a permit ambush.",
  },
  {
    icon: "📞",
    title: "Skip Trace & Owner Contact",
    desc: "One click reveals verified owner phone numbers, emails, and registered agent info via our integrated skip trace engine. Start the conversation faster.",
  },
  {
    icon: "🦅",
    title: "SiteHawk AI Consultant",
    desc: "Your personal AI site acquisition advisor has full context of your scan. Ask it anything — zoning, setbacks, which parcel is best — and get instant expert answers.",
  },
];

const PLANS = [
  { name: "🦅 SiteHawk", price: "Based on Customer Usage", desc: "3-day free trial · AI scanning, airport proximity, cell tower analysis & the SiteHawk AI Consultant included", cta: "Get Started", highlight: true },
];

const TESTIMONIALS = [
  { quote: "SiteHawk cut our site acquisition cycle from 6 weeks to 3 days. The AI parcel scoring alone is worth 10x the subscription.", name: "Director of RF Engineering", company: "Regional Tower Operator" },
  { quote: "The skip trace integration is a game changer. We went from cold data to a live owner conversation in under an hour.", name: "Senior Site Acquisition Manager", company: "Telecom Infrastructure Co." },
  { quote: "Having airport proximity and cell tower density on every parcel report has made our FAA pre-screening process almost fully automated.", name: "VP of Network Development", company: "Wireless Carrier" },
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Capture referral code from URL and persist to localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem("sitehawk_ref_code", ref);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#000000] bg-[radial-gradient(ellipse_120%_60%_at_50%_-10%,#232328_0%,#0c0c0e_45%,#000000_75%)] text-white font-body overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-gradient-to-b from-[#1a1a1e]/95 to-[#050505]/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HawkIcon size={36} />
            <div>
              <span className="font-heading font-bold text-lg text-white leading-none">SiteHawk</span>
              <span className="block text-[10px] text-[#00A3FF]/70 leading-none tracking-widest uppercase">by SkyWave AI</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Link to="/crm" className="hover:text-white transition-colors">Deal Pipeline</Link>
            <Link to="/hawk-docs" className="hover:text-white transition-colors">Document Intelligence</Link>
            <Link to="/about" className="hover:text-white transition-colors">About</Link>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/dashboard" className="px-4 py-2 text-sm font-semibold text-white/70 hover:text-white transition-colors">
              Log In
            </Link>
            <Link to="/pricing" className="px-5 py-2 rounded-xl bg-[#00A3FF] hover:bg-[#0056B3] text-white text-sm font-bold shadow-lg shadow-[#00A3FF]/20 transition-all">
              Get Started
            </Link>
          </div>
          <button onClick={() => setMenuOpen(o => !o)} className="md:hidden text-white/70 hover:text-white">
            <span className="text-2xl">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#000000] px-6 py-4 space-y-3 text-sm font-medium">
            <a href="#features" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#pricing" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>Pricing</a>
            <Link to="/crm" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>Deal Pipeline</Link>
            <Link to="/hawk-docs" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>Document Intelligence</Link>
            <Link to="/about" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>About</Link>
            <Link to="/dashboard" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>Log In</Link>
            <Link to="/pricing" className="block w-full text-center px-5 py-2.5 rounded-xl bg-[#00A3FF] text-white font-bold mt-2" onClick={() => setMenuOpen(false)}>Get Started</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-32 pb-24 px-6 text-center overflow-hidden">
        {/* Full-screen Mapbox satellite map background */}
        <LandingMapBackground />
        {/* Dark overlay so text stays readable over the satellite imagery */}
        <div className="absolute inset-0 bg-[#000000]/75 pointer-events-none" style={{ zIndex: 1 }} />
        {/* Glow backdrop */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-[#00A3FF]/10 blur-[120px]" />
          <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] rounded-full bg-[#00A3FF]/5 blur-[80px]" />
        </div>

        <div className="relative max-w-4xl mx-auto" style={{ zIndex: 3 }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#00A3FF]/40 bg-[#00A3FF]/10 text-[#00A3FF] text-xs font-semibold tracking-wide mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00A3FF] animate-pulse" />
            🦅 3-Day Free Trial — 2 SCIPs/day included
          </div>

          <h1 className="font-heading font-bold text-5xl md:text-7xl leading-tight text-white mb-6">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A3FF] to-[#FFFFFF]">SiteHawk</span> with AI<br />
            Intelligence Has Landed.
          </h1>

          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            The seamless, least-resistant path to site acquisition success — built in one web app.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/search"
              className="px-8 py-4 rounded-2xl bg-[#00A3FF] hover:bg-[#0056B3] text-white font-heading font-bold text-lg shadow-2xl shadow-[#00A3FF]/25 transition-all hover:scale-105"
            >
              Get Started →
            </Link>
            <Link
              to="/dashboard"
              className="px-8 py-4 rounded-2xl border border-white/10 hover:border-white/25 text-white/70 hover:text-white font-semibold text-lg transition-all"
            >
              Log In to Dashboard
            </Link>
          </div>

          <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/50">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            Powered by <span className="text-white/80 font-semibold">Anthropic AI Intelligence</span>
          </div>
        </div>

      </section>

      {/* ── LOGOS / SOCIAL PROOF ── */}
      <section className="py-10 border-y border-white/5 bg-white/2">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-6">Trusted by wireless infrastructure professionals</p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 text-white/20 font-heading font-bold text-sm tracking-wider">
            {["Tower Operators", "Site Acquisition Firms", "Regional Carriers", "Infrastructure Developers", "RF Engineering Teams"].map(l => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-[#00A3FF] font-bold mb-3">Everything You Need</p>
            <h2 className="font-heading font-bold text-4xl md:text-5xl text-white">The Complete Site Acquisition<br />Intelligence Platform</h2>
            <p className="text-white/40 mt-4 max-w-xl mx-auto">From raw coordinates to a fully-vetted candidate parcel list with owner contact info — in under 3 minutes.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/5 bg-white/3 hover:bg-white/5 hover:border-[#00A3FF]/25 p-6 transition-all group">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-heading font-bold text-white text-lg mb-2 group-hover:text-[#00A3FF] transition-colors">{f.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DATA USE CASE CARDS (1–5) ── */}
      <DataUseCaseCards />

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-6 bg-gradient-to-b from-transparent to-[#121212]/60">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-[#00A3FF] font-bold mb-3">Simple 3-Step Process</p>
          <h2 className="font-heading font-bold text-4xl text-white mb-16">From Coordinates to Conversation<br />in Under 3 Minutes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", icon: "📍", title: "Drop a Pin", desc: "Enter GPS coordinates or use your current location to define the scan center." },
              { step: "02", icon: "🤖", title: "AI Scans & Scores", desc: "SiteHawk analyzes every parcel within 0.5 miles — zoning, size, ownership, proximity data, and more." },
              { step: "03", icon: "📞", title: "Contact the Owner", desc: "Use skip trace to get verified contact info and start the acquisition conversation immediately." },
            ].map((s) => (
              <div key={s.step} className="relative">
                <div className="text-[10px] font-black text-[#00A3FF]/50 tracking-widest mb-3">{s.step}</div>
                <div className="text-4xl mb-4">{s.icon}</div>
                <h3 className="font-heading font-bold text-white text-xl mb-2">{s.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-[#00A3FF] font-bold mb-3">What Professionals Say</p>
            <h2 className="font-heading font-bold text-4xl text-white">Built for the Field,<br />Loved by the Team</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="rounded-2xl border border-white/5 bg-white/3 p-6 flex flex-col gap-4">
                <div className="text-yellow-400 text-sm">★★★★★</div>
                <p className="text-white/70 text-sm leading-relaxed italic">"{t.quote}"</p>
                <div className="mt-auto pt-4 border-t border-white/5">
                  <p className="text-white text-xs font-bold">{t.name}</p>
                  <p className="text-white/30 text-xs">{t.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-24 px-6 bg-gradient-to-b from-transparent to-[#121212]/40">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-[#00A3FF] font-bold mb-3">Simple Pricing</p>
          <h2 className="font-heading font-bold text-4xl text-white mb-4">Simple Pricing. One Mission.</h2>
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[#00A3FF]/30 bg-[#00A3FF]/10 text-[#00A3FF] text-sm font-semibold mb-6">
            🦅 3-day free trial included with every plan
          </div>
          <p className="text-white/40 mb-12">All paid plans include AI scanning, airport proximity, cell tower analysis, and the SiteHawk AI Consultant.</p>
          <div className="grid grid-cols-1 gap-6 mb-10 max-w-md mx-auto">
            {PLANS.map((p) => (
              <div key={p.name} className={`rounded-2xl border p-8 flex flex-col items-center gap-4 transition-all ${p.highlight ? "border-[#00A3FF]/50 bg-[#00A3FF]/10 shadow-2xl shadow-[#00A3FF]/10" : "border-white/5 bg-white/3"}`}>
                <h3 className="font-heading font-bold text-white text-xl">{p.name}</h3>
                <div className="font-heading font-black text-3xl text-white">{p.price}</div>
                <p className="text-white/40 text-sm">{p.desc}</p>
                <Link
                  to="/pricing"
                  className={`w-full text-center px-6 py-3 rounded-xl font-bold text-sm transition-all mt-2 ${p.highlight ? "bg-[#00A3FF] hover:bg-[#0056B3] text-white shadow-lg shadow-[#00A3FF]/20" : "border border-white/10 hover:border-white/25 text-white/70 hover:text-white"}`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
          <Link to="/pricing" className="text-[#00A3FF] hover:text-[#FFFFFF] text-sm font-semibold underline underline-offset-4 transition-colors">
            View full feature comparison →
          </Link>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl border border-[#00A3FF]/25 bg-gradient-to-b from-[#242428] via-[#101012] to-[#000000] p-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_25px_50px_-12px_rgba(255,199,44,0.08)]">
            <div className="flex justify-center mb-6"><HawkIcon size={64} /></div>
            <h2 className="font-heading font-bold text-4xl text-white mb-4">"When You Need<br />AI Hawk Vision"™</h2>
            <p className="text-white/50 mb-8 leading-relaxed">Stop spending weeks manually researching parcels. SiteHawk gives you the AI vision to find, vet, and contact the right landowner — fast.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 px-10 py-4 rounded-2xl bg-[#00A3FF] hover:bg-[#0056B3] text-white font-heading font-bold text-lg shadow-2xl shadow-[#00A3FF]/25 transition-all hover:scale-105"
              >
                Get Started 🦅
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/10 hover:border-white/25 text-white/70 hover:text-white font-semibold text-lg transition-all"
              >
                View Paid Plans →
              </Link>
            </div>
            <p className="text-xs text-white/30 mt-5">3-day free trial · 2 SCIPs/day during trial · Pricing based on customer usage</p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <HawkIcon size={28} />
            <div>
              <p className="font-heading font-bold text-white text-sm">SiteHawk</p>
              <p className="text-[10px] text-white/30">A SkyWave AI Product · skywave-ai.com</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs text-white/30">
            <Link to="/about" className="hover:text-white/60 transition-colors">About</Link>
            <Link to="/pricing" className="hover:text-white/60 transition-colors">Pricing</Link>
            <Link to="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
            <Link to="/refund-policy" className="hover:text-white/60 transition-colors">Refunds</Link>
          </div>
          <a href="mailto:info@sitehawk.com" className="text-xs text-white/30 hover:text-white/60 transition-colors">info@sitehawk.com</a>
          <p className="text-xs text-white/20">© 2026 SkyWave LLC. All rights reserved. Patent Pending.</p>
        </div>
      </footer>
    </div>
  );
}