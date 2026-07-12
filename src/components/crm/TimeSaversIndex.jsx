/**
 * TimeSaversIndex — "Don't Miss These Time Savers" directory card.
 * Shown directly under the Deal Pipeline so users discover the
 * post-deal tools that save hours and keep them organized.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import HawkIcon from "../HawkIcon";

const TOOLS = [
  {
    emoji: "🗺️", title: "Hawk Tracker", path: "/hawk-tracker",
    desc: "Your deployment tracker — the bread and butter of all your activity, ready to report to the client at every deployment meeting.",
  },
  {
    emoji: "📋", title: "Follow-Up Tracker", path: "/follow-up-tracker",
    desc: "Drop priority sites here that need something done quickly — so nothing slips and you never fall behind.",
  },
  {
    emoji: "🦅", title: "HawkLease", path: "/hawk-lease",
    desc: "Your lease tracker — know exactly what's in your bucket and which deals are closest to signing.",
  },
  {
    emoji: "⚖️", title: "Hawk Law", path: "/hawk-law",
    desc: "AI lease negotiation built on Anthropic. Cut the back-and-forth with built-in clauses and saved history — then hand it to your attorney for final review.",
  },
  {
    emoji: "🪶", title: "HawkFill", path: "/hawk-fill",
    desc: "Personal documents outside the SCIP you want printed on your own form — just upload the document and click Run HawkFill.",
  },
  {
    emoji: "📑", title: "Hawk Forms", path: "/hawk-forms",
    desc: "12 client forms you'll need every now and then — run document intelligence to help fill them out in minutes.",
  },
  {
    emoji: "🔎", title: "Document Intelligence", path: "/hawk-docs",
    desc: "Finds zoning and permit applications — upload them and Hawk Intelligence assists you in filling them out.",
  },
];

export default function TimeSaversIndex() {
  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card overflow-hidden">
      <div className="px-5 pt-5 pb-4 flex items-center gap-4">
        <HawkIcon size={52} />
        <div>
          <div className="text-[10px] font-mono tracking-[0.3em] text-primary uppercase">After the Deal · Your Toolkit</div>
          <h2 className="font-heading font-bold text-xl text-foreground leading-tight">Don't Miss These Time Savers</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Everything past the pipeline that saves you hours, cuts the stress, and keeps you on top of your game.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 px-5 pb-5">
        {TOOLS.map((t) => (
          <Link
            key={t.path}
            to={t.path}
            className="group rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all p-4 flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="font-heading font-bold text-sm text-foreground">{t.emoji} {t.title}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}