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
  {
    completeRepFails = false,
    completeRepDelayMs = 0,
    repPrompt,
  }: {
    completeRepFails?: boolean;
    completeRepDelayMs?: number;
    repPrompt?: string;
  } = {},
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

    if (completeRepDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, completeRepDelayMs));
    }
    if (completeRepFails) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Could not save coaching progress." }),
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
      name: "What do you want to understand?",
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

test("landing keeps the complete starting loop in the first laptop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1353, height: 534 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "What do you want to understand?",
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("What do you want to understand?"),
  ).toBeVisible();
  await expect(
    page.getByText("Sources you can inspect · practice you can keep"),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Ask anything. Get a clear explanation grounded in named sources, then try one useful practice rep.",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Ways to begin" }),
  ).toBeVisible();
  await expect(page.locator(".learning-sequence")).toBeVisible();

  const sequence = await page.locator(".learning-sequence").boundingBox();
  const viewport = page.viewportSize();
  expect(sequence).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(
    (sequence?.y ?? Infinity) + (sequence?.height ?? 0),
  ).toBeLessThanOrEqual(viewport?.height ?? 0);

  const pageWidth = await page.locator("html").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth);
});

test("learning-path suggestions disclose intent and fill a useful question", async ({
  page,
}) => {
  await page.goto("/");

  const suggestions = page.getByRole("group", { name: "Ways to begin" });
  await expect(suggestions.getByText("Build intuition")).toBeVisible();
  await suggestions.getByRole("button", { name: /Machine Learning/ }).click();
  await expect(page.getByLabel("What do you want to understand?")).toHaveValue(
    "How does a neural network learn from examples?",
  );

  await expect(page.locator(".learning-sequence ol > li")).toHaveCount(4);
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

test("compact tier keeps auth and lesson controls two-up", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await mockTutor(page);
  await page.goto("/");

  const topicField = page.getByLabel("What do you want to understand?");
  const levelSelect = page.getByLabel("Learning level");
  const topicBox = await topicField.boundingBox();
  const levelBox = await levelSelect.boundingBox();
  expect(topicBox).not.toBeNull();
  expect(levelBox).not.toBeNull();
  expect(Math.abs((topicBox?.y ?? 0) - (levelBox?.y ?? 1))).toBeLessThanOrEqual(
    1,
  );

  await page.getByRole("button", { name: "Sign in" }).click();
  const authDialog = page.getByRole("dialog", { name: "Welcome back" });
  const authColumns = await authDialog
    .locator(".auth-switches")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(authColumns.split(" ")).toHaveLength(2);
  await authDialog
    .getByRole("button", { name: "Close account dialog" })
    .click();

  await page.setViewportSize({ width: 430, height: 800 });
  const phoneTopicBox = await topicField.boundingBox();
  const phoneLevelBox = await levelSelect.boundingBox();
  expect(phoneTopicBox).not.toBeNull();
  expect(phoneLevelBox).not.toBeNull();
  expect(phoneLevelBox?.y ?? 0).toBeGreaterThan(phoneTopicBox?.y ?? Infinity);

  await page.getByRole("button", { name: "Sign in" }).click();
  const phoneAuthColumns = await authDialog
    .locator(".auth-switches")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(phoneAuthColumns.split(" ")).toHaveLength(1);
  await authDialog
    .getByRole("button", { name: "Close account dialog" })
    .click();

  await page.setViewportSize({ width: 600, height: 800 });
  await topicField.fill("How does photosynthesis work?");
  await page.getByRole("button", { name: "Start learning" }).last().click();
  const sourceListStyle = await page
    .locator(".sources-list")
    .evaluate((element) => ({
      flexDirection: getComputedStyle(element).flexDirection,
      overflowY: getComputedStyle(element).overflowY,
    }));
  expect(sourceListStyle.flexDirection).toBe("column");
  expect(sourceListStyle.overflowY).toBe("auto");
});

test("compact goal-switch actions remain side by side", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await mockTutor(page);
  await mockSignedInCoach(page);
  await page.goto("/");

  await page
    .getByLabel("What do you want to understand?")
    .fill("Machine learning");
  await page.getByRole("button", { name: "Start learning" }).last().click();

  const dialog = page.getByRole("dialog", {
    name: "Two minutes and it counts",
  });
  const actionColumns = await dialog
    .locator(".goal-switch-actions")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(actionColumns.split(" ")).toHaveLength(2);
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
  const trailDot = await progressTrail
    .locator(".progress-trail-dot")
    .boundingBox();
  const trailPrompt = await progressTrail
    .locator(".progress-trail-prompt")
    .boundingBox();
  expect(trailDot).not.toBeNull();
  expect(trailPrompt).not.toBeNull();
  expect(
    (trailDot?.x ?? Infinity) + (trailDot?.width ?? 0),
  ).toBeLessThanOrEqual(trailPrompt?.x ?? 0);
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

test("signed in learner finishes the pending rep from the goal-switch dialog", async ({
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
    name: "Two minutes and it counts",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("How does compound interest work?");
  await expect(dialog).toContainText(
    "Explain compound interest and give one example.",
  );
  await expect(dialog).toContainText("Machine learning");
  expect(coachActions).toEqual([]);

  await dialog
    .getByLabel("Try it now")
    .fill("Interest earns more interest after each period.");
  await dialog
    .getByRole("button", { name: "Save this rep, then switch" })
    .click();

  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Machine learning" }),
  ).toBeVisible();
  await expect
    .poll(() => coachActions)
    .toEqual(["complete_rep", "start_goal", "ensure_rep"]);
});

test("goal-switch dialog preserves a failed attempt and cannot close while saving", async ({
  page,
}) => {
  await mockTutor(page);
  const coachActions = await mockSignedInCoach(page, {
    completeRepFails: true,
    completeRepDelayMs: 300,
  });
  await page.goto("/");

  await page
    .getByLabel("What do you want to understand?")
    .fill("Machine learning");
  await page.getByRole("button", { name: "Start learning" }).last().click();

  const dialog = page.getByRole("dialog", {
    name: "Two minutes and it counts",
  });
  const attempt = dialog.getByLabel("Try it now");
  await attempt.fill("Keep this exact attempt available for retry.");
  await dialog
    .getByRole("button", { name: "Save this rep, then switch" })
    .click();
  await expect(dialog.getByRole("button", { name: "Saving…" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(attempt).toHaveValue(
    "Keep this exact attempt available for retry.",
  );
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your attempt is still here, but it was not saved. Please retry.",
  );
  await expect(attempt).toHaveValue(
    "Keep this exact attempt available for retry.",
  );
  expect(coachActions).toEqual(["complete_rep"]);
});

test("signed in learner can archive and switch without finishing", async ({
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
    name: "Two minutes and it counts",
  });
  await expect(dialog).toBeVisible();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const actionColumns = await dialog
    .locator(".goal-switch-actions")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(actionColumns.split(" ")).toHaveLength(viewportWidth <= 430 ? 1 : 2);

  await dialog.getByRole("button", { name: /^Keep .* open$/ }).click();
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
    .getByRole("button", { name: "Archive and switch anyway" })
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

test("keyboard-only learner completes the Option B coaching loop", async ({
  page,
}) => {
  await mockTutor(page, {
    answer: "Focused feedback with one concrete next step.",
  });
  const coachActions = await mockSignedInCoach(page);
  await page.goto("/");

  const topicField = page.getByLabel("What do you want to understand?");
  await topicField.focus();
  await page.keyboard.type("How does compound interest work?");

  const startButton = page
    .getByRole("button", { name: "Start learning" })
    .last();
  await startButton.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("A named learning source")).toBeVisible();
  const practiceAttempt = page.getByLabel("Try it now");
  await practiceAttempt.focus();
  await page.keyboard.type(
    "Interest earns additional interest after each compounding period.",
  );

  const saveButton = page.getByRole("button", {
    name: "Get feedback and save my next rep",
  });
  await saveButton.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Rep complete")).toBeVisible();
  await expect(page.getByText("4-day showing-up streak")).toBeVisible();
  await expect(
    page.getByText(/Apply How does compound interest work\? to a new example/),
  ).toBeVisible();
  expect(coachActions).toEqual(["start_goal", "ensure_rep", "complete_rep"]);
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

test("a multi-section answer renders as a bounded card carousel, not one long scroll", async ({
  page,
}) => {
  const answer = [
    "## The Game",
    "Five a side, one hoop each way. Score by putting the ball through the opponent's basket.",
    "",
    "## Origins",
    "Invented in 1891 by James Naismith to keep a gym class busy in the winter.",
    "",
    "## Rules",
    "No running with the ball without dribbling it. Fouls are called for excess contact.",
  ].join("\n");
  await mockTutor(page, { answer });
  await page.goto("/");
  await page.getByLabel("What do you want to understand?").fill("Basketball");
  await page.getByRole("button", { name: "Start learning" }).last().click();

  const carousel = page.getByRole("group", { name: "Session explanation" });
  await expect(carousel).toBeVisible();
  await expect(page.getByText("1 / 3")).toBeVisible();
  await expect(page.getByText(/Five a side, one hoop/)).toBeVisible();
  await expect(page.getByText(/Invented in 1891/)).not.toBeVisible();

  await page.getByRole("button", { name: "Next card" }).click();
  await expect(page.getByText("2 / 3")).toBeVisible();
  await expect(page.getByText(/Invented in 1891/)).toBeVisible();

  await page.getByRole("tab", { name: "Go to card 3" }).click();
  await expect(page.getByText("3 / 3")).toBeVisible();
  await expect(page.getByText(/No running with the ball/)).toBeVisible();
});

test("a short single-idea answer renders as one card with no carousel chrome", async ({
  page,
}) => {
  await mockTutor(page);
  await page.goto("/");
  await page
    .getByLabel("What do you want to understand?")
    .fill("How do neural networks learn?");
  await page.getByRole("button", { name: "Start learning" }).last().click();

  await expect(
    page.getByText("A neural network learns by adjusting small numeric weights."),
  ).toBeVisible();
  await expect(page.getByText(/^\d+ \/ \d+$/)).not.toBeVisible();
});

test("drilldown computes an answer via Wolfram|Alpha and offers download only when signed in", async ({
  page,
}) => {
  await mockTutor(page);
  await page.route("**/api/drilldown", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query: "How do neural networks learn?",
        interpretation: "neural network | learning rate",
        result: "Backpropagation adjusts weights via gradient descent.",
        images: [],
        websiteUrl: "https://www.wolframalpha.com/input?i=neural+network",
        raw: "",
      }),
    });
  });
  await page.goto("/");
  await page
    .getByLabel("What do you want to understand?")
    .fill("How do neural networks learn?");
  await page.getByRole("button", { name: "Start learning" }).last().click();
  await expect(page.getByText("A named learning source")).toBeVisible();

  await page.getByRole("button", { name: "Drill down" }).click();
  await expect(
    page.getByText("Backpropagation adjusts weights via gradient descent."),
  ).toBeVisible();
  await expect(page.getByText("Sign in to save and download this.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download drilldown" }),
  ).not.toBeVisible();
});

