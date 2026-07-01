import { base44 } from "@/api/base44Client";
export async function followUpTrackerSync(payload) {
  return base44.functions.invoke("followUpTrackerSync", payload);
}