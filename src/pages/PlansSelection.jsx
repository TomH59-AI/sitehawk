/**
 * PlansSelection — redirects users to the main PricingV2 page.
 * The UsageBadge sidebar link points here; we redirect straight to /pricing
 * so there's only one source of truth for plan cards.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function PlansSelection() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/pricing", { replace: true }); }, [navigate]);
  return null;
}