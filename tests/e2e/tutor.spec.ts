import { expect, test, type Page } from "@playwright/test";

async function mockTutor(
  page: Page,
  {
    sourcesFail = false,
    answer = "A neural network learns by adjusting small numeric weights.",
  }: { sourcesFail?: boolean; answer?: string } = {},
) {
  await page.route("**/api/getSources", async (route) => {
    if (sourcesFail) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "Source lookup failed." }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "A named learning source",
          url: "https://example.com/source",
          content: "Grounded source content",
        },
        ...Array.from({ length: 8 }, (_, index) => ({
          name: `Source ${index + 2}`,
          url: `https://example.com/source-${index + 2}`,
          content: "More grounded source content",
        })),
      ]),
    });
  });

  await page.route("**/api/getChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ text: answer })}\n\ndata: ${JSON.stringify({ text: "" })}\n\n`,
    });
  });
}

test("public learner completes the sourced lesson journey", async ({
  page,
}) => {
  await mockTutor(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Learn Something Useful. See Where It Comes From.",
    }),
  ).toBeVisible();
  await page
    .getByLabel("What do you want to understand?")
    .fill("How do neural networks learn?");
  await page.getByRole("button", { name: "Start learning" }).last().click();

  await expect(page.getByText("A named learning source")).toBeVisible();
  await expect(
    page.getByText(
      "A neural network learns by adjusting small numeric weights.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to start coaching" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "New topic" }).first(),
  ).toBeVisible();
});

test("source failure continues honestly and offers retry", async ({ page }) => {
  await mockTutor(page, { sourcesFail: true });
  await page.goto("/");
  await page
    .getByLabel("What do you want to understand?")
    .fill("Why is the sky blue?");
  await page.getByRole("button", { name: "Start learning" }).last().click();

  await expect(page.getByText("Unverified session")).toBeVisible();
  await expect(page.getByText(/Sources are unavailable/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry sources" }).first(),
  ).toBeVisible();
});

test("long sessions keep the composer reachable", async ({ page }) => {
  const longAnswer = Array.from(
    { length: 80 },
    (_, index) => `Paragraph ${index + 1}: useful explanation.`,
  ).join("\n\n");
  await mockTutor(page, { answer: longAnswer });
  await page.goto("/");
  await page.getByLabel("What do you want to understand?").fill("A long topic");
  await page.getByRole("button", { name: "Start learning" }).last().click();
  await expect(page.getByLabel("Ask a follow-up")).toBeVisible();

  const composer = await page.getByLabel("Ask a follow-up").boundingBox();
  const viewport = page.viewportSize();
  expect(composer).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(
    (composer?.y ?? Infinity) + (composer?.height ?? 0),
  ).toBeLessThanOrEqual(viewport?.height ?? 0);
});

test("narrow source strip exposes horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTutor(page);
  await page.goto("/");
  await page
    .getByLabel("What do you want to understand?")
    .fill("Mobile learning");
  await page.getByRole("button", { name: "Start learning" }).last().click();
  await expect(page.getByText("A named learning source")).toBeVisible();

  const overflow = await page.locator(".sources-list").evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
});
