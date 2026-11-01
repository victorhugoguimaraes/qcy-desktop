import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(() => {
  cleanup();
  if (typeof localStorage !== "undefined") localStorage.clear();
  vi.useRealTimers();
});
if (typeof HTMLDialogElement !== "undefined")
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
