import React, { StrictMode } from "react";
import {
  act,
  renderHook,
  waitFor,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { useDevice } from "../src/useDevice";
import { App } from "../src/App";
import { fixture, initial, deferred } from "./fixture";
import type { ControlState } from "../src/api";
it("cliques consecutivos não atravessam um comando pendente e permitem continuar após confirmação", async () => {
  const api = fixture(),
    gate = deferred<ControlState>();
  const send = vi.fn(api.control);
  api.control = send;
  const { result } = renderHook(() => useDevice(api));
  await waitFor(() => expect(result.current.status).toBe("Fone pronto"));
  send.mockImplementationOnce(() => gate.promise);
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.run({ action: "noise", mode: 2 });
    void result.current.run({ action: "eq", gains: [1, 0, 0, 0] });
    void result.current.refresh();
    void result.current.scan();
  });
  expect(result.current.pending).toBe("noise");
  expect(send).toHaveBeenCalledTimes(2);
  await act(async () => {
    gate.resolve({
      noise: { mode: 2, scene: 0, gain: 0 },
      eq: null,
      errors: [],
    });
    await pending;
  });
  expect(result.current.controls?.eq?.gains).toEqual([0, 0, 0, 0]);
  await act(async () => {
    await result.current.run({ action: "read" });
  });
  expect(send).toHaveBeenCalledTimes(3);
});
it("uma falha mantém o último estado confirmado e permite tentar de novo sem repetição escondida", async () => {
  const api = fixture();
  const send = vi.fn(api.control);
  api.control = send;
  const { result } = renderHook(() => useDevice(api));
  await waitFor(() => expect(result.current.controls?.noise?.gain).toBe(2));
  send.mockRejectedValueOnce(new Error("Sem resposta"));
  await act(async () => {
    await result.current.run({ action: "noise", mode: 2 });
  });
  expect(result.current.error).toContain("Sem resposta");
  expect(result.current.controls?.noise?.mode).toBe(1);
  expect(send).toHaveBeenCalledTimes(2);
  expect(result.current.pending).toBeNull();
  await act(async () => {
    await result.current.run({ action: "read" });
  });
  expect(result.current.error).toBe("");
});
it("inicia uma vez em StrictMode e não consulta Bluetooth periodicamente em repouso", async () => {
  const api = fixture();
  const scan = vi.fn(api.scan),
    send = vi.fn(api.control);
  api.scan = scan;
  api.control = send;
  const { result } = renderHook(() => useDevice(api), {
    wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
  });
  await waitFor(() => expect(result.current.status).toBe("Fone pronto"));
  vi.useFakeTimers();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600_000);
  });
  expect(scan).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(1);
});
it("editar o EQ, mudar ANC e voltar conserva o rascunho e oferece feedback enquanto aguarda", async () => {
  const api = fixture(),
    gate = deferred<ControlState>();
  const send = vi.fn(api.control);
  api.control = send;
  render(<App api={api} preview />);
  await screen.findByText("Fone pronto");
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Equalizador" }));
  fireEvent.change(screen.getByRole("slider", { name: "32 Hz, ganho em dB" }), {
    target: { value: "1.5" },
  });
  await user.click(screen.getByRole("tab", { name: "Ambiente" }));
  await user.click(screen.getByRole("button", { name: "Fraco" }));
  send.mockImplementationOnce(() => gate.promise);
  await user.click(screen.getByRole("button", { name: "Aplicar ambiente" }));
  expect(screen.getByRole("status").textContent).toContain(
    "Aplicando ambiente",
  );
  await user.click(screen.getByRole("tab", { name: "Equalizador" }));
  expect(
    (
      screen.getByRole("slider", {
        name: "32 Hz, ganho em dB",
      }) as HTMLInputElement
    ).value,
  ).toBe("1.5");
  expect(
    (
      screen.getByRole("button", {
        name: "Aplicar equalizador",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await act(async () =>
    gate.resolve({
      noise: { mode: 1, scene: 1, gain: 0 },
      eq: null,
      errors: [],
    }),
  );
  expect(
    (
      screen.getByRole("slider", {
        name: "32 Hz, ganho em dB",
      }) as HTMLInputElement
    ).value,
  ).toBe("1.5");
  expect(
    (
      screen.getByRole("button", {
        name: "Aplicar equalizador",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
it("navegação por teclado muda a aba e o foco", async () => {
  render(<App api={fixture()} preview />);
  await screen.findByText("Fone pronto");
  const tab = screen.getByRole("tab", { name: "Ambiente" });
  tab.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Equalizador" }),
  );
  expect(document.activeElement?.getAttribute("aria-selected")).toBe("true");
});
