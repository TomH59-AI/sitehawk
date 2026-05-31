import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import DocsList from "../components/hawkdoc/DocsList";
import DocUploader from "../components/hawkdoc/DocUploader";
import DocFieldsView from "../components/hawkdoc/DocFieldsView";

// Hawk Document Intelligence: list -> new (upload+analyze) -> fields (review/fill)
export default function HawkDocs() {
  const [screen, setScreen] = useState("list");
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

  function goList() { setActive(null); setScreen("list"); load(); }
  function openDoc(rec) { setActive(rec); setScreen("fields"); }
  function onReady(rec) { setActive(rec); setScreen("fields"); }

  if (screen === "new") return <DocUploader onBack={goList} onReady={onReady} />;
  if (screen === "fields" && active) return <DocFieldsView document={active} onBack={goList} />;
  return <DocsList docs={docs} loading={loading} onNew={() => setScreen("new")} onOpen={openDoc} onDeleted={load} />;
}