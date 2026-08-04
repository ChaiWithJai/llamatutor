import { expect, test, type Page } from "@playwright/test";

async function installDemoAudio(
  page: Page,
  options: { autoEnd?: boolean; fail?: boolean } = {},
) {
  await page.route("**/api/mental-health/speech**", async (route) => {
    await route.fulfill({
      status: options.fail ? 502 : 200,
      contentType: options.fail ? "application/json" : "audio/mpeg",
      body: options.fail
        ? JSON.stringify({ error: "audio unavailable" })
        : "ID3",
    });
  });
  await page.addInitScript(
    ({ autoEnd, fail }) => {
      class DemoAudio {
        src = "";
        preload = "";
        paused = true;
        onplaying: (() => void) | null = null;
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;

        play() {
          this.paused = false;
          window.setTimeout(() => {
            if (fail) {
              this.onerror?.();
              return;
            }
            this.onplaying?.();
            if (autoEnd) window.setTimeout(() => this.onended?.(), 18);
          }, 0);
          return Promise.resolve();
        }

        pause() {
          this.paused = true;
          const testWindow = window as typeof window & {
            __pauseCount?: number;
          };
          testWindow.__pauseCount = (testWindow.__pauseCount ?? 0) + 1;
        }

        removeAttribute() {
          this.src = "";
        }

        load() {}
      }

      Object.defineProperty(window, "Audio", {
        configurable: true,
        value: DemoAudio,
      });
    },
    { autoEnd: options.autoEnd ?? true, fail: options.fail ?? false },
  );
}

test("routine demo plays a complete alternating call from greeting to goodbye", async ({
  page,
}) => {
  await installDemoAudio(page);
  await page.goto("/mental-health");

  await expect(page.locator("article[data-speaker]")).toHaveCount(0);
  await expect(page.getByText("Ready when you are")).toBeVisible();
  await page.getByRole("button", { name: "Start the call" }).click();

  await expect(
    page.getByText("Thanks for calling Dharmic Care", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Call complete", { exact: true })).toBeVisible();

  const turns = page.locator("article[data-speaker]");
  await expect(turns).toHaveCount(9);
  await expect(turns.first()).toContainText("How can I help today?");
  await expect(turns.last()).toContainText("Take care");
  const speakers = await turns.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-speaker")),
  );
  expect(speakers).toEqual([
    "receptionist",
    "caller",
    "receptionist",
    "caller",
    "receptionist",
    "caller",
    "receptionist",
    "caller",
    "receptionist",
  ]);
  await expect(
    page.getByText("The conversation reached a clear close", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay call" })).toBeVisible();
});

test("pause, resume, and end preserve control without stale playback", async ({
  page,
}) => {
  await installDemoAudio(page, { autoEnd: false });
  await page.goto("/mental-health");
  await page.getByRole("button", { name: "Start the call" }).click();
  await expect(
    page.getByText("Thanks for calling Dharmic Care", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "End call" }).click();
  await expect(page.getByRole("button", { name: "Replay call" })).toBeVisible();
  const pauseCount = await page.evaluate(
    () => (window as typeof window & { __pauseCount?: number }).__pauseCount,
  );
  expect(pauseCount).toBeGreaterThanOrEqual(2);
});

test("urgent call completes with reviewed resources and no commercial CTA", async ({
  page,
}) => {
  await installDemoAudio(page);
  await page.goto("/mental-health");
  await page
    .getByRole("button", { name: /Immediate danger Stop the normal flow/ })
    .click();
  await page.getByRole("button", { name: "Start the call" }).click();

  await expect(page.getByText("Call complete", { exact: true })).toBeVisible();
  await expect(
    page.getByText("call or text nine eight eight now", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Build this for your line" }),
  ).toHaveCount(0);
});

test("audio failure completes quietly as an owned visual transcript", async ({
  page,
}) => {
  await installDemoAudio(page, { fail: true });
  await page.goto("/mental-health");
  await page.getByRole("button", { name: "Start the call" }).click();

  await expect(
    page.getByText("Natural audio is unavailable", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Call complete", { exact: true })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.locator("article[data-speaker]")).toHaveCount(9);
});

test("reference layout reflows without overflow at governed widths", async ({
  page,
}) => {
  for (const width of [390, 830, 1353]) {
    await page.setViewportSize({ width, height: 921 });
    await page.goto("/mental-health");
    await expect(
      page.getByRole("heading", { name: "Choose a caller" }),
    ).toBeVisible();
    await expect(page.getByText("Ready when you are")).toBeVisible();
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll).toBe(widths.client);
  }
});

test("reduced motion keeps active turns legible without animation", async ({
  page,
}) => {
  await installDemoAudio(page, { autoEnd: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/mental-health");
  await page.getByRole("button", { name: "Start the call" }).click();
  const firstTurn = page
    .locator("article[data-speaker='receptionist']")
    .first();
  await expect(firstTurn).toBeVisible();
  const animationName = await firstTurn.evaluate(
    (element) => getComputedStyle(element).animationName,
  );
  expect(animationName).toBe("none");
});
