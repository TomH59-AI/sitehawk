import { Link } from "react-router-dom";
import HawkIcon from "../components/HawkIcon";
import { useState } from "react";

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
  { name: "Hawk Site", price: "$69/mo", desc: "1 Target Search/day · Single seat · Core parcel intelligence", cta: "Get Started", highlight: false },
  { name: "Hawkeyes", price: "$199/mo", desc: "5 Target Searches/day · 3 seats · PDF & CSV exports", cta: "Most Popular", highlight: true },
  { name: "Hawkeye Apex", price: "Licensed", desc: "Unlimited searches · Unlimited seats · Mailer + skip trace", cta: "Contact Sales", highlight: false },
];

const TESTIMONIALS = [
  { quote: "SiteHawk cut our site acquisition cycle from 6 weeks to 3 days. The AI parcel scoring alone is worth 10x the subscription.", name: "Director of RF Engineering", company: "Regional Tower Operator" },
  { quote: "The skip trace integration is a game changer. We went from cold data to a live owner conversation in under an hour.", name: "Senior Site Acquisition Manager", company: "Telecom Infrastructure Co." },
  { quote: "Having airport proximity and cell tower density on every parcel report has made our FAA pre-screening process almost fully automated.", name: "VP of Network Development", company: "Wireless Carrier" },
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#060E1A] text-white font-body overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#060E1A]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HawkIcon size={36} />
            <div>
              <span className="font-heading font-bold text-lg text-white leading-none">SiteHawk</span>
              <span className="block text-[10px] text-blue-400/70 leading-none tracking-widest uppercase">by SkyWave AI</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a>
            <Link to="/about" className="hover:text-white transition-colors">About</Link>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/dashboard" className="px-4 py-2 text-sm font-semibold text-white/70 hover:text-white transition-colors">
              Log In
            </Link>
            <Link to="/pricing" className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition-all">
              Get Started
            </Link>
          </div>
          <button onClick={() => setMenuOpen(o => !o)} className="md:hidden text-white/70 hover:text-white">
            <span className="text-2xl">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#060E1A] px-6 py-4 space-y-3 text-sm font-medium">
            <a href="#features" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#pricing" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>Pricing</a>
            <a href="#testimonials" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>Testimonials</a>
            <Link to="/about" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>About</Link>
            <Link to="/dashboard" className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>Log In</Link>
            <Link to="/pricing" className="block w-full text-center px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold mt-2" onClick={() => setMenuOpen(false)}>Get Started</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-32 pb-24 px-6 text-center overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-blue-600/10 blur-[120px]" />
          <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] rounded-full bg-cyan-400/5 blur-[80px]" />
        </div>

        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-semibold tracking-wide mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            AI-Powered Site Acquisition Intelligence
          </div>

          <h1 className="font-heading font-bold text-5xl md:text-7xl leading-tight text-white mb-6">
            Find Your Next<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Tower Site</span><br />
            in Minutes.
          </h1>

          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            SiteHawk is the AI-powered site acquisition platform built for wireless infrastructure professionals.
            Drop a pin. Get ranked parcels, zoning ordinances, airport proximity, cell tower density, and owner contact — instantly.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/pricing"
              className="px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-heading font-bold text-lg shadow-2xl shadow-blue-500/25 transition-all hover:scale-105"
            >
              Start Scanning Free →
            </Link>
            <Link
              to="/dashboard"
              className="px-8 py-4 rounded-2xl border border-white/10 hover:border-white/25 text-white/70 hover:text-white font-semibold text-lg transition-all"
            >
              Log In to Dashboard
            </Link>
          </div>

          <p className="text-xs text-white/30 mt-6">Plans start at $69/mo · Hawkeyes from $199/mo · Enterprise licensed</p>
        </div>

        {/* Hero mockup strip */}
        <div className="relative max-w-5xl mx-auto mt-16">
          <div className="rounded-2xl border border-white/10 bg-[#0C1B2E] shadow-2xl shadow-black/50 overflow-hidden p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="ml-3 text-xs text-white/30 font-mono">sitehawk — site acquisition scan</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              {[
                { label: "Candidate 1", score: 94, zoning: "C-2 Commercial", owner: "Sunrise Logistics LLC", airport: "TPA · 4.2 mi", tower: "Verizon Macro · 0.3 mi" },
                { label: "Candidate 2", score: 78, zoning: "I-1 Industrial", owner: "Coastal Properties Trust", airport: "PIE · 6.8 mi", tower: "AT&T Macro · 0.7 mi" },
                { label: "Candidate 3", score: 61, zoning: "A-1 Agricultural", owner: "Hernandez Family LLC", airport: "TPA · 5.1 mi", tower: "T-Mobile Small Cell · 1.1 mi" },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-400">{c.label}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">{c.score}%</span>
                  </div>
                  <p className="text-[11px] text-white/40">{c.zoning}</p>
                  <p className="text-xs text-white/70 font-medium">{c.owner}</p>
                  <div className="pt-1 space-y-1 border-t border-white/5">
                    <p className="text-[10px] text-cyan-400/70">✈ {c.airport}</p>
                    <p className="text-[10px] text-blue-400/70">📡 {c.tower}</p>
                  </div>
                </div>
              ))}
            </div>
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
            <p className="text-xs uppercase tracking-widest text-blue-400 font-bold mb-3">Everything You Need</p>
            <h2 className="font-heading font-bold text-4xl md:text-5xl text-white">The Complete Site Acquisition<br />Intelligence Platform</h2>
            <p className="text-white/40 mt-4 max-w-xl mx-auto">From raw coordinates to a fully-vetted candidate parcel list with owner contact info — in under 3 minutes.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/5 bg-white/3 hover:bg-white/5 hover:border-blue-500/20 p-6 transition-all group">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-heading font-bold text-white text-lg mb-2 group-hover:text-blue-300 transition-colors">{f.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-6 bg-gradient-to-b from-transparent to-blue-950/20">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-blue-400 font-bold mb-3">Simple 3-Step Process</p>
          <h2 className="font-heading font-bold text-4xl text-white mb-16">From Coordinates to Conversation<br />in Under 3 Minutes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", icon: "📍", title: "Drop a Pin", desc: "Enter GPS coordinates or use your current location to define the scan center." },
              { step: "02", icon: "🤖", title: "AI Scans & Scores", desc: "SiteHawk analyzes every parcel within 0.5 miles — zoning, size, ownership, proximity data, and more." },
              { step: "03", icon: "📞", title: "Contact the Owner", desc: "Use skip trace to get verified contact info and start the acquisition conversation immediately." },
            ].map((s) => (
              <div key={s.step} className="relative">
                <div className="text-[10px] font-black text-blue-500/40 tracking-widest mb-3">{s.step}</div>
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
            <p className="text-xs uppercase tracking-widest text-blue-400 font-bold mb-3">What Professionals Say</p>
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
      <section id="pricing" className="py-24 px-6 bg-gradient-to-b from-transparent to-blue-950/10">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-blue-400 font-bold mb-3">Simple Pricing</p>
          <h2 className="font-heading font-bold text-4xl text-white mb-4">Three Tiers. One Mission.</h2>
          <p className="text-white/40 mb-12">All paid plans include AI scanning, airport proximity, cell tower analysis, and the SiteHawk AI Consultant.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {PLANS.map((p) => (
              <div key={p.name} className={`rounded-2xl border p-8 flex flex-col items-center gap-4 transition-all ${p.highlight ? "border-blue-500/50 bg-blue-600/10 shadow-2xl shadow-blue-500/10 scale-105" : "border-white/5 bg-white/3"}`}>
                {p.highlight && <span className="px-3 py-1 rounded-full bg-blue-500 text-white text-xs font-bold">Most Popular</span>}
                <h3 className="font-heading font-bold text-white text-xl">{p.name}</h3>
                <div className="font-heading font-black text-4xl text-white">{p.price}</div>
                <p className="text-white/40 text-sm">{p.desc}</p>
                <Link
                  to="/pricing"
                  className={`w-full text-center px-6 py-3 rounded-xl font-bold text-sm transition-all mt-2 ${p.highlight ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "border border-white/10 hover:border-white/25 text-white/70 hover:text-white"}`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
          <Link to="/pricing" className="text-blue-400 hover:text-blue-300 text-sm font-semibold underline underline-offset-4 transition-colors">
            View full feature comparison →
          </Link>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-950/50 to-[#060E1A] p-12 shadow-2xl shadow-blue-500/5">
            <div className="flex justify-center mb-6"><HawkIcon size={64} /></div>
            <h2 className="font-heading font-bold text-4xl text-white mb-4">"When You Need<br />AI Hawk Vision"™</h2>
            <p className="text-white/50 mb-8 leading-relaxed">Stop spending weeks manually researching parcels. SiteHawk gives you the AI vision to find, vet, and contact the right landowner — fast.</p>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-10 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-heading font-bold text-lg shadow-2xl shadow-blue-500/25 transition-all hover:scale-105"
            >
              Get Started Today 🦅
            </Link>
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
          <a href="mailto:info@site-hawk-pro.com" className="text-xs text-white/30 hover:text-white/60 transition-colors">info@site-hawk-pro.com</a>
          <p className="text-xs text-white/20">© 2026 SkyWave LLC. All rights reserved. Patent Pending.</p>
        </div>
      </footer>
    </div>
  );
}