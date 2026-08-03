import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function DashboardToolCard({ tool, primary = false }) {
  const Icon = tool.icon;
  return (
    <Link
      to={tool.to}
      className={`group flex min-h-36 flex-col justify-between rounded-2xl border p-5 transition-colors ${primary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`rounded-xl p-3 ${primary ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"}`}><Icon className="h-6 w-6" /></span>
        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
      </div>
      <div className="mt-5">
        <h3 className="font-heading text-lg font-bold">{tool.title}</h3>
        <p className={`mt-1 text-sm leading-relaxed ${primary ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{tool.description}</p>
      </div>
    </Link>
  );
}