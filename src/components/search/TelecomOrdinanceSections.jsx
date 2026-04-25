import { RadioTower, ExternalLink } from "lucide-react";

export default function TelecomOrdinanceSections({ ordinance }) {
  const sections = ordinance?.telecom_sections || [];
  if (!ordinance || (!sections.length && !ordinance.extraction_notes)) return null;

  return (
    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <RadioTower className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-heading font-semibold text-foreground">Telecom Tower & Antenna Ordinance Sections</h4>
        {ordinance.status && (
          <span className="ml-auto text-[10px] uppercase tracking-wider rounded-full border border-primary/20 bg-background/60 px-2 py-0.5 text-primary">
            {ordinance.status.replace("_", " ")}
          </span>
        )}
      </div>

      {sections.length > 0 ? (
        <div className="space-y-3">
          {sections.map((section, index) => (
            <div key={index} className="rounded-md border border-border/60 bg-background/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    {section.section_ref || "Section pending"}{section.section_title ? ` — ${section.section_title}` : ""}
                  </p>
                  {section.topic && <p className="text-[11px] text-primary mt-0.5">{section.topic}</p>}
                </div>
                {section.confidence && <span className="text-[10px] text-muted-foreground">{section.confidence}</span>}
              </div>
              {section.clause_summary && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{section.clause_summary}</p>}
              {section.source_url && (
                <a href={section.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary mt-2 hover:underline">
                  Source <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{ordinance.extraction_notes}</p>
      )}
    </div>
  );
}