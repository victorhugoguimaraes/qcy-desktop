import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect } from "vitest";
import { BatteryStrip } from "../src/BatteryStrip";
import { Controls } from "../src/Controls";
import { initial } from "./fixture";
it("bateria distingue carga baixa, carregamento e valor zero sem inventar uma leitura", () => {
  render(
    <BatteryStrip
      battery={{ left: 15, right: 90, case: 0, charging: [false, true, false] }}
      loading={false}
    />,
  );
  expect(
    screen
      .getByRole("meter", { name: "Bateria do esquerdo" })
      .getAttribute("aria-valuenow"),
  ).toBe("15");
  expect(screen.getByText("Bateria baixa")).toBeTruthy();
  expect(screen.getByText("Carregando")).toBeTruthy();
  expect(screen.queryByRole("meter", { name: "Bateria da caixa" })).toBeNull();
  expect(screen.getByText("0% ou sem leitura")).toBeTruthy();
});
it("gráfico do EQ separa edição da leitura confirmada e acompanha o foco e o desfazer", async () => {
  render(
    <Controls
      state={initial}
      pending={null}
      presets={[]}
      run={async () => {}}
    />,
  );
  await userEvent.click(screen.getByRole("tab", { name: "Equalizador" }));
  const slider = screen.getByRole("slider", { name: "32 Hz, ganho em dB" });
  fireEvent.focus(slider);
  fireEvent.change(slider, { target: { value: "2" } });
  expect(
    screen.getByRole("img", { name: "Ganhos do equalizador por frequência" })
      .textContent,
  ).toContain("32 Hz: +2 dB; confirmado: 0 dB");
  expect(screen.getByText("Em edição")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
  expect(screen.queryByText("Em edição")).toBeNull();
  expect((slider as HTMLInputElement).value).toBe("0");
});
