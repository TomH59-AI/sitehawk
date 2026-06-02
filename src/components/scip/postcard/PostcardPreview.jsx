import { MapPin } from "lucide-react";

// Lightweight on-screen approximation of the mailed 6x9 postcard (front + back).
// Mirrors the server-rendered HTML in sendPostcardMailers — factual & non-binding.
export default function PostcardPreview({ recipient, sender, message }) {
  const owner = recipient?.owner_name || "Property Owner";
  const parcel = recipient?.parcel_address || "your property";
  const body = (message || "").trim();
  const defaultBody = [
    "We're researching possible locations for a wireless communications tower and your property came up as worth a conversation.",
    "This is simply an exploratory inquiry — there are no commitments, and nothing is decided. If you'd be open to discussing whether a ground lease might make sense, I'd welcome a quick call.",
    "If now isn't the right time, no problem at all. Thank you for your consideration.",
  ];
  const paragraphs = body ? body.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean) : defaultBody;
  const senderName = sender?.name || sender?.company || "Your Name";

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {/* FRONT */}
      <div className="rounded-lg overflow-hidden shadow-sm border border-border">
        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 bg-secondary">Front</div>
        <div className="p-4 text-white" style={{ background: "linear-gradient(135deg,#0b3d91 0%,#1769e0 55%,#19a7d8 100%)", aspectRatio: "9/5.75" }}>
          <div className="text-[8px] font-bold uppercase tracking-[2px]" style={{ color: "#ffd24a" }}>Cellular Tower Lease — Exploratory Inquiry</div>
          <div className="font-bold leading-tight mt-2" style={{ fontSize: 17 }}>
            Would you consider a <span style={{ color: "#ffd24a" }}>cell tower ground lease</span>?
          </div>
          <p className="mt-2 leading-snug" style={{ fontSize: 10, opacity: 0.95 }}>
            We're exploring potential wireless tower sites in your area and wanted to ask whether you'd be open to a conversation about your property. There's no obligation — just an exploratory question.
          </p>
          <div className="mt-2 flex items-center gap-1" style={{ fontSize: 9, opacity: 0.85 }}>
            <MapPin className="w-3 h-3" /> Re: {parcel}
          </div>
        </div>
      </div>

      {/* BACK */}
      <div className="rounded-lg overflow-hidden shadow-sm border border-border">
        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 bg-secondary">Back</div>
        <div className="p-4 bg-white text-[#13233f] flex flex-col justify-between" style={{ aspectRatio: "9/5.75" }}>
          <div>
            <div className="font-bold" style={{ color: "#1769e0", fontSize: 13 }}>Dear {owner},</div>
            {paragraphs.map((p, i) => (
              <p key={i} className="mt-1.5 leading-snug" style={{ fontSize: 9.5 }}>{p}</p>
            ))}
          </div>
          <div className="mt-2 rounded p-2" style={{ background: "#f3f7ff", borderLeft: "3px solid #1769e0" }}>
            <div className="text-[7px] font-bold uppercase tracking-[2px] text-[#6b7a90]">Reach Me Directly</div>
            <div className="font-extrabold text-[#0b3d91]" style={{ fontSize: 11 }}>{senderName}</div>
            {sender?.company && sender?.name && <div style={{ fontSize: 9 }}>{sender.company}</div>}
            {sender?.phone && <div style={{ fontSize: 9 }}>Phone: {sender.phone}</div>}
            {sender?.email && <div style={{ fontSize: 9 }}>Email: {sender.email}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}