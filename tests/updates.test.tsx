import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { Updates } from "../src/Updates";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const status = {
  phase: "idle",
  message: "Pronto",
  log: [],
  version: "0.2.0",
  local: true,
};
it("atualização em andamento bloqueia nova solicitação e oferece reiniciar somente quando pronta", async () => {
  const native = vi.mocked(invoke);
  native.mockResolvedValue(status);
  render(<Updates onClose={() => {}} />);
  const start = await screen.findByRole("button", { name: "Atualizar agora" });
  native.mockResolvedValue({
    ...status,
    phase: "building",
    message: "Verificando testes",
  });
  fireEvent.click(start);
  await screen.findByText("Verificando testes");
  expect(
    (screen.getByRole("button", { name: "Atualizando…" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Reiniciar e usar atualização" }),
  ).toBeNull();
});
it("fecha a consulta periódica ao sair do diálogo e apresenta falhas", async () => {
  vi.useFakeTimers();
  const native = vi.mocked(invoke);
  native.mockResolvedValue({
    ...status,
    phase: "error",
    message: "Teste reprovado",
  });
  const { unmount } = render(<Updates onClose={() => {}} />);
  await act(async () => {});
  expect(screen.getByText("Teste reprovado")).toBeTruthy();
  unmount();
  const calls = native.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(native.mock.calls.length).toBe(calls);
});
it("não consulta continuamente quando nenhuma atualização está em andamento", async () => {
  vi.useFakeTimers();
  const native = vi.mocked(invoke);
  native.mockResolvedValue(status);
  const { unmount } = render(<Updates onClose={() => {}} />);
  await act(async () => {});
  const calls = native.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(native.mock.calls.length).toBe(calls);
  unmount();
});
