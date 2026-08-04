import { expect, test, type Page } from "@playwright/test";

type AudioOptions = { autoEnd?: boolean; fail?: boolean };

async function installDemoAudio(page: Page, options: AudioOptions = {}) {
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

/**
 * Puts a person in the caller seat without a real microphone: getUserMedia and
 * MediaRecorder are replaced, and transcription is served by the test.
 */
async function installLiveCaller(
  page: Page,
  options: { permission?: "granted" | "denied"; transcript?: string } = {},
) {
  const permission = options.permission ?? "granted";

  await page.route("**/api/mental-health/transcribe", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: [
          {
            eventId: "live-final-0",
            sequence: 0,
            kind: "final",
            text: options.transcript ?? "I would like a first appointment.",
          },
        ],
      }),
    });
  });

  await page.route("**/api/mental-health/respond", async (route) => {
    const body = route.request().postDataJSON() as { mode?: string };
    if (body?.mode !== "caller") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assessment: {
          policyVersion: "demo-2026-08-04",
          route: "routine",
          confidence: 0.98,
          abstain: false,
          signals: ["ordinary scheduling request"],
        },
        route: "routine",
        reply:
          "Happy to help. For this demonstration I can offer Tuesday at two thirty. Nothing is booked or saved.",
        provider: "together",
        trace: [
          { id: "input", label: "Input check", detail: "Schema valid", status: "passed", durationMs: 11 },
          { id: "route", label: "Application route", detail: "routine policy selected", status: "routed", durationMs: 1 },
          { id: "response", label: "Response policy", detail: "Bounded candidate buffered", status: "reviewed", durationMs: 6 },
          { id: "output", label: "Output check", detail: "Approved before reveal", status: "passed", durationMs: 9 },
        ],
        speechGrant: {
          text: "Happy to help.",
          speaker: "receptionist",
          expiresAt: Date.now() + 60_000,
          signature: "test-signature",
        },
      }),
    });
  });

  await page.addInitScript((granted) => {
    class DemoRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        this.state = "recording";
      }

      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["clip"]) });
        this.onstop?.();
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: DemoRecorder,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          granted
            ? Promise.resolve({ getTracks: () => [{ stop() {} }] })
            : Promise.reject(new Error("NotAllowedError")),
      },
    });
  }, permission === "granted");
}

async function speakOneLiveTurn(page: Page) {
  const talk = page.getByRole("button", { name: "Hold to talk" });
  await expect(talk).toBeEnabled();
  await talk.click();
}

/* ------------------------------------------------------- simulated caller */

