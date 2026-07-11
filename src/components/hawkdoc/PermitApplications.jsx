import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import DocsList from "./DocsList";
import DocUploader from "./DocUploader";
import DocFieldsView from "./DocFieldsView";

// Permit Applications (zoning / building-permit) — upload, AI fill, Q&A, sign, print.
// Extracted from the old HawkDocs page so it lives inside the unified hub.
// Screens: list -> new (upload+analyze) -> fields (review/fill)
export default function PermitApplications({ formImport = null }) {
  // A handoff from Hawk Forms drops the user straight into the uploader with the
  // form auto-fetched. Cleared on Back so “New” afterwards starts fresh.
  const [pendingImport, setPendingImport] = useState(formImport);
  const [screen, setScreen] = useState(formImport ? "new" : "list");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setDocs(await base44.entities.HawkDocument.list("-created_date", 100));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function goList() { setActive(null); setPendingImport(null); setScreen("list"); load(); }
  function openDoc(rec) { setActive(rec); setScreen("fields"); }
  function onReady(rec) { setActive(rec); setScreen("fields"); }

  if (screen === "new") return <DocUploader onBack={goList} onReady={onReady} formImport={pendingImport} />;
  if (screen === "fields" && active) return <DocFieldsView document={active} onBack={goList} />;
  return <DocsList docs={docs} loading={loading} onNew={() => setScreen("new")} onOpen={openDoc} onDeleted={load} />;
}