// Hawk Forms — compliance forms, portals & environmental reports for site acquisition.
export const FORM_CATEGORIES = [
  {
    key: "fcc",
    icon: "🏛️",
    title: "FCC Compliance & Licensing Forms",
    accent: "#FFC72C",
    items: [
      {
        name: "FCC Form 620",
        subtitle: "New Tower Submission Packet",
        url: "https://transition.fcc.gov/Forms/Form620/620.pdf",
        purpose:
          "Used for raw-land builds or brand-new antenna support structures to initiate Section 106 review. It provides the SHPO and THPOs with localized visual impact maps and archaeological studies to evaluate potential impacts on historic and cultural resources.",
        tag: "PDF Form",
      },
      {
        name: "FCC Form 621",
        subtitle: "Collocation Submission Packet",
        url: "https://transition.fcc.gov/Forms/Form621/621.pdf",
        purpose:
          "Used for equipment additions on existing structures (towers, rooftops, utility poles) only when the project fails to meet standard Section 106 collocation exclusions (e.g., if it requires a substantial increase in compound size or extra ground disturbance).",
        tag: "PDF Form",
      },
      {
        name: "FCC Form 854",
        subtitle: "Antenna Structure Registration (ASR)",
        url: "https://www.fcc.gov/sites/default/files/form854.pdf",
        purpose:
          "Required to register a physical tower structure with the FCC. It is mandatory for towers exceeding 200 feet AGL or those located near airports. Filing requires a prior certification that NEPA and Section 106 historic reviews are fully completed.",
        tag: "PDF Form",
      },
      {
        name: "FCC Form 601",
        subtitle: "Wireless Telecommunications Bureau Application",
        url: "https://www.fcc.gov/sites/default/files/601_jun_2000_0.pdf",
        purpose:
          "The primary multi-purpose application for wireless radio service authorizations and tower licensing. This form includes the explicit mandatory compliance checkboxes where you officially certify that the site does not have a significant environmental impact under NEPA guidelines.",
        tag: "PDF Form",
      },
    ],
  },
  {
    key: "faa",
    icon: "✈️",
    title: "FAA Aviation Safety Forms",
    accent: "#38BDF8",
    items: [
      {
        name: "FAA Form 7460-1",
        subtitle: "Notice of Proposed Construction or Alteration",
        url: "https://www.faa.gov/forms/index.cfm/go/document.information/documentid/186273",
        purpose:
          "The critical initial filing required at least 45 days before construction begins if a proposed tower exceeds 200 feet AGL or pierces airport runway glide slopes. It triggers the FAA aeronautical study to secure a \"Determination of No Hazard.\"",
        tag: "FAA Filing",
      },
      {
        name: "FAA Form 7460-2",
        subtitle: "Notice of Actual Construction or Alteration",
        url: "https://www.flashtechnology.com/wp-content/uploads/2017/10/FAA-AC-70-7460-1J.pdf",
        purpose:
          "A two-part follow-up filing required after receiving a hazard clearance. Part 1 must be submitted when the physical structure reaches its greatest height, and Part 2 must be filed within 5 days of the construction being completed and its obstruction lighting going live.",
        tag: "FAA Filing",
      },
    ],
  },
  {
    key: "environmental",
    icon: "🦺",
    title: "Environmental, Archaeological & Runoff Reports",
    accent: "#34D399",
    items: [
      {
        name: "Phase 1A Archaeological Survey",
        subtitle: "Cultural Resource Assessment",
        url: null,
        noLinkNote: "Custom report — ordered from a qualified archaeological consultant",
        purpose:
          "A localized literature review and surface walkthrough mandatory for raw-land builds to get SHPO/THPO clearance. The resulting Survey Letter must be uploaded as a required attachment to your FCC Form 620 to prove construction won't disturb historical artifacts or tribal resources.",
        tag: "Consultant Report",
      },
      {
        name: "Phase I Environmental Site Assessment (ESA)",
        subtitle: "ASTM E1527-21 Property Background Check",
        url: null,
        noLinkNote: "Certified report — ordered from an LSP/Consultant under ASTM E1527-21 standards",
        purpose:
          "A comprehensive property background check required by major carriers before executing a lease on a raw-land build. It investigates historical records, aerials, and land usage to ensure the site has no \"Recognized Environmental Conditions\" (RECs) like soil contamination or old underground fuel tanks.",
        tag: "Consultant Report",
      },
      {
        name: "EPA NPDES Stormwater Notice of Intent (NOI)",
        subtitle: "Construction General Permit Coverage",
        url: "https://www.epa.gov/npdes/stormwater-discharges-construction-activities-eg-construction-general-permit",
        purpose:
          "Required under the National Pollutant Discharge Elimination System (NPDES) for raw-land builds or compound expansions that will disturb 1 or more acres of total soil. Submitting this application secures critical coverage under the EPA's Construction General Permit (CGP) to manage stormwater runoff compliance.",
        tag: "EPA Portal",
      },
    ],
  },
  {
    key: "portals",
    icon: "📡",
    title: "Technical Reference Links",
    accent: "#A78BFA",
    items: [
      {
        name: "FCC TCNS",
        subtitle: "Tower Construction Notification System",
        url: "https://www.fcc.gov/wireless/support/tower-construction-notification-system-tcns",
        purpose:
          "The mandatory electronic system used to log a proposed tower construction. The FCC uses this portal to instantly broadcast the project data to all applicable Tribal Historic Preservation Offices (THPOs) to initiate tribal consultation.",
        tag: "Live Portal",
      },
      {
        name: "FCC ULS",
        subtitle: "Universal Licensing System",
        url: "https://www.fcc.gov/wireless/universal-licensing-system",
        purpose:
          "The primary digital clearinghouse used by the FCC for wireless licensing. This dashboard portal is where you go to electronically file and manage completed versions of Form 601 and Form 854.",
        tag: "Live Portal",
      },
    ],
  },
];