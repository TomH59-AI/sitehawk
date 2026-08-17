// Minimal stub for public config. Returns a resolved promise with an empty
// data payload so consumers (e.g. lib/publicConfig.js) get safe defaults.
export async function getPublicConfig(_params) {
  return { data: {} };
}
