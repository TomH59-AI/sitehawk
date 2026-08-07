import { base44 } from "@/api/base44Client";
export async function codehawkBatch(payload) {
  return base44.functions.invoke("codehawkBatch", payload);
}
