import { base44 } from "@/api/base44Client";
export async function parcelFrontage(payload) {
  return base44.functions.invoke("parcelFrontage", payload);
}
