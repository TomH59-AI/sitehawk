import { RESOURCE_STATUS } from "./registryConst";

// Data-quality badge: green Verified / yellow Needs Review / red Broken-Unavailable.
export default function StatusBadge({ status }) {
  const s = RESOURCE_STATUS[status] || RESOURCE_STATUS.needs_review;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}