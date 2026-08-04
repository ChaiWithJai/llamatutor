import { expect, test } from "@playwright/test";

test("voice demo leads with a useful booking call", async ({ page }) => {
  await page.goto("/mental-health");

  await expect(
    page.getByRole("heading", {
      name: "Hear it handle the call. Then interrupt it.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start demo call" }).click();

  await expect(page.getByText("Appointment options ready")).toBeVisible();
  await expect(page.getByText("Tue 2:30")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Build this for my team" }),
  ).toBeVisible();
});

test("urgent call stops the commercial flow and reveals reviewed evidence", async ({
  page,
}) => {
  await page.goto("/mental-health");
  await page
    .getByRole("button", { name: /Immediate danger Stop the normal flow/ })
    .click();
  await page.getByRole("button", { name: "Start demo call" }).click();

  await expect(page.getByText("Normal flow stopped")).toBeVisible();
  await expect(
    page.getByText("call or text 988 now", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Build this for my team" }),
  ).toHaveCount(0);

  await page
    .getByText("What happens when a caller says something risky?")
    .click();
  await expect(
    page.getByText("No unchecked model text returned"),
  ).toBeVisible();
});

test("barge-in stops browser audio and exposes a clear recovery state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class DemoUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: DemoUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel() {}, speak() {} },
    });
  });
  await page.goto("/mental-health");
  await page.getByRole("button", { name: "Start demo call" }).click();
  await page.getByRole("button", { name: "Interrupt voice" }).click();

  await expect(page.getByText("Audio stopped—queue cleared")).toBeVisible();
  await expect(page.getByText("clear Twilio’s queued audio")).toBeVisible();
});

test("live guardrail stays disclosed and the mobile viewport does not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mental-health");
  await page.getByText("Inspect the live Together guardrail").click();

  const submit = page.getByRole("button", { name: "Run live check" });
  await page
    .getByRole("textbox", { name: "Transient test message" })
    .fill("I have too many deadlines and want one smaller next step.");
  await expect(submit).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I understand this is an engineering demo/ })
    .check();
  await expect(submit).toBeEnabled();

  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBe(widths.client);
});
