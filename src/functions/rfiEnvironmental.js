import { base44 } from "@/api/base44Client";

export function rfiEnvironmental(payload) {
  return base44.functions.invoke("rfiEnvironmental", payload);
}
