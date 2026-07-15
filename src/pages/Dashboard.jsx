import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkIcon from "@/components/HawkIcon";
import WorkflowIndex from "@/components/dashboard/WorkflowIndex";

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-muted p-6 md:p-9">
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4 max-w-2xl">
            <HawkIcon size={64} />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-primary uppercase">Your SiteHawk Journey</div>
              <h1 className="font-heading font-bold text-3xl md:text-4xl text-foreground mt-1">From search ring to signed site.</h1>
              <p className="text-sm md:text-base text-muted-foreground mt-2 leading-relaxed">
                Follow the complete SiteHawk workflow in order, then use the time-saving tools that keep every site organized and moving.
              </p>
            </div>
          </div>
          <Link to="/search" className="shrink-0">
            <Button size="lg" className="gap-3 font-heading font-bold text-base md:text-lg h-14 px-8 uppercase tracking-wide shadow-lg">
              <Search className="w-5 h-5" />
              Start Your Journey
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      <WorkflowIndex />
    </div>
  );
}