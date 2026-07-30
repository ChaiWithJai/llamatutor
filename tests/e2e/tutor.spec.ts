import { expect, test, type Page } from "@playwright/test";
import type {
  CoachDashboard,
  CoachingGoal,
  PracticeRep,
} from "../../utils/coaching";

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

async function mockSignedInCoach(
  page: Page,
  { repPrompt }: { repPrompt?: string } = {},
) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: "test-learner",
    email: "learner@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    app_metadata: { provider: "email" },
    user_metadata: {},
  })}.test-signature`;

  await page.context().addCookies([
    {
      name: "nf_jwt",
      value: token,
      url: "http://127.0.0.1:3211",
    },
  ]);
  await page.route("**/.netlify/identity/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-learner",
        email: "learner@example.com",
        confirmed_at: "2026-07-01T12:00:00.000Z",
        created_at: "2026-07-01T12:00:00.000Z",
        updated_at: "2026-07-30T12:00:00.000Z",
        app_metadata: { provider: "email", roles: [] },
        user_metadata: {},
      }),
    });
  });

  const goal: CoachingGoal = {
    id: "11111111-1111-4111-8111-111111111111",
    topic: "How does compound interest work?",
    level: "Middle School",
    status: "active",
    nextRepText: "Use compound interest in a new example.",
    createdAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
  };
  const firstRep: PracticeRep = {
    id: "22222222-2222-4222-8222-222222222222",
    goalId: goal.id,
    prompt: repPrompt ?? "Explain compound interest and give one example.",
    attempt: null,
    feedback: null,
    status: "pending",
    createdAt: "2026-07-29T12:00:00.000Z",
    completedAt: null,
  };
  const nextRep: PracticeRep = {
    ...firstRep,
    id: "33333333-3333-4333-8333-333333333333",
    prompt:
      "Apply How does compound interest work? to a new example. Explain what changed, what stayed the same, and one question you still have.",
  };
  let dashboard: CoachDashboard = {
    profile: {
      email: "learner@example.com",
      defaultLevel: "Middle School",
      streakCount: 3,
      lastCompletedOn: "2026-07-29",
    },
    goal,
    pendingRep: firstRep,
    recentReps: [],
    completedSessions: 3,
  };
  const actions: string[] = [];

  await page.route("**/api/coach**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(dashboard),
      });
      return;
    }

    const payload = request.postDataJSON() as { action?: string };
    actions.push(payload.action ?? "unknown");

    if (payload.action === "start_goal") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ goal }),
      });
      return;
    }

    if (payload.action === "ensure_rep") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rep: dashboard.pendingRep }),
      });
      return;
    }

    dashboard = {
      ...dashboard,
      profile: { ...dashboard.profile, streakCount: 4 },
      pendingRep: nextRep,
      recentReps: [
        {
          ...firstRep,
          attempt: "Interest earns more interest after each period.",
          feedback: "Clear explanation. Add the compounding frequency.",
          status: "completed",
          completedAt: "2026-07-30T12:00:00.000Z",
        },
      ],
      completedSessions: 4,
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        completed: true,
        streakCount: 4,
        lastCompletedOn: "2026-07-30",
        nextRep: nextRep.prompt,
      }),
    });
  });

  return actions;
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
  await expect(page.getByRole("link", { name: "New topic" })).toBeVisible();
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

test("image requests fail truthfully until vision is configured", async ({
  request,
}) => {
  const response = await request.post("/api/getChat", {
    data: {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Review this diagram." },
            {
              type: "image_url",
              image_url: { url: "https://example.com/diagram.jpg" },
            },
          ],
        },
      ],
    },
  });

  expect(response.status()).toBe(503);
  await expect(response.json()).resolves.toEqual({
    error:
      "Image tutoring is not configured yet. Send a text-only question for now.",
  });
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

  const affordance = await page
    .locator(".sources-scroll-wrap")
    .evaluate((element) => {
      const style = window.getComputedStyle(element, "::after");
      return { content: style.content, width: Number.parseFloat(style.width) };
    });
  expect(affordance.content).not.toBe("none");
  expect(affordance.width).toBeGreaterThan(0);
});

test("signed in learner completes a rep and resumes the saved next rep", async ({
  page,
}) => {
  await mockTutor(page, {
    answer: "Clear explanation. Add the compounding frequency.",
  });
  const coachActions = await mockSignedInCoach(page);
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Resume coaching" }),
  ).toBeVisible();
  await expect(page.getByText("3-day showing-up streak")).toBeVisible();
  await page.getByRole("button", { name: "Resume coaching" }).click();

  await expect(
    page.getByText("Explain compound interest and give one example."),
  ).toBeVisible();
  await page
    .getByLabel("Try it now")
    .fill("Interest earns more interest after each period.");
  await page
    .getByRole("button", { name: "Get feedback and save my next rep" })
    .click();

  await expect(page.getByText("Rep complete")).toBeVisible();
  await expect(page.getByText("4-day showing-up streak")).toBeVisible();
  await expect(
    page.getByText(/Apply How does compound interest work\? to a new example/),
  ).toBeVisible();
  const progressTrail = page.locator("details.progress-trail");
  await expect(progressTrail).toBeVisible();
  await expect(progressTrail).not.toHaveAttribute("open", "");
  await progressTrail.locator("summary").click();
  await expect(progressTrail).toHaveAttribute("open", "");
  await expect(progressTrail.getByText("feedback saved")).toBeVisible();
  await expect(
    progressTrail.getByText("Explain compound interest and give one example."),
  ).toBeVisible();
  const nextRepCard = await page.locator(".next-rep-card").boundingBox();
  const followUpComposer = await page
    .getByLabel("Ask a follow-up")
    .boundingBox();
  expect(nextRepCard).not.toBeNull();
  expect(followUpComposer).not.toBeNull();
  expect(
    (nextRepCard?.y ?? Infinity) + (nextRepCard?.height ?? 0),
  ).toBeLessThanOrEqual(followUpComposer?.y ?? 0);
  expect(coachActions).toEqual(["start_goal", "ensure_rep", "complete_rep"]);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume coaching" }),
  ).toBeVisible();
  await expect(page.getByText("4-day showing-up streak")).toBeVisible();
  await expect(
    page.getByText(/Apply How does compound interest work\? to a new example/),
  ).toBeVisible();
});

test("coach panel scroll cue appears only while content remains below", async ({
  page,
}) => {
  await mockTutor(page);
  await mockSignedInCoach(page, {
    repPrompt: Array.from(
      { length: 18 },
      () => "Explain one concrete step and the evidence that supports it.",
    ).join(" "),
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Resume coaching" }).click();

  const coachPanel = page.locator(".coach-panel");
  const scrollCue = coachPanel.locator(".coach-panel-scroll-cue");
  const metrics = await coachPanel.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await expect(scrollCue).toHaveAttribute("data-visible", "true");

  await coachPanel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(scrollCue).toHaveAttribute("data-visible", "false");
});

test("signed in learner confirms before abandoning a pending rep", async ({
  page,
}) => {
  await mockTutor(page);
  const coachActions = await mockSignedInCoach(page);
  await page.goto("/");

  await page
    .getByLabel("What do you want to understand?")
    .fill("Machine learning");
  await page.getByRole("button", { name: "Start learning" }).last().click();

  const dialog = page.getByRole("dialog", {
    name: "Start “Machine learning” instead?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("How does compound interest work?");
  await expect(dialog).toContainText(
    "Explain compound interest and give one example.",
  );
  expect(coachActions).toEqual([]);

  await dialog.getByRole("button", { name: "Finish this rep first" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume coaching" }),
  ).toBeVisible();
  expect(coachActions).toEqual([]);

  await page
    .getByLabel("What do you want to understand?")
    .fill("Machine learning");
  await page.getByRole("button", { name: "Start learning" }).last().click();
  await dialog
    .getByRole("button", { name: "Start “Machine learning”" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Machine learning" }),
  ).toBeVisible();
  await expect.poll(() => coachActions).toEqual(["start_goal", "ensure_rep"]);
});

test("keyboard learner can start and continue a lesson", async ({ page }) => {
  await mockTutor(page);
  await page.goto("/");

  const topicField = page.getByLabel("What do you want to understand?");
  await topicField.focus();
  await page.keyboard.type("How do neural networks learn?");

  const startButton = page
    .getByRole("button", { name: "Start learning" })
    .last();
  await startButton.focus();
  const focusStyle = await startButton.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("Enter");

  await expect(page.getByText("A named learning source")).toBeVisible();
  const followUp = page.getByLabel("Ask a follow-up");
  await followUp.focus();
  await page.keyboard.type("Give me one more example.");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Give me one more example.")).toBeVisible();
});

test("reduced motion removes nonessential animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const timing = await page.locator("body").evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      animationDuration: Number.parseFloat(style.animationDuration),
      transitionDuration: Number.parseFloat(style.transitionDuration),
    };
  });
  expect(timing.animationDuration).toBeLessThanOrEqual(0.001);
  expect(timing.transitionDuration).toBeLessThanOrEqual(0.001);
});
