/**
 * Government Forms data — DELIBERATELY NARROW.
 *
 * ONLY the wetland-proximity FAA filings plus NEPA / SHPO / THPO compliance
 * forms. The broader FCC/FAA ASR + 7460 library stays in Hawk Forms and is not
 * duplicated here. Every entry is a real, named agency form or portal — nothing
 * invented, nothing approximated. Verify the current revision before filing.
 */
export const GOV_FORM_CATEGORIES = [
  {
    key: "faa_wetland",
    title: "FAA — Wetland Proximity Filings",
    icon: "🛬",
    items: [
      {
        name: "FAA Form 7460-1",
        subtitle: "Notice of Proposed Construction or Alteration",
        tag: "FAA",
        fillable: true,
        url: "https://oeaaa.faa.gov/oeaaa/external/portal.jsp",
        purpose:
          "Filed through the FAA OE/AAA portal. When the tower site sits on or beside a wetland, the wetland must be identified in the project description because it changes drainage, grading and wildlife-attractant review.",
      },
      {
        name: "FAA Advisory Circular 150/5200-33",
        subtitle: "Hazardous Wildlife Attractants On or Near Airports",
        tag: "FAA AC",
        url: "https://www.faa.gov/airports/resources/advisory_circulars/index.cfm/go/document.current/documentnumber/150_5200-33",
        purpose:
          "The FAA guidance that governs wetlands, stormwater ponds and other wildlife attractants near airports. Controls separation criteria when your candidate is inside airport influence and near wetland habitat.",
      },
      {
        name: "FAA Order 1050.1F",
        subtitle: "Environmental Impacts: Policies and Procedures",
        tag: "FAA Order",
        url: "https://www.faa.gov/regulations_policies/orders_notices/index.cfm/go/document.information/documentID/1028287",
        purpose:
          "FAA's own NEPA implementing order. Defines the environmental review and the wetlands special-purpose law requirements applied to FAA actions on your project.",
      },
      {
        name: "USACE ENG Form 4345",
        subtitle: "Application for Department of the Army Permit (Section 404)",
        tag: "USACE",
        fillable: true,
        url: "https://www.usace.army.mil/Missions/Civil-Works/Regulatory-Program-and-Permits/",
        purpose:
          "Required when construction places fill in waters of the U.S. or a jurisdictional wetland. Pair with a wetland delineation before submitting.",
      },
    ],
  },
  {
    key: "nepa",
    title: "NEPA — Environmental Review",
    icon: "🌿",
    items: [
      {
        name: "FCC Environmental Assessment (EA)",
        subtitle: "47 CFR § 1.1307 / § 1.1311 environmental review",
        tag: "NEPA",
        url: "https://www.fcc.gov/wireless/bureau-divisions/competition-infrastructure-policy-division/tower-and-antenna-siting",
        purpose:
          "An EA is required when the facility falls into an FCC § 1.1307 category — including wetlands, floodplains, wilderness, endangered species habitat, or historic properties. Content requirements are set by § 1.1311.",
      },
      {
        name: "Categorical Exclusion Determination",
        subtitle: "NEPA screening record for the candidate",
        tag: "NEPA",
        url: "https://www.energy.gov/nepa/categorical-exclusion-cx-determinations",
        purpose:
          "The documented finding that no EA or EIS is triggered. Keep the screening record with the SCIP so the carrier's environmental team can rely on it.",
      },
    ],
  },
  {
    key: "shpo",
    title: "SHPO — State Historic Preservation Office (Section 106)",
    icon: "🏛️",
    items: [
      {
        name: "FCC Form 620",
        subtitle: "New Tower Submission Packet",
        tag: "Section 106",
        fillable: true,
        url: "https://www.fcc.gov/wireless/bureau-divisions/competition-infrastructure-policy-division/historic-preservation",
        purpose:
          "The Section 106 submission packet for a NEW tower, sent to the State Historic Preservation Office under the Nationwide Programmatic Agreement.",
      },
      {
        name: "FCC Form 621",
        subtitle: "Collocation Submission Packet",
        tag: "Section 106",
        fillable: true,
        url: "https://www.fcc.gov/wireless/bureau-divisions/competition-infrastructure-policy-division/historic-preservation",
        purpose:
          "The Section 106 packet used when antennas are collocated on an existing structure rather than a new build.",
      },
      {
        name: "NCSHPO — State Office Directory",
        subtitle: "Find the reviewing SHPO for your state",
        tag: "Directory",
        url: "https://ncshpo.org/directory/",
        purpose:
          "Official directory of every State Historic Preservation Office — use it to confirm the correct reviewing office, submission method, and review fees.",
      },
    ],
  },
  {
    key: "thpo",
    title: "THPO — Tribal Historic Preservation Office",
    icon: "🪶",
    items: [
      {
        name: "TCNS — Tower Construction Notification System",
        subtitle: "FCC tribal notification for proposed towers",
        tag: "FCC TCNS",
        url: "https://wireless2.fcc.gov/UlsEntry/tcns/index.jsp",
        purpose:
          "The FCC system that notifies Tribal Nations and NHOs of a proposed tower so they can identify religious and culturally significant properties. Required before construction under the NPA.",
      },
      {
        name: "NATHPO — Tribal Office Directory",
        subtitle: "Locate the THPO with interest in your area",
        tag: "Directory",
        url: "https://www.nathpo.org/",
        purpose:
          "National Association of Tribal Historic Preservation Officers — used to identify and contact the Tribal offices responding through TCNS.",
      },
      {
        name: "ACHP Section 106 Guidance",
        subtitle: "Advisory Council on Historic Preservation",
        tag: "Guidance",
        url: "https://www.achp.gov/protecting-historic-properties",
        purpose:
          "The authoritative Section 106 process guidance governing SHPO and THPO consultation, including how adverse-effect findings must be resolved.",
      },
    ],
  },
];