test("drilldown degrades honestly when Wolfram|Alpha cannot interpret the query", async ({
  page,
}) => {
  await mockTutor(page);
  await page.route("**/api/drilldown", async (route) => {
    await route.fulfill({
      status: 501,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Wolfram|Alpha could not compute that.",
        detail: "Wolfram|Alpha could not understand the query.",
      }),
    });
  });
  await page.goto("/");
  await page
    .getByLabel("What do you want to understand?")
    .fill("How do neural networks learn?");
  await page.getByRole("button", { name: "Start learning" }).last().click();
  await expect(page.getByText("A named learning source")).toBeVisible();

  await page.getByRole("button", { name: "Drill down" }).click();
  await expect(
    page.getByText("Wolfram|Alpha could not compute that."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("drilldown state resets when navigating to a different card", async ({
  page,
}) => {
  const answer = [
    "## The Game",
    "Five a side, one hoop each way.",
    "",
    "## Origins",
    "Invented in 1891 by James Naismith.",
  ].join("\n");
  await mockTutor(page, { answer });
  await page.route("**/api/drilldown", async (route) => {
    await route.fulfill({
      status: 501,
      contentType: "application/json",
      body: JSON.stringify({ error: "Wolfram|Alpha could not compute that." }),
    });
  });
  await page.goto("/");
  await page.getByLabel("What do you want to understand?").fill("Basketball");
  await page.getByRole("button", { name: "Start learning" }).last().click();

  await page.getByRole("button", { name: "Drill down" }).click();
  await expect(
    page.getByText("Wolfram|Alpha could not compute that."),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Go to card 2" }).click();
  await expect(page.getByText("2 / 2")).toBeVisible();
  await expect(
    page.getByText("Wolfram|Alpha could not compute that."),
  ).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Drill down" })).toBeVisible();
});

test("drilldown requires a query and never forwards a missing one", async ({
  request,
}) => {
  const response = await request.post("/api/drilldown", { data: {} });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "A query is required.",
  });
});
