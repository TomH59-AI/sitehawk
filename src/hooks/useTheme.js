import { useState, useEffect } from "react";

// Apply theme immediately before first render
const savedTheme = localStorage.getItem("sitehawk-theme") || "dark";
if (savedTheme === "dark") {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("sitehawk-theme") || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("sitehawk-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle };
}