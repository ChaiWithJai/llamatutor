import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const phase = process.argv[2];
const baseUrl = process.argv[3] ?? "http://127.0.0.1:3211";

if (!phase || !["before", "after"].includes(phase)) {
  throw new Error(
    "Usage: node scripts/capture-jtbd-governance.mjs <before|after> [baseUrl]",
  );
}

const outputDirectory = path.resolve("docs/governance/jtbd", phase);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });

const tutorAnswer = [
  "## The useful idea",
  "",
  "Compound interest means growth can earn more growth over time.",
  "",
  "### A concrete example",
  "",
  "If $100 grows by 10%, it becomes $110. The next 10% is calculated from $110, not the original $100.",
].join("\n");

const sources = [
  {
    name: "Compound Interest Explained",
    url: "https://example.com/compound-interest",
    content: "Compound interest applies growth to principal and prior growth.",
  },
  ...Array.from({ length: 7 }, (_, index) => ({
    name: `Learning source ${index + 2}`,
    url: `https://example.com/source-${index + 2}`,
    content: "Grounded source content.",
  })),
];

const goal = {
  id: "11111111-1111-4111-8111-111111111111",
  topic: "How does compound interest work?",
  level: "Middle School",
  status: "active",
  nextRepText: "Use compound interest in a new example.",
  createdAt: "2026-07-29T12:00:00.000Z",
  updatedAt: "2026-07-29T12:00:00.000Z",
};

const pendingRep = {
  id: "22222222-2222-4222-8222-222222222222",
  goalId: goal.id,
  prompt: "Explain compound interest and give one example.",
  attempt: null,
  feedback: null,
  status: "pending",
  createdAt: "2026-07-29T12:00:00.000Z",
  completedAt: null,
};

const nextRep = {
  ...pendingRep,
  id: "33333333-3333-4333-8333-333333333333",
  prompt:
    "Apply compound interest to a new example. Explain what changed and what stayed the same.",
};

const initialDashboard = {
  profile: {
    email: "learner@example.com",
    defaultLevel: "Middle School",
    streakCount: 3,
    lastCompletedOn: "2026-07-29",
  },
  goal,
  pendingRep,
  recentReps: [],
  completedSessions: 3,
};

const completedDashboard = {
  ...initialDashboard,
  profile: { ...initialDashboard.profile, streakCount: 4 },
  pendingRep: nextRep,
  recentReps: [
    {
      ...pendingRep,
      attempt: "Growth earns more growth after each period.",
      feedback: "Clear. Add the compounding frequency.",
      status: "completed",
      completedAt: "2026-07-30T12:00:00.000Z",
    },
  ],
  completedSessions: 4,
};

const streamBody = (answer = tutorAnswer) =>
  `data: ${JSON.stringify({ text: answer })}\n\ndata: ${JSON.stringify({ text: "" })}\n\n`;

async function mockTutor(page, { sourcesFail = false, delay = 0 } = {}) {
  await page.route("**/api/getSources", async (route) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({
      status: sourcesFail ? 502 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        sourcesFail ? { error: "Source lookup failed." } : sources,
      ),
    });
  });

  await page.route("**/api/getChat", async (route) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: streamBody(),
    });
  });
}

async function mockSignedIn(page, context) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: "governance-learner",
    email: "learner@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    app_metadata: { provider: "email" },
    user_metadata: {},
  })}.governance-signature`;

  await context.addCookies([
    {
      name: "nf_jwt",
      value: token,
      url: baseUrl,
    },
  ]);

  await page.route("**/.netlify/identity/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "governance-learner",
        email: "learner@example.com",
        confirmed_at: "2026-07-01T12:00:00.000Z",
        created_at: "2026-07-01T12:00:00.000Z",
        updated_at: "2026-07-30T12:00:00.000Z",
        app_metadata: { provider: "email", roles: [] },
        user_metadata: {},
      }),
    });
  });

  let dashboard = initialDashboard;
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

    const payload = request.postDataJSON();
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

    dashboard = completedDashboard;
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
}

async function shot(page, name) {
  await page.screenshot({
    path: path.join(outputDirectory, `${name}.png`),
    animations: "disabled",
  });
}

async function capturePublicJourney() {
  const context = await browser.newContext({
    viewport: { width: 1353, height: 534 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await mockTutor(page, { delay: 900 });
  await page.goto(baseUrl);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await shot(page, "01-entry-laptop");

  await page
    .getByLabel("What do you want to understand?")
    .fill("How does compound interest work?");
  await shot(page, "02-topic-ready");

  await page.getByRole("button", { name: "Start learning" }).last().click();
  await page.getByLabel("Preparing explanation").waitFor();
  await shot(page, "03-preparing");
  await page.getByText("Compound interest means growth").waitFor();
  await shot(page, "04-sourced-session");
  await context.close();
}

async function captureSignIn() {
  const context = await browser.newContext({
    viewport: { width: 1353, height: 768 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("dialog", { name: "Welcome back" }).waitFor();
  await shot(page, "05-sign-in");
  await context.close();
}

async function captureSourceFailure() {
  const context = await browser.newContext({
    viewport: { width: 1353, height: 768 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await mockTutor(page, { sourcesFail: true });
  await page.goto(baseUrl);
  await page
    .getByLabel("What do you want to understand?")
    .fill("Why is the sky blue?");
  await page.getByRole("button", { name: "Start learning" }).last().click();
  await page.getByText("Unverified session").waitFor();
  await shot(page, "06-unverified-session");
  await context.close();
}

async function captureSignedInJourney() {
  const context = await browser.newContext({
    viewport: { width: 1353, height: 768 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await mockTutor(page);
  await mockSignedIn(page, context);
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Resume coaching" }).waitFor();
  await shot(page, "07-resume");

  await page.getByRole("button", { name: "Resume coaching" }).click();
  await page.getByLabel("Try it now").waitFor();
  await shot(page, "08-practice");

  await page
    .getByLabel("Try it now")
    .fill("Growth earns more growth after each period.");
  await page
    .getByRole("button", { name: "Get feedback and save my next rep" })
    .click();
  await page.getByText("Rep complete").waitFor();
  await shot(page, "09-feedback-next-rep");

  await page.goto(baseUrl);
  await page
    .getByLabel("What do you want to understand?")
    .fill("How do neural networks learn?");
  await page.getByRole("button", { name: "Start learning" }).last().click();
  await page
    .getByRole("dialog", { name: "Two minutes and it counts" })
    .waitFor();
  await shot(page, "10-goal-switch");
  await context.close();
}

async function captureMobileJourney() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await mockTutor(page);
  await page.goto(baseUrl);
  await shot(page, "11-entry-mobile");
  await page
    .getByLabel("What do you want to understand?")
    .fill("How does compound interest work?");
  await page.getByRole("button", { name: "Start learning" }).last().click();
  await page.getByText("Compound interest means growth").waitFor();
  await shot(page, "12-session-mobile");
  await context.close();
}

try {
  await capturePublicJourney();
  await captureSignIn();
  await captureSourceFailure();
  await captureSignedInJourney();
  await captureMobileJourney();
} finally {
  await browser.close();
}

console.log(`Captured ${phase} JTBD screenshots in ${outputDirectory}`);
