import { useState } from "react";
import { Network, Info, ShieldCheck, Database } from "lucide-react";
import { localDirectoryByZip } from "@/functions/localDirectoryByZip";
import DirectorySearchForm from "@/components/fiber/DirectorySearchForm";
import DirectoryResults from "@/components/fiber/DirectoryResults";

export default function FiberOperators() {
  const [zip, setZip] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const clear = () => {
    setZip("");
    setResult(null);
    setError("");
  };

  const search = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await localDirectoryByZip({ zip });
      setResult(response.data);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError.message || "Directory lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-2 md:p-6">
      <header className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/10 shadow-xl shadow-primary/5">
        <div className="border-b border-border/70 px-5 py-6 md:px-8 md:py-9">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5" /> SiteHawk verified intelligence</span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Database className="h-3.5 w-3.5" /> Official-source dossier</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 sm:flex">
              <Network className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="max-w-3xl font-heading text-3xl font-bold leading-tight text-foreground md:text-5xl">Local Services &amp; Governing Authority Directory</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                Enter a ZIP code to find governing jurisdictions, police, fire, non-emergency dispatch, electric utility, and verified fiber contacts.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_auto] md:items-center md:px-8">
          <div className="flex items-start gap-3 text-xs leading-5 text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Government and public-safety contacts are verified against official sources by built-in Gemini. Utility territory comes from HIFLD; confirm all service and non-emergency contacts before relying on them.</span>
          </div>
          <span className="w-fit rounded-full border border-border bg-secondary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Source tracked</span>
        </div>
      </header>
      <DirectorySearchForm zip={zip} onZipChange={setZip} onSubmit={search} onClear={clear} loading={loading} hasResult={!!result || !!error} />
      {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
      {result && <DirectoryResults result={result} />}
    </div>
  );
}