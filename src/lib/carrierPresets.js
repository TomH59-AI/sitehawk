/**
 * Carrier RF presets — shared between the frontend (TowerSpecsForm) and the
 * CloudRF backend functions. Keep keys lowercase / stable; values are the
 * "headline band" most commonly modeled for that carrier's macro coverage.
 *
 * Numbers reflect typical US macro deployments:
 *   - frequency_mhz: dominant coverage band
 *   - power_w:       per-sector transmit power (PA output)
 *   - antenna_gain_dbi: sector panel gain
 *   - hbw:           horizontal beamwidth (sector = 65°, omni = 360°)
 */

export const CARRIER_PRESETS = {
  verizon: {
    label: "Verizon — 700 MHz (Band 13)",
    frequency_mhz: 700,
    power_w: 40,
    antenna_gain_dbi: 16,
    hbw: 65,
  },
  verizon_cband: {
    label: "Verizon 5G UC — C-Band 3.7 GHz (n77)",
    frequency_mhz: 3700,
    power_w: 20,
    antenna_gain_dbi: 24,
    hbw: 65,
  },
  att: {
    label: "AT&T — 850 MHz (Band 5)",
    frequency_mhz: 850,
    power_w: 40,
    antenna_gain_dbi: 16,
    hbw: 65,
  },
  tmobile: {
    label: "T-Mobile — 600 MHz (Band 71)",
    frequency_mhz: 600,
    power_w: 40,
    antenna_gain_dbi: 16,
    hbw: 65,
  },
  tmobile_2500: {
    label: "T-Mobile 5G UC — 2.5 GHz (n41)",
    frequency_mhz: 2500,
    power_w: 30,
    antenna_gain_dbi: 20,
    hbw: 65,
  },
  generic: {
    label: "Generic — 700 MHz omni",
    frequency_mhz: 700,
    power_w: 40,
    antenna_gain_dbi: 12,
    hbw: 360,
  },
};

export const DEFAULT_CARRIER = "verizon";

export function getCarrierPreset(carrier) {
  return CARRIER_PRESETS[carrier] || CARRIER_PRESETS[DEFAULT_CARRIER];
}