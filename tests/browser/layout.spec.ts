import { test, expect } from "@playwright/test";
for (const width of [390, 640, 768, 1000, 1440]) {
  test(`layout utilizável e sem blocos sobrepostos em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/tests/browser/");
    await expect(page.getByText("Fone pronto")).toBeVisible();
    for (const tab of ["Ambiente", "Equalizador"]) {
      await page.getByRole("tab", { name: tab }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const names = [
        ".device-header",
        ".operation-status",
        ".battery-strip",
        ".sound-console",
      ];
      const boxes = await page.locator(names.join(",")).evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        }),
      );
      for (let i = 1; i < boxes.length; i++)
        expect(boxes[i].top - boxes[i - 1].bottom).toBeGreaterThanOrEqual(8);
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width + 1);
      }
    }
    const axisLabel = await page.locator('.eq-chart text').first().boundingBox();
    expect(axisLabel?.height).toBeGreaterThanOrEqual(9);
    const slider = page.getByRole("slider", { name: "32 Hz, ganho em dB" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue("0.5");
    await expect(
      page.getByRole("button", { name: "Aplicar equalizador" }),
    ).toBeEnabled();
    await page.screenshot({
      path: `test-results/layout-${width}.png`,
      fullPage: true,
    });
  });
}
test("animações respeitam a preferência de movimento reduzido", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/browser/");
  await expect(page.getByText("Fone pronto")).toBeVisible();
  const durations = await page
    .getByRole("button", { name: "Normal Só a música" })
    .evaluate((el) => ({
      transition: getComputedStyle(el).transitionDuration,
      animation: getComputedStyle(el).animationDuration,
    }));
  expect(parseFloat(durations.transition)).toBeLessThanOrEqual(0.001);
  expect(parseFloat(durations.animation)).toBeLessThanOrEqual(0.001);
});
test("feedback, curva em edição e animações acompanham os estados reais", async ({
  page,
}) => {
  await page.goto("/tests/browser/?slow");
  await expect(page.getByText("Fone pronto")).toBeVisible();
  await page.getByRole("tab", { name: "Equalizador" }).click();
  const slider = page.getByRole("slider", { name: "32 Hz, ganho em dB" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Em edição", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Ganhos do equalizador por frequência" }),
  ).toContainText("32 Hz: +0,5 dB; confirmado: 0 dB");
  await page.getByRole("tab", { name: "Ambiente" }).click();
  await page.getByRole("button", { name: "Fraco", exact: true }).click();
  await page
    .getByRole("button", { name: "Aplicar ambiente", exact: true })
    .click();
  const progress = page.getByRole("progressbar", {
    name: "Aguardando resposta do fone",
  });
  await expect(progress).toBeVisible();
  await expect(
    page.getByRole("meter", { name: "Intensidade confirmada de ANC" }),
  ).toHaveAttribute("aria-valuetext", "Forte");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(progress.locator("span")).toHaveCSS("animation-name", "none");
  await page.getByRole("tab", { name: "Equalizador" }).click();
  await expect(slider).toHaveValue("0.5");
  await expect(progress).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aplicar equalizador" }),
  ).toBeEnabled();
  await expect(page.locator(".tab-indicator")).toHaveCSS(
    "transition-duration",
    "0s",
  );
});
