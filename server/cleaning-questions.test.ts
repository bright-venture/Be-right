// Cleaning asks one thing per question, and its follow-up only when it makes sense.
import { describe, expect, it } from "vitest";
import { askedAnswers, CATEGORY_MAP, isAsked } from "@contracts/services";
import { EMERGENCY_PROBLEM_MAP, EMERGENCY_PROBLEMS } from "@contracts/emergency";
import { answersFromLink, validateAnswers } from "@contracts/workflow";

const asked = (answers: Record<string, string>) =>
  CATEGORY_MAP.cleaning.questions.filter((q) => isAsked(q, answers)).map((q) => q.id);

describe("cleaning questions", () => {
  it("ask the rooms for a home, the floor area for an office, shop or building", () => {
    expect(asked({ place: "home", kind: "regular" })).toEqual(["place", "kind", "rooms"]);
    for (const place of ["office", "shop", "building"]) {
      expect(asked({ place, kind: "deep" })).toEqual(["place", "kind", "space"]);
    }
  });

  it("accept a complete booking and refuse answers to questions not asked", () => {
    expect(validateAnswers("cleaning", { place: "home", kind: "moving", rooms: "4plus" })).toBeNull();
    expect(validateAnswers("cleaning", { place: "shop", kind: "regular", space: "upto100" })).toBeNull();
    // rooms for an office, a missing size, a question that no longer exists
    expect(validateAnswers("cleaning", { place: "office", kind: "regular", rooms: "2" })).not.toBeNull();
    expect(validateAnswers("cleaning", { place: "home", kind: "regular" })).not.toBeNull();
    expect(validateAnswers("cleaning", { place: "home", kind: "regular", rooms: "1", frequency: "weekly" })).not.toBeNull();
  });

  it("drop follow-ups that don't apply when coming from a link", () => {
    const answers = answersFromLink("cleaning", JSON.stringify({ place: "office", rooms: "2", kind: "moving" }));
    expect(answers).toEqual({ place: "office", kind: "moving" });
  });
});

describe("porter questions", () => {
  const porter = (answers: Record<string, string>) =>
    CATEGORY_MAP.porter.questions.filter((q) => isAsked(q, answers)).map((q) => q.id);

  it("ask about stairs for a move or heavy items, not for a building shift", () => {
    for (const help of ["home_move", "office_move", "heavy"]) expect(porter({ help })).toEqual(["help", "floors"]);
    expect(porter({ help: "building" })).toEqual(["help"]);
    expect(validateAnswers("porter", { help: "building" })).toBeNull();
    expect(validateAnswers("porter", { help: "building", floors: "elevator" })).not.toBeNull();
    expect(validateAnswers("porter", { help: "heavy", floors: "stairs" })).toBeNull();
    expect(validateAnswers("porter", { help: "heavy", floors: "stairs_5plus" })).not.toBeNull();
  });
});

describe("electrical questions", () => {
  const electrical = (answers: Record<string, string>) =>
    CATEGORY_MAP.electrical.questions.filter((q) => isAsked(q, answers)).map((q) => q.id);

  it("ask about the supply and switching off; whether it can be isolated only when it can be risky", () => {
    expect(electrical({ problem: "socket" })).toEqual(["problem", "supply", "scope", "switchOff", "isolated"]);
    expect(electrical({ problem: "led" })).toEqual(["problem", "supply", "scope", "switchOff"]);
    expect(validateAnswers("electrical", { problem: "led", supply: "both", scope: "single", switchOff: "yes" })).toBeNull();
    // the wiring question is gone
    expect(
      validateAnswers("electrical", { problem: "led", supply: "both", scope: "single", switchOff: "yes", exposed: "no" }),
    ).not.toBeNull();
  });

  it("ask a solar system about its inverter, not about rooms", () => {
    expect(electrical({ problem: "solar" })).toEqual(["problem", "supply", "inverter"]);
    expect(validateAnswers("electrical", { problem: "solar", supply: "edl", inverter: "off" })).toBeNull();
  });

  it("treat a burning smell, electricity in water or a problem that can't be isolated as an emergency", () => {
    const options = CATEGORY_MAP.electrical.questions.flatMap((q) => q.options ?? []);
    const urgent = options.filter((o) => o.emergency).map((o) => o.emergency!);
    expect(urgent).toEqual(["burning", "live-water", "no-power"]);
    for (const id of urgent) expect(EMERGENCY_PROBLEM_MAP[id]?.category).toBe("electrical");
    expect(EMERGENCY_PROBLEMS.length % 2).toBe(0);
  });

  it("forget follow-ups once the answer they depend on changes", () => {
    const answers = { problem: "socket", supply: "edl", scope: "single", switchOff: "no", isolated: "no" };
    expect(askedAnswers(CATEGORY_MAP.electrical.questions, { ...answers, problem: "solar" })).toEqual({
      problem: "solar",
      supply: "edl",
    });
  });
});
