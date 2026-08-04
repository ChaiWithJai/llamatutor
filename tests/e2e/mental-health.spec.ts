import { expect, test } from "@playwright/test";

test("visitor can inspect the deterministic urgent safety route", async ({
  page,
}) => {
  await page.goto("/mental-health");

  await expect(
    page.getByRole("heading", { name: "Put policy around the model." }),
  ).toBeVisible();
  await expect(
    page.getByText("Educational prototype—not therapy"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Try the demo" }).click();
  await page
    .getByRole("button", { name: /Immediate danger I may hurt myself tonight/ })
    .click();

  await expect(
    page.getByRole("heading", { name: "Reviewed resources" }),
  ).toBeVisible();
  await expect(
    page.getByText("call or text 988 now", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("No unchecked model text returned"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Build a voice receptionist with this pattern",
    }),
  ).toHaveCount(0);
});

test("live lab requires acknowledgement and preserves the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mental-health");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.getByRole("tab", { name: /Live Together lab/ }).click();

  const submit = page.getByRole("button", { name: "Run the live harness" });
  await page
    .getByRole("textbox", { name: "Message for the live harness" })
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
