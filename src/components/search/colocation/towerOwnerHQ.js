/**
 * towerOwnerHQ — maps FCC ASR licensee names to the owner company's
 * corporate headquarters. Substring matching on the licensee string.
 */
const HQ_MAP = [
  ["american tower", "American Tower Corp — Boston, MA"],
  ["crown castle", "Crown Castle Inc — Houston, TX"],
  ["sba ", "SBA Communications — Boca Raton, FL"],
  ["sba tower", "SBA Communications — Boca Raton, FL"],
  ["sba structures", "SBA Communications — Boca Raton, FL"],
  ["vertical bridge", "Vertical Bridge — Boca Raton, FL"],
  ["phoenix tower", "Phoenix Tower International — Boca Raton, FL"],
  ["diamond communications", "Diamond Communications — Short Hills, NJ"],
  ["harmoni towers", "Harmoni Towers — Little Rock, AR"],
  ["uniti", "Uniti Group — Little Rock, AR"],
  ["insite towers", "InSite Wireless (American Tower) — Boston, MA"],
  ["tillman", "Tillman Infrastructure — New York, NY"],
  ["verizon", "Verizon Communications — New York, NY"],
  ["cellco", "Verizon Wireless (Cellco) — Basking Ridge, NJ"],
  ["at&t", "AT&T Inc — Dallas, TX"],
  ["att ", "AT&T Inc — Dallas, TX"],
  ["new cingular", "AT&T Mobility (New Cingular) — Atlanta, GA"],
  ["t-mobile", "T-Mobile US — Bellevue, WA"],
  ["tmobile", "T-Mobile US — Bellevue, WA"],
  ["sprint", "Sprint (T-Mobile US) — Bellevue, WA"],
  ["dish", "DISH Wireless (EchoStar) — Englewood, CO"],
  ["echostar", "EchoStar Corp — Englewood, CO"],
  ["us cellular", "US Cellular — Chicago, IL"],
  ["united states cellular", "US Cellular — Chicago, IL"],
  ["lendlease", "Lendlease Towers — New York, NY"],
  ["towerco", "TowerCo — Cary, NC"],
  ["skyway towers", "Skyway Towers — Tampa, FL"],
  ["tower ventures", "Tower Ventures — Memphis, TN"],
];

export function getOwnerHQ(ownerName) {
  if (!ownerName) return null;
  const s = ownerName.toLowerCase();
  for (const [key, hq] of HQ_MAP) {
    if (s.includes(key)) return hq;
  }
  return null;
}