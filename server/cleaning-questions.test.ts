// Cleaning asks one thing per question, and its follow-up only when it makes sense.
import { describe, expect, it } from "vitest";
import { CATEGORY_MAP, isAsked } from "@contracts/services";
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
