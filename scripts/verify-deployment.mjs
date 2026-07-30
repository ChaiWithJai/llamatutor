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
