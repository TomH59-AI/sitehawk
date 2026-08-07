/**
 * EntityRegistryCard — shown when Target A's owner is a business entity
 * (LLC / Trust / Corp) and Skip-Trace resolved real humans behind it through a
 * state business registry (currently Sunbiz, Florida only).
 *
 * Displays exactly what the registry published — registered agent, officers,
 * principal address — with the source named and a link to the filing. When the
 * registry produced nothing, it says so instead of implying a dead end was a
 * data failure.
 */
import { Building2, ExternalLink, UserCheck } from "lucide-react";

export default function EntityRegistryCard({ registry }) {
  if (!registry) return null;

  const { source, registered_agent, officers = [], principal_address, detail_url } = registry;
  const hasPeople = !!registered_agent || officers.length > 0;

  return (
    <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-amber-800 dark:text-amber-200">
        <Building2 className="h-3.5 w-3.5" /> Entity owner · business registry
      </div>

      {hasPeople ? (
        <div className="mt-2 space-y-1.5 text-sm text-amber-900 dark:text-amber-100">
          {registered_agent && (
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 shrink-0" />
              <span className="font-semibold">{registered_agent}</span>
              <span className="text-[10px] font-mono uppercase opacity-70">registered agent</span>
            </div>
          )}
          {officers.map((o) => (
            <div key={o} className="flex items-center gap-2 pl-6">
              <span className="font-medium">{o}</span>
              <span className="text-[10px] font-mono uppercase opacity-70">officer / manager</span>
            </div>
          ))}
          {principal_address && (
            <div className="pl-6 font-mono text-[11px] opacity-80">{principal_address}</div>
          )}
          <div className="pt-1 text-[11px] opacity-80">
            Phones and emails below were traced against these names, not the company.
          </div>
        </div>
      ) : (
        <div className="mt-2 text-sm text-amber-900 dark:text-amber-100">
          People-search cannot match an LLC / Trust / Corp, and no officer was published for this
          entity. Manual lookup required.
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono text-amber-800/80 dark:text-amber-200/70">
        <span>Source: {source}</span>
        {detail_url && (
          <a
            href={detail_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline hover:no-underline"
          >
            View filing <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}