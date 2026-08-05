import { useState } from "react";
import { Link } from "react-router-dom";
import DeedStep from "@/components/search/section4/DeedStep";
import SkipTraceStep from "@/components/search/section4/SkipTraceStep";
import PipelinePageHeader from "@/components/pipeline/PipelinePageHeader";
import { usePipeline } from "@/lib/PipelineContext";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import { reportAllParcels } from "@/functions/reportAllParcels";
import { skipTraceCascade } from "@/functions/skipTraceCascade";

const LETTERS = ["A", "B", "C"];

/**
 * Deed & Skip-Trace — ONE shared standalone page for all three targets. Pick a
 * target, pull its deed of record (Realie → ReportAll USA backfill) and run the
 * owner contact cascade. Nothing is fabricated: missing data is reported as
 * unavailable with the source named.
 */
export default function DeedSkipTracePage() {
  const { session } = usePipeline();
  const targets = session.targets || [null, null, null];
  const firstAvailable = Math.max(0, targets.findIndex(Boolean));
  const [slot, setSlot] = useState(firstAvailable === -1 ? 0 : firstAvailable);
  const target = targets[slot] || null;

  const [deed, setDeed] = useState(null);
  const [deedDone, setDeedDone] = useState(false);
  const [deedLoading, setDeedLoading] = useState(false);
  const [deedError, setDeedError] = useState(null);

  const [trace, setTrace] = useState(null);
  const [traceDone, setTraceDone] = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState(null);

  const pickSlot = (i) => {
    setSlot(i);
    setDeed(null); setDeedDone(false); setDeedError(null);
    setTrace(null); setTraceDone(false); setTraceError(null);
  };

  const runDeed = async () => {
    if (!target) return;
    setDeedError(null);
    setDeedLoading(true);
    try {
      const [realieRes, reportAllRes] = await Promise.all([
        realieParcelsInRing({ mode: "click", lat: target.latitude, lon: target.longitude }).catch(() => null),
        reportAllParcels({ mode: "point", lat: target.latitude, lon: target.longitude }).catch(() => null),
      ]);
      const rp = realieRes?.data?.parcels?.[0] || null;
      const ra = reportAllRes?.data?.parcels?.[0] || null;
      setDeed((rp || ra) ? {
        owner_name: rp?.owner_name || ra?.owner_name || target?.owner_name || "",
        deed_type: rp?.deed_type || null,
        deed_doc_num: rp?.deed_doc_num || null,
        deed_book: rp?.deed_book || null,
        ownership_start: rp?.ownership_start || null,
        last_sale_date: rp?.last_sale_date || ra?.last_sale_date || null,
        last_sale_price: rp?.last_sale_price || ra?.last_sale_price || null,
        legal_description: rp?.legal_description || ra?.legal_description || null,
        transfers: rp?.transfers || [],
        source: rp && (rp.deed_type || rp.last_sale_date || rp.legal_description) ? "Realie" : (ra ? "ReportAll USA" : "Realie"),
      } : null);
      setDeedDone(true);
    } catch (err) {
      setDeedError(err?.message || "Deed lookup failed.");
    } finally {
      setDeedLoading(false);
    }
  };

  const runTrace = async () => {
    if (!target) return;
    setTraceError(null);
    setTraceLoading(true);
    try {
      const res = await skipTraceCascade({
        owner_name: target.owner_name || target.owner || "",
        mailing_address: target.mailing_address || target.parcel_address || "",
        target_label: `Target ${LETTERS[slot]}`,
      });
      setTrace(res?.data ?? res ?? null);
      setTraceDone(true);
    } catch (err) {
      setTraceError(err?.message || "Skip-Trace failed.");
    } finally {
      setTraceLoading(false);
    }
  };

  const ownerName = target?.owner_name || target?.owner || "";

  return (
    <div className="space-y-5">
      <PipelinePageHeader
        step="9"
        title="Deed & Skip-Trace"
        subtitle="Deed of record, chain of title, and owner phone/email for any of your three targets — one page for all of it."
        context={target ? `Target ${LETTERS[slot]} · ${target.parcel_address || ownerName || ""} · ${Number(target.latitude).toFixed(6)}, ${Number(target.longitude).toFixed(6)}` : null}
      />

      <div className="flex flex-wrap gap-2">
        {LETTERS.map((letter, i) => (
          <button
            key={letter}
            onClick={() => pickSlot(i)}
            disabled={!targets[i]}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
              slot === i && targets[i]
                ? "bg-primary text-primary-foreground border-primary"
                : targets[i]
                ? "bg-card text-foreground border-border hover:bg-muted"
                : "bg-muted text-muted-foreground border-border cursor-not-allowed"
            }`}
          >
            Target {letter}
          </button>
        ))}
      </div>

      {!target ? (
        <div className="rounded-xl border border-border bg-muted/40 px-5 py-8 text-center space-y-3">
          <div className="text-3xl">📜</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            No targets selected yet. Pick your A·B·C candidates first, then pull deeds and owner contacts here.
          </p>
          <Link
            to="/targets"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Go to Targets A·B·C
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <DeedStep
            index={1}
            unlocked
            loading={deedLoading}
            done={deedDone}
            deed={deed}
            error={deedError}
            ownerName={ownerName}
            onRun={runDeed}
          />
          <SkipTraceStep
            index={2}
            unlocked
            loading={traceLoading}
            done={traceDone}
            result={trace}
            error={traceError}
            ownerName={ownerName}
            onRun={runTrace}
          />
        </div>
      )}
    </div>
  );
}