import DashboardToolCard from "@/components/dashboard/DashboardToolCard";

export default function DashboardToolPage({ page }) {
  return (
    <section className="flex min-h-[calc(100dvh-8rem)] scroll-mt-20 snap-start flex-col justify-center py-8 md:scroll-mt-0 md:py-12">
      <div className="mb-8 flex items-start gap-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary font-heading text-2xl font-bold text-primary-foreground shadow-lg shadow-primary/20">{page.number}</span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">{page.eyebrow}</p>
          <h2 className="mt-1 font-heading text-3xl font-bold text-foreground md:text-5xl">{page.title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">{page.description}</p>
        </div>
      </div>
      <div className={`grid gap-4 ${page.tools.length === 1 ? "max-w-xl" : "md:grid-cols-2"}`}>
        {page.tools.map((tool) => <DashboardToolCard key={tool.to} tool={tool} primary={page.number === 1} />)}
      </div>
      <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Scroll for page {page.number + 1 <= 6 ? page.number + 1 : "top"}</p>
    </section>
  );
}