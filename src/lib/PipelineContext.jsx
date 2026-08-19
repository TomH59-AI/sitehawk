import { createContext, useContext, useState, useCallback, useEffect } from "react";

// Shared pipeline progress + session so each standalone pipeline PAGE (SARF Map,
// Zoning, Targets, Target A/B/C Maps, Deed & Skip-Trace) can read the same
// search-ring session the previous page produced. Persisted to localStorage so
// navigating between pages (or refreshing) never loses the run.
const PipelineContext = createContext(null);

// Ordered list of the gated Site Search pipeline sections.
export const PIPELINE_STEPS = [
  { key: "sarf", label: "SARF Map" },
  { key: "zoning", label: "Zoning" },
  { key: "targets", label: "Targets A·B·C" },
  { key: "maps", label: "Target A Maps" },
];

const SESSION_STORE = "sitehawk:pipeline-session";
const EMPTY_SESSION = {
  center: null,
  params: { radius_miles: 0.5, tower_height_ft: 150, agent_name: "", ring_name: "", compound_size: "100x100" },
  sarfPacket: null,
  zoningResult: null,
  zoningDecision: null,
  targets: [null, null, null],
  activeTarget: null,
  sectionData: {},
};

function loadSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_STORE) || "null");
    if (!raw || typeof raw !== "object") return EMPTY_SESSION;
    return { ...EMPTY_SESSION, ...raw, params: { ...EMPTY_SESSION.params, ...(raw.params || {}) } };
  } catch {
    return EMPTY_SESSION;
  }
}

export function PipelineProvider({ children }) {
  // Which section is currently active (the flying hawk sits here).
  const [activeStep, setActiveStep] = useState(null);
  // Set of completed step keys.
  const [completedSteps, setCompletedSteps] = useState([]);
  // The shared search-ring session used by the standalone pipeline pages.
  const [session, setSession] = useState(loadSession);

  useEffect(() => {
    try { localStorage.setItem(SESSION_STORE, JSON.stringify(session)); } catch { /* ignore */ }
  }, [session]);

  const patchSession = useCallback((patch) => {
    setSession((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }, []);

  const resetSession = useCallback(() => setSession(EMPTY_SESSION), []);

  const value = {
    activeStep, setActiveStep, completedSteps, setCompletedSteps,
    session, patchSession, resetSession,
  };
  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

export function usePipeline() {
  return useContext(PipelineContext) || {
    activeStep: null,
    setActiveStep: () => {},
    completedSteps: [],
    setCompletedSteps: () => {},
    session: EMPTY_SESSION,
    patchSession: () => {},
    resetSession: () => {},
  };
}