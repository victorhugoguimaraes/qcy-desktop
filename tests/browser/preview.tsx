import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import { fixture, initial } from "../fixture";
const api = fixture();
const eq = {
  mode: 0,
  gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  frequencies: [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  raw: [],
};
api.control = async (_id, command) => {
  if (command.action === "read") return { ...initial, eq };
  if (new URLSearchParams(location.search).has("slow"))
    await new Promise((resolve) => setTimeout(resolve, 1200));
  if (command.action === "noise")
    return {
      noise: command.noise ?? { mode: command.mode ?? 2, scene: 0, gain: 0 },
      eq: null,
      errors: [],
    };
  if (command.action === "eq")
    return {
      noise: null,
      eq: { ...eq, gains: command.gains ?? eq.gains },
      errors: [],
    };
  return { ...initial, eq };
};
createRoot(document.getElementById("root")!).render(<App api={api} preview />);
