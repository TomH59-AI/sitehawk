import ExhibitIntakeForm from "../components/towerfit/ExhibitIntakeForm";
import ExhibitSheet from "../components/towerfit/ExhibitSheet";
import { useState } from "react";

export default function SiteSketch() {
  const [model, setModel] = useState(null);
  return (
    <div style={{ minHeight:"100vh", background:"#F1F5F9", padding:"32px 24px" }}>
      <div style={{ maxWidth:900, margin:"0 auto" }}>
        <h1 style={{
          fontFamily:"'Courier New',Courier,monospace",
          fontSize:22, fontWeight:700, color:"#1B2A4A", marginBottom:24,
          letterSpacing:"0.05em",
        }}>
          📐 SiteHawk™ Site Sketch
        </h1>
        <p style={{ color:"#6B7280", fontSize:14, marginBottom:28 }}>
          Enter parcel dimensions below — watch your SCIP site sketch
          draw itself in real time.
        </p>
        <ExhibitIntakeForm onSubmit={setModel} />
        {model && (
          <div style={{ marginTop:32 }}>
            <ExhibitSheet model={model} />
          </div>
        )}
      </div>
    </div>
  );
}
