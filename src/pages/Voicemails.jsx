import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Phone, PhoneCall, Clock, AlertTriangle, CheckCircle2, Archive, Loader2, RefreshCw } from "lucide-react";
import { getTwilioRecording } from "@/functions/getTwilioRecording";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "in_progress", label: "In Progress" },
  { key: "called_back", label: "Called Back" },
  { key: "archived", label: "Archived" },
];

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function timeUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (ms < 0) return { overdue: true, label: `${Math.abs(hrs)}h overdue` };
  return { overdue: false, label: `${hrs}h ${mins}m left` };
}

export default function Voicemails() {
  const [voicemails, setVoicemails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    const data = await base44.entities.Voicemail.list("-created_date", 100);
    setVoicemails(data);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = tab === "all" ? voicemails : voicemails.filter(v => v.status === tab);
  const newCount = voicemails.filter(v => v.status === "new").length;

  const updateStatus = async (id, status) => {
    await base44.entities.Voicemail.update(id, { status });
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground flex items-center gap-3">
            <Phone className="w-7 h-7 text-primary" />
            Voicemails
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Callers leave a callback message — promise: 24-hour return.
            {newCount > 0 && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs font-bold">{newCount} new</span>}
          </p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-secondary text-sm font-semibold text-foreground transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {STATUS_TABS.map(t => {
          const count = t.key === "all" ? voicemails.length : voicemails.filter(v => v.status === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                tab === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Phone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No voicemails in this category yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => (
            <VoicemailCard key={v.id} vm={v} onStatusChange={updateStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

function VoicemailCard({ vm, onStatusChange }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  const followUp = vm.status === "new" || vm.status === "in_progress" ? timeUntil(vm.follow_up_due) : null;

  const loadAudio = async () => {
    if (audioUrl || !vm.recording_url) return;
    setLoadingAudio(true);
    const res = await getTwilioRecording({ recording_url: vm.recording_url });
    // res.data is a Blob (axios response)
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: "audio/mpeg" });
    setAudioUrl(URL.createObjectURL(blob));
    setLoadingAudio(false);
  };

  const statusColors = {
    new: "bg-red-500/10 text-red-500 border-red-500/30",
    in_progress: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    called_back: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    archived: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-heading font-bold text-lg text-foreground">{vm.from_number}</span>
            <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${statusColors[vm.status] || statusColors.new}`}>
              {vm.status?.replace("_", " ")}
            </span>
            {followUp && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                followUp.overdue ? "bg-red-500/15 text-red-500" : "bg-blue-500/10 text-blue-500"
              }`}>
                {followUp.overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {followUp.label}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {vm.from_city && vm.from_state ? `${vm.from_city}, ${vm.from_state} · ` : ""}
            Received {formatTime(vm.created_date)}
            {vm.recording_duration_sec ? ` · ${vm.recording_duration_sec}s` : ""}
          </p>
        </div>

        {vm.callback_number && (
          <a
            href={`tel:${vm.callback_number}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow transition-all"
          >
            <PhoneCall className="w-4 h-4" />
            Call {vm.callback_number}
          </a>
        )}
      </div>

      {/* Transcription */}
      {vm.transcription ? (
        <div className="rounded-lg bg-secondary/50 border border-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Transcription</p>
          <p className="text-sm text-foreground italic leading-relaxed">"{vm.transcription}"</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">Transcription pending...</p>
      )}

      {/* Audio player */}
      {vm.recording_url && (
        <div>
          {!audioUrl ? (
            <button
              onClick={loadAudio}
              disabled={loadingAudio}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/70 transition-all"
            >
              {loadingAudio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "▶"}
              {loadingAudio ? "Loading..." : "Listen to recording"}
            </button>
          ) : (
            <audio controls src={audioUrl} className="w-full h-10" />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        {vm.status !== "in_progress" && vm.status !== "called_back" && vm.status !== "archived" && (
          <button onClick={() => onStatusChange(vm.id, "in_progress")} className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 text-xs font-bold hover:bg-amber-500/20 transition-all">
            Mark In Progress
          </button>
        )}
        {vm.status !== "called_back" && (
          <button onClick={() => onStatusChange(vm.id, "called_back")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-bold hover:bg-emerald-500/20 transition-all">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Mark Called Back
          </button>
        )}
        {vm.status !== "archived" && (
          <button onClick={() => onStatusChange(vm.id, "archived")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs font-bold hover:bg-secondary/70 transition-all">
            <Archive className="w-3.5 h-3.5" />
            Archive
          </button>
        )}
      </div>
    </div>
  );
}