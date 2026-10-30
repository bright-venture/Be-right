// Cleaning asks one thing per question, and its follow-ups only when they make sense.
import { describe, expect, it } from "vitest";
import { CATEGORY_MAP, isAsked } from "@contracts/services";
import { answersFromLink, validateAnswers } from "@contracts/workflow";

const asked = (answers: Record<string, string>) =>
  CATEGORY_MAP.cleaning.questions.filter((q) => isAsked(q, answers)).map((q) => q.id);

describe("cleaning questions", () => {
  it("ask bedrooms for a home, the floor area for an office, shop or building", () => {
    expect(asked({ place: "home", kind: "regular" })).toEqual(["place", "kind", "bedrooms", "frequency", "supplies"]);
    for (const place of ["office", "shop", "building"]) {
      expect(asked({ place, kind: "regular" })).toEqual(["place", "kind", "space", "frequency", "supplies"]);
    }
  });

  it("ask how often only for regular and deep cleaning", () => {
    expect(asked({ place: "home", kind: "deep" })).toContain("frequency");
    expect(asked({ place: "home", kind: "moving" })).not.toContain("frequency");
    expect(asked({ place: "office", kind: "after_works" })).not.toContain("frequency");
  });

  it("accept a complete booking and refuse answers to questions not asked", () => {
    expect(validateAnswers("cleaning", { place: "home", kind: "moving", bedrooms: "3", supplies: "we_bring" })).toBeNull();
    expect(validateAnswers("cleaning", { place: "shop", kind: "regular", space: "upto100", frequency: "weekly", supplies: "customer" })).toBeNull();
    // bedrooms for an office, how often for a move, a missing size
    expect(validateAnswers("cleaning", { place: "office", kind: "regular", bedrooms: "2", frequency: "once", supplies: "customer" })).not.toBeNull();
    expect(validateAnswers("cleaning", { place: "home", kind: "moving", bedrooms: "2", frequency: "weekly", supplies: "customer" })).not.toBeNull();
    expect(validateAnswers("cleaning", { place: "home", kind: "regular", frequency: "once", supplies: "customer" })).not.toBeNull();
  });

  it("drop follow-ups that don't apply when coming from a link", () => {
    const answers = answersFromLink("cleaning", JSON.stringify({ place: "office", bedrooms: "2", kind: "moving", frequency: "weekly" }));
    expect(answers).toEqual({ place: "office", kind: "moving" });
  });
});
