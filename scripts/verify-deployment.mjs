const baseUrl =
  process.argv.slice(2).find((argument) => argument !== "--") ??
  process.env.DEPLOYMENT_URL;

if (!baseUrl) {
  console.error(
    "Usage: pnpm verify:deployment -- https://deploy-preview.example.com",
  );
  process.exit(1);
}

const deploymentUrl = new URL(baseUrl);

const healthResponse = await fetch(new URL("/api/health", deploymentUrl));
if (!healthResponse.ok) {
  throw new Error(`Health check failed with HTTP ${healthResponse.status}.`);
}

const health = await healthResponse.json();
if (health.status !== "ok") {
  throw new Error("Health check did not report an ok status.");
}

const coachResponse = await fetch(new URL("/api/coach", deploymentUrl));
if (coachResponse.status !== 401) {
  throw new Error(
    `Coach contract check expected unauthenticated HTTP 401, received ${coachResponse.status}.`,
  );
}

const reflectionResponse = await fetch(
  new URL("/api/mental-health/respond", deploymentUrl),
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "guided", scenarioId: "voice-booking" }),
  },
);
if (!reflectionResponse.ok) {
  throw new Error(
    `Reflection demo check failed with HTTP ${reflectionResponse.status}.`,
  );
}

const voiceHealthResponse = await fetch(
  new URL("/api/mental-health/voice-session", deploymentUrl),
);
if (!voiceHealthResponse.ok) {
  throw new Error(
    `Voice worker health check failed with HTTP ${voiceHealthResponse.status}.`,
  );
}
const voiceHealth = await voiceHealthResponse.json();
if (!voiceHealth.ready || !voiceHealth.reviewedBeforeSpoken) {
  throw new Error(
    "Voice worker did not report reviewed-before-spoken readiness.",
  );
}

const voiceSessionResponse = await fetch(
  new URL("/api/mental-health/voice-session", deploymentUrl),
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transport: "webrtc" }),
  },
);
if (!voiceSessionResponse.ok) {
  throw new Error(
    `SmallWebRTC session smoke failed with HTTP ${voiceSessionResponse.status}.`,
  );
}
const voiceSession = await voiceSessionResponse.json();
if (!voiceSession.sessionId) {
  throw new Error("SmallWebRTC session smoke returned no session ID.");
}

const drilldownResponse = await fetch(
  new URL("/api/drilldown", deploymentUrl),
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "population of France" }),
  },
);
const drilldownBody = await drilldownResponse.text();

if (
  drilldownResponse.status === 503 &&
  drilldownBody.includes("Drilldown is not configured yet")
) {
  throw new Error(
    "Drilldown is not configured in this deployed environment. Provision WOLFRAM_ALPHA_APP_ID before promotion.",
  );
}

if (!drilldownResponse.ok) {
  throw new Error(
    `Drilldown smoke check failed with HTTP ${drilldownResponse.status}.`,
  );
}

console.log(`Deployment smoke checks passed for ${deploymentUrl.origin}.`);
