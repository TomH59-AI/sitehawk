import { Loader2, Search, X } from "lucide-react";

export default function DirectorySearchForm({ zip, onZipChange, onSubmit, onClear, loading, hasResult }) {
  return (
    <form onSubmit={onSubmit} className="relative z-10 mx-3 -mt-1 rounded-2xl border border-primary/20 bg-card p-3 shadow-lg shadow-primary/5 sm:mx-6 sm:-mt-3 sm:flex sm:items-center sm:gap-3 md:mx-10">
      <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-secondary/70 px-4 py-3.5 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
        <Search className="h-5 w-5 shrink-0 text-primary" />
        <span className="sr-only">Search by ZIP code</span>
        <input
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={zip}
          onChange={(event) => onZipChange(event.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="Search by ZIP code"
          className="w-full bg-transparent text-base font-semibold tracking-wide focus:outline-none"
        />
      </label>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:mt-0 sm:flex">
        <button disabled={loading || zip.length !== 5} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-md shadow-primary/15 transition-colors hover:bg-primary/90 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Build Dossier"}
        </button>
        <button type="button" onClick={onClear} disabled={loading || (!zip && !hasResult)} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50">
          <X className="h-4 w-4" /> Clear
        </button>
      </div>
    </form>
  );
}