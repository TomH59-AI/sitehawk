import { getPublicConfig } from "@/functions/getPublicConfig";

let cachedConfig = null;

export async function loadPublicConfig() {
  if (cachedConfig) return cachedConfig;
  const response = await getPublicConfig({});
  cachedConfig = response.data || {};
  return cachedConfig;
}