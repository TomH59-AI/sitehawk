import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { generateSarfMap } from "@/functions/generateSarfMap";
import { Loader2, MapPinned } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE, US_STATES } from "@/lib/skywave";
import SkyWaveField from "../components/skywave/SkyWaveField";
import RadiusPicker from "../components/skywave/RadiusPicker";

const inputBase = "w-full rounded-lg border px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2";

function maskPhone(v) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function ScipNew() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // Prefill from a TalonFit® scout target (?lat=&lon=&site_name=&county=&state=)
  const qp = new URLSearchParams(window.location.search);
  const [form, setForm] = useState({
    agent_name: "", agent_phone: "", agent_email: "", submittal_date: today(),
    site_name: qp.get("site_name") || "", sarf_height: "",
    latitude: qp.get("lat") || "", longitude: qp.get("lon") || "",
    county: qp.get("county") || "", state: (qp.get("state") || "").toUpperCase(),
    search_radius: "1.00",
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function validate() {
    const e = {};
    if (!form.agent_name.trim()) e.agent_name = "Required";
    if (!/^\(\d{3}\) \d{3}-\d{4}$/.test(form.agent_phone)) e.agent_phone = "Format: (XXX) XXX-XXXX";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.agent_email)) e.agent_email = "Valid email required";
    if (!form.submittal_date) e.submittal_date = "Required";
    if (!form.site_name.trim()) e.site_name = "Required";
    const h = Number(form.sarf_height);
    if (!Number.isInteger(h) || h < 1 || h > 2000) e.sarf_height = "Integer 1–2000";
    const lat = Number(form.latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) e.latitude = "Range -90 to 90";
    const lon = Number(form.longitude);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) e.longitude = "Range -180 to 180";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const isValid = () =>
    form.agent_name.trim() && /^\(\d{3}\) \d{3}-\d{4}$/.test(form.agent_phone) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.agent_email) && form.submittal_date &&
    form.site_name.trim() && Number(form.sarf_height) >= 1 &&
    form.latitude !== "" && form.longitude !== "";

  async function buildPayload(status) {
    return {
      ...form,
      sarf_height: Number(form.sarf_height),
      latitude: Number(Number(form.latitude).toFixed(5)),
      longitude: Number(Number(form.longitude).toFixed(5)),
      state: form.state ? form.state.toUpperCase() : "",
      status,
    };
  }

  async function handleSaveDraft() {
    if (!validate()) return;
    setBusy(true);
    try {
      const rec = await base44.entities.ScipRecord.create(await buildPayload("draft"));
      toast.success("Saved as draft");
      navigate(`/scip/${rec.id}`);
    } catch (err) {
      toast.error(err.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    if (!validate()) return;
    setBusy(true);
    try {
      const rec = await base44.entities.ScipRecord.create(await buildPayload("draft"));
      try {
        const res = await generateSarfMap({
          lat: Number(form.latitude), lon: Number(form.longitude),
          search_radius: form.search_radius, site_name: form.site_name,
        });
        const mapUrl = res.data?.map_image_url;
        if (mapUrl) {
          await base44.entities.ScipRecord.update(rec.id, { map_image_url: mapUrl, status: "map_generated" });
        }
      } catch {
        toast.error("Map generation failed — try again");
      }
      navigate(`/scip/${rec.id}`);
    } catch (err) {
      toast.error(err.message || "Failed to create record");
    } finally {
      setBusy(false);
    }
  }

  const ring = { borderColor: SKYWAVE.line };

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: SKYWAVE.bg, fontFamily: "Inter, Helvetica Neue, Arial, sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        {/* Header band */}
        <div className="rounded-lg px-6 py-5 flex items-center gap-4 mb-6" style={{ background: SKYWAVE.dark }}>
          <img src={SKYWAVE.logo} alt="SkyWave" style={{ height: 64 }} />
          <div>
            <div className="text-[11px] uppercase tracking-[3px] font-semibold" style={{ color: SKYWAVE.yellow }}>SkyWave</div>
            <h1 className="text-xl font-bold text-white">New Site Candidate — Step 1</h1>
            <div className="text-[11px]" style={{ color: "#B7BED0" }}>SCIP · Site Acquisition &amp; Search Ring</div>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-8" style={ring}>
          {/* Section 1 */}
          <section>
            <SectionBar title="Site Acquisition" />
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <SkyWaveField label="Agent Name" error={errors.agent_name}>
                <input className={inputBase} style={ring} value={form.agent_name} maxLength={80}
                  onChange={(e) => set("agent_name", e.target.value)} />
              </SkyWaveField>
              <SkyWaveField label="Agent Phone" error={errors.agent_phone}>
                <input className={inputBase} style={ring} value={form.agent_phone} placeholder="(555) 123-4567"
                  onChange={(e) => set("agent_phone", maskPhone(e.target.value))} />
              </SkyWaveField>
              <SkyWaveField label="Agent E-mail" error={errors.agent_email}>
                <input className={inputBase} style={ring} type="email" value={form.agent_email}
                  onChange={(e) => set("agent_email", e.target.value)} />
              </SkyWaveField>
              <SkyWaveField label="Submittal Date" error={errors.submittal_date}>
                <input className={inputBase} style={ring} type="date" value={form.submittal_date}
                  onChange={(e) => set("submittal_date", e.target.value)} />
              </SkyWaveField>
            </div>
          </section>

          {/* Section 2 */}
          <section>
            <SectionBar title="Search Ring Information" />
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <SkyWaveField label="Site Name" error={errors.site_name}>
                <input className={inputBase} style={ring} value={form.site_name} maxLength={60}
                  placeholder="SW-TX-0142 (Karnes City)" onChange={(e) => set("site_name", e.target.value)} />
              </SkyWaveField>
              <SkyWaveField label="SARF Height (ft AGL)" error={errors.sarf_height}>
                <input className={inputBase} style={ring} type="number" min={1} max={2000} value={form.sarf_height}
                  onChange={(e) => set("sarf_height", e.target.value)} />
              </SkyWaveField>
              <SkyWaveField label="Latitude" error={errors.latitude}>
                <input className={inputBase} style={ring} type="number" step="0.00001" value={form.latitude}
                  placeholder="28.88280" onChange={(e) => set("latitude", e.target.value)} />
              </SkyWaveField>
              <SkyWaveField label="Longitude" error={errors.longitude}>
                <input className={inputBase} style={ring} type="number" step="0.00001" value={form.longitude}
                  placeholder="-97.90710" onChange={(e) => set("longitude", e.target.value)} />
              </SkyWaveField>
              <SkyWaveField label="County" optional helper="Optional">
                <input className={inputBase} style={ring} value={form.county} maxLength={60}
                  onChange={(e) => set("county", e.target.value)} />
              </SkyWaveField>
              <SkyWaveField label="State" optional helper="Optional">
                <select className={inputBase} style={ring} value={form.state}
                  onChange={(e) => set("state", e.target.value)}>
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </SkyWaveField>
            </div>
            <div className="mt-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: SKYWAVE.navy }}>Search Radius</div>
              <RadiusPicker value={form.search_radius} onChange={(v) => set("search_radius", v)} />
            </div>
          </section>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button onClick={handleGenerate} disabled={busy || !isValid()}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-white font-semibold text-base disabled:opacity-50"
              style={{ background: SKYWAVE.blue }}>
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPinned className="w-5 h-5" />}
              Generate SARF Map
            </button>
            <button onClick={handleSaveDraft} disabled={busy}
              className="rounded-lg px-6 py-3.5 font-semibold text-base bg-white disabled:opacity-50"
              style={{ border: `2px solid ${SKYWAVE.blue}`, color: SKYWAVE.blue }}>
              Save as Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionBar({ title }) {
  return (
    <div className="flex items-stretch rounded-md overflow-hidden">
      <div style={{ width: 5, background: SKYWAVE.yellow }} />
      <div className="flex-1 px-4 py-2.5 text-white text-[11px] font-bold uppercase tracking-wide" style={{ background: SKYWAVE.blue }}>
        {title}
      </div>
    </div>
  );
}