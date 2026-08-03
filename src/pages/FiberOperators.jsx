import { useState } from "react";
import { Network, Info } from "lucide-react";
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
    <div className="mx-auto max-w-4xl p-2 md:p-6">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-foreground">
        <Network className="h-6 w-6 text-primary" /> Local Services &amp; Governing Authority Directory
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter a ZIP code to find governing jurisdictions, police, fire, non-emergency dispatch, electric utility, and verified fiber contacts.
      </p>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Government and public-safety contacts are verified against official sources by built-in Gemini. Utility territory comes from HIFLD; confirm all service and non-emergency contacts before relying on them.</span>
      </div>
      <DirectorySearchForm zip={zip} onZipChange={setZip} onSubmit={search} onClear={clear} loading={loading} hasResult={!!result || !!error} />
      {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {result && <DirectoryResults result={result} />}
    </div>
  );
}