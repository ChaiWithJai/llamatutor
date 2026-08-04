import { describe, expect, it } from "vitest";
import {
  createLiveCallerAdapter,
  createSimulatedCallerAdapter,
  latencyBucket,
  simulationResumeIndex,
} from "./callerAdapter";
import { getVoiceConversation } from "./mentalHealthPolicy";

const conversation = getVoiceConversation("voice-booking")!;

function context(turnIndex: number) {
  return { generation: 1, turnIndex, scenarioId: "voice-booking" };
}

describe("simulated caller adapter", () => {
  it("replays reviewed caller turns and ignores receptionist positions", async () => {
    const adapter = createSimulatedCallerAdapter({
      turns: conversation.turns,
    });

    await expect(adapter.nextTurn(context(0))).resolves.toBeNull();
    const callerTurn = await adapter.nextTurn(context(1));
    expect(callerTurn?.source).toBe("scripted");
    expect(callerTurn?.text).toBe(conversation.turns[1].text);
  });

  it("stops producing turns once cancelled", async () => {
    const adapter = createSimulatedCallerAdapter({
      turns: conversation.turns,
    });
    adapter.cancel();
    await expect(adapter.nextTurn(context(1))).resolves.toBeNull();
  });
});

describe("live caller adapter", () => {
  it("assembles final transcript events into one caller turn", async () => {
    const adapter = createLiveCallerAdapter();
    const pending = adapter.nextTurn(context(0));
    adapter.submitEvents([
      { eventId: "p-1", sequence: 0, kind: "partial", text: "I need" },
      {
        eventId: "f-1",
        sequence: 1,
        kind: "final",
        text: "I need an appointment",
      },
    ]);

    const turn = await pending;
    expect(turn?.text).toBe("I need an appointment");
    expect(turn?.source).toBe("speech");
    expect(turn?.abstained).toBe(false);
  });

  it("fails closed when transcript events arrive out of order", async () => {
    const adapter = createLiveCallerAdapter();
    const pending = adapter.nextTurn(context(0));
    adapter.submitEvents([
      { eventId: "f-2", sequence: 2, kind: "final", text: "second" },
      { eventId: "f-1", sequence: 1, kind: "final", text: "first" },
    ]);

    const turn = await pending;
    expect(turn?.abstained).toBe(true);
  });

  it("accepts a typed turn as the accessible fallback", async () => {
    const adapter = createLiveCallerAdapter();
    const pending = adapter.nextTurn(context(0));
    adapter.submitText("  Tuesday at two thirty, please.  ");

    const turn = await pending;
    expect(turn?.source).toBe("typed");
    expect(turn?.text).toBe("Tuesday at two thirty, please.");
    expect(turn?.abstained).toBe(false);
  });

  it("treats an empty typed turn as an abstention rather than a turn", async () => {
    const adapter = createLiveCallerAdapter();
    const pending = adapter.nextTurn(context(0));
    adapter.submitText("   ");
    await expect(pending).resolves.toMatchObject({ abstained: true });
  });

  it("surfaces owned failure copy without inventing a turn", async () => {
    const adapter = createLiveCallerAdapter();
    const pending = adapter.nextTurn(context(0));
    adapter.fail("Transcription is taking a pause.");

    const turn = await pending;
    expect(turn?.source).toBe("failed");
    expect(turn?.text).toBe("");
    expect(turn?.failureReason).toBe("Transcription is taking a pause.");
  });

  it("releases a pending turn on cancel and never resumes", async () => {
    const adapter = createLiveCallerAdapter();
    const pending = adapter.nextTurn(context(0));
    expect(adapter.isAwaitingTurn()).toBe(true);

    adapter.cancel();
    await expect(pending).resolves.toBeNull();
    expect(adapter.isAwaitingTurn()).toBe(false);

    // Late speech from a call that already ended must not become a turn.
    adapter.submitText("stale utterance");
    await expect(adapter.nextTurn(context(1))).resolves.toBeNull();
  });

  it("never lets a previous waiter outlive its turn", async () => {
    const adapter = createLiveCallerAdapter();
    const first = adapter.nextTurn(context(0));
    const second = adapter.nextTurn(context(1));

    await expect(first).resolves.toBeNull();
    adapter.submitText("this belongs to the second turn");
    await expect(second).resolves.toMatchObject({
      text: "this belongs to the second turn",
    });
  });
});

describe("operational metadata", () => {
  it("buckets latency instead of reporting raw timings", () => {
    expect(latencyBucket(120)).toBe("under_500ms");
    expect(latencyBucket(900)).toBe("500ms_1500ms");
    expect(latencyBucket(2500)).toBe("1500ms_4000ms");
    expect(latencyBucket(9000)).toBe("over_4000ms");
  });
});

describe("live-to-simulation handoff", () => {
  it("does not replay the greeting or completed caller turns", () => {
    expect(simulationResumeIndex(conversation.turns, 0, true)).toBe(1);
    expect(simulationResumeIndex(conversation.turns, 1, true)).toBe(3);
    expect(simulationResumeIndex(conversation.turns, 0, false)).toBe(0);
  });

  it("finishes when the live caller already completed the reviewed script", () => {
    const callerCount = conversation.turns.filter(
      (turn) => turn.speaker === "caller",
    ).length;
    expect(simulationResumeIndex(conversation.turns, callerCount, true)).toBe(
      conversation.turns.length,
    );
  });
});
