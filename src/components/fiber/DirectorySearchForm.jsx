import { Loader2, Search } from "lucide-react";

export default function DirectorySearchForm({ zip, onZipChange, onSubmit, loading }) {
  return (
    <form onSubmit={onSubmit} className="mt-5 flex gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">Search by ZIP code</span>
        <input
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={zip}
          onChange={(event) => onZipChange(event.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="Search by ZIP code"
          className="w-full bg-transparent text-sm focus:outline-none"
        />
      </label>
      <button disabled={loading || zip.length !== 5} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
      </button>
    </form>
  );
}