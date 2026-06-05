import { createContext, useContext, useState } from "react";

// Shared pipeline progress so the sidebar can mirror what the Site Search
// screen is doing — which section is active, which are done, which are locked.
const PipelineContext = createContext(null);

// Ordered list of the gated Site Search pipeline sections.
export const PIPELINE_STEPS = [
  { key: "sarf", label: "SARF Map" },
  { key: "zoning", label: "Zoning" },
  { key: "targets", label: "Targets A·B·C" },
  { key: "maps", label: "Target A Maps" },
];

export function PipelineProvider({ children }) {
  // Which section is currently active (the flying hawk sits here).
  const [activeStep, setActiveStep] = useState(null);
  // Set of completed step keys.
  const [completedSteps, setCompletedSteps] = useState([]);

  const value = { activeStep, setActiveStep, completedSteps, setCompletedSteps };
  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

export function usePipeline() {
  return useContext(PipelineContext) || {
    activeStep: null,
    setActiveStep: () => {},
    completedSteps: [],
    setCompletedSteps: () => {},
  };
}