import { base44 } from "@/api/base44Client";

export async function rfiWetlands(payload) {
  return base44.functions.invoke("rfiWetlands", payload);
}