test("simulation plays a complete alternating call from greeting to goodbye", async ({
  page,
}) => {
  await installDemoAudio(page);
  await page.goto("/mental-health");

  await expect(page.locator("article[data-speaker]")).toHaveCount(0);
  await expect(page.getByText("Ready when you are")).toBeVisible();
  await page.getByRole("button", { name: "Run a simulation" }).click();

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
  await page.getByRole("button", { name: "Run a simulation" }).click();
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
  await page.getByRole("button", { name: "Run a simulation" }).click();

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
  await page.getByRole("button", { name: "Run a simulation" }).click();

  await expect(
    page.getByText("Natural audio is unavailable", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Call complete", { exact: true })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.locator("article[data-speaker]")).toHaveCount(9);
});

/* ------------------------------------------------------- sampled edge cases */

test("the sampled edge case is reproducible and can be replaced", async ({
  page,
}) => {
  await installDemoAudio(page);
  await page.goto("/mental-health");

  const sampledCard = page.locator("button[data-sampled='true']");
  const firstLabel = await sampledCard.locator("strong").innerText();

  await page.reload();
  await expect(page.locator("button[data-sampled='true'] strong")).toHaveText(
    firstLabel,
  );

  await page.getByRole("button", { name: "Sample another" }).click();
  await expect(
    page.locator("button[data-sampled='true'] strong"),
  ).not.toHaveText(firstLabel);
});

test("a sampled case runs as a complete two-player call", async ({ page }) => {
  await installDemoAudio(page);
  await page.goto("/mental-health");

  await page.locator("button[data-sampled='true']").click();
  await page.getByRole("button", { name: "Run a simulation" }).click();

  await expect(page.getByText("Call complete", { exact: true })).toBeVisible({
    timeout: 25_000,
  });
  const turns = page.locator("article[data-speaker]");
  expect(await turns.count()).toBeGreaterThanOrEqual(4);
  await expect(turns.first()).toHaveAttribute("data-speaker", "receptionist");
  await expect(
    page.getByRole("button", { name: "Replay this case" }),
  ).toBeVisible();
});

/* ------------------------------------------------------------- live caller */

test("a live participant completes a turn through the reviewed boundary", async ({
  page,
}) => {
  await installDemoAudio(page, { autoEnd: true });
  await installLiveCaller(page);
  await page.goto("/mental-health");

  await expect(page.getByText("Caller seat", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Join as caller" }).click();

  await expect(
    page.getByText("Thanks for calling Dharmic Care", { exact: false }),
  ).toBeVisible();
  await speakOneLiveTurn(page);

  await expect(
    page.getByText("I would like a first appointment.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Nothing is booked or saved.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Caller · speech-to-text")).toBeVisible();
  await expect(page.getByRole("button", { name: "End call" })).toBeVisible();
});

test("declined microphone permission offers typed input without restarting", async ({
  page,
}) => {
  await installDemoAudio(page, { autoEnd: true });
  await installLiveCaller(page, { permission: "denied" });
  await page.goto("/mental-health");

  await page.getByRole("button", { name: "Join as caller" }).click();
  await expect(
    page.getByText("Microphone access was declined", { exact: false }),
  ).toBeVisible();

  // The greeting still played, so the call was never restarted.
  await expect(
    page.getByText("Thanks for calling Dharmic Care", { exact: false }),
  ).toBeVisible();

  const field = page.getByRole("textbox", { name: "Type this turn" });
  await expect(field).toBeVisible();
  await field.fill("I need an appointment next week.");
  await page.getByRole("button", { name: "Send turn" }).click();

  await expect(
    page.getByText("I need an appointment next week.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Caller · typed")).toBeVisible();
});

test("a live call can continue as a simulation without losing turns", async ({
  page,
}) => {
  await installDemoAudio(page, { autoEnd: true });
  await installLiveCaller(page, { permission: "denied" });
  await page.goto("/mental-health");

  await page.getByRole("button", { name: "Join as caller" }).click();
  await expect(
    page.getByText("Thanks for calling Dharmic Care", { exact: false }),
  ).toBeVisible();
  const before = await page.locator("article[data-speaker]").count();
  expect(before).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Continue as simulation" }).click();
  await expect(
    page.getByText("Completed turns are preserved", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Call complete", { exact: true })).toBeVisible({
    timeout: 25_000,
  });
  expect(await page.locator("article[data-speaker]").count()).toBeGreaterThan(
    before,
  );
});

test("ending a live call cancels pending work and stops stale audio", async ({
  page,
}) => {
  await installDemoAudio(page, { autoEnd: true });
  await installLiveCaller(page);
  await page.goto("/mental-health");

  await page.getByRole("button", { name: "Join as caller" }).click();
  await expect(
    page.getByText("Thanks for calling Dharmic Care", { exact: false }),
  ).toBeVisible();

  const settled = await page.locator("article[data-speaker]").count();
  await page.getByRole("button", { name: "End call" }).click();
  await expect(page.getByRole("button", { name: "Replay call" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hold to talk" }),
  ).toHaveCount(0);

  // Nothing may arrive after the call ended.
  await page.waitForTimeout(600);
  expect(await page.locator("article[data-speaker]").count()).toBe(settled);
  const pauseCount = await page.evaluate(
    () => (window as typeof window & { __pauseCount?: number }).__pauseCount,
  );
  expect(pauseCount).toBeGreaterThanOrEqual(1);
});

/* ----------------------------------------------------------------- layout */

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

    for (const name of ["Join as caller", "Run a simulation"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
});

test("build details open as overlays without pushing the call off screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1353, height: 921 });
  await page.goto("/mental-health");

  const before = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  await page.locator("summary").filter({ hasText: "How we built this" }).click();
  await expect(page.getByText("The model proposes. Policy routes.")).toBeVisible();
  const after = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  expect(after).toBe(before);

  // Only one panel is open at a time.
  await page.locator("summary").filter({ hasText: "FAQ" }).click();
  await expect(
    page.getByText("The model proposes. Policy routes."),
  ).toBeHidden();
});

test("reduced motion keeps active turns legible without animation", async ({
  page,
}) => {
  await installDemoAudio(page, { autoEnd: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/mental-health");
  await page.getByRole("button", { name: "Run a simulation" }).click();
  const firstTurn = page
    .locator("article[data-speaker='receptionist']")
    .first();
  await expect(firstTurn).toBeVisible();
  const animationName = await firstTurn.evaluate(
    (element) => getComputedStyle(element).animationName,
  );
  expect(animationName).toBe("none");
});
