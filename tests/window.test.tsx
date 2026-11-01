import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WindowSettings, type WindowApi } from "../src/WindowSettings";
it("permite escolher e salvar continuar na bandeja ao fechar", async () => {
  const api: WindowApi = {
    preferences: async () => ({ close_action: "ask" }),
    save: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    onClose: async () => () => {},
  };
  render(<WindowSettings api={api} />);
  const select = await screen.findByLabelText("Ao fechar a janela");
  await userEvent.selectOptions(select, "tray");
  await waitFor(() => expect(api.save).toHaveBeenCalledWith("tray"));
  expect(screen.getByRole("status").textContent).toContain("Preferência salva");
});
it("ao fechar oferece as duas opções e só lembra quando solicitado", async () => {
  let close = () => {};
  const api: WindowApi = {
    preferences: async () => ({ close_action: "ask" }),
    save: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    onClose: async (callback) => {
      close = callback;
      return () => {};
    },
  };
  render(<WindowSettings api={api} />);
  await screen.findByLabelText("Ao fechar a janela");
  const { act } = await import("@testing-library/react");
  act(() => close());
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Lembrar minha escolha"));
  await user.click(
    screen.getByRole("button", { name: "Continuar na bandeja" }),
  );
  expect(api.finish).toHaveBeenCalledWith("tray", true);
});
it("erro ao salvar fica visível e conserva a preferência anterior", async () => {
  const api: WindowApi = {
    preferences: async () => ({ close_action: "ask" }),
    save: vi.fn(async () => {
      throw Error("Disco indisponível");
    }),
    finish: vi.fn(async () => {}),
    onClose: async () => () => {},
  };
  render(<WindowSettings api={api} />);
  const select = await screen.findByLabelText("Ao fechar a janela");
  await userEvent.selectOptions(select, "exit");
  await screen.findByText(/Disco indisponível/);
  expect((select as HTMLSelectElement).value).toBe("ask");
});
