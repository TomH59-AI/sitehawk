import { base44 } from "@/api/base44Client";
export async function codehawkReview(payload) {
  return base44.functions.invoke("codehawkReview", payload);
}
