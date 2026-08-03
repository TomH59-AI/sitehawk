import DashboardToolPages from "@/components/dashboard/DashboardToolPages";

export default function Dashboard() {
  return (
    <div>
      <header className="border-b border-border pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">SiteHawk Dashboard</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-foreground md:text-3xl">Every workspace, out in the open.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Scroll page by page or open any tool directly. Your existing Site Search pipeline stays in its current order.</p>
      </header>
      <DashboardToolPages />
    </div>
  );
}