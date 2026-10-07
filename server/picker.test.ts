// The home page's service picker pre-fills the booking form. Every problem it offers
// must land on real questions and options, or the pre-fill would silently be dropped.
import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_MAP, SERVICES_IN_ORDER } from "@contracts/services";
import { CATEGORY_PROBLEMS, EMERGENCY_PROBLEMS, PROBLEM_MAP } from "@contracts/picker";
import { answersFromLink } from "@contracts/workflow";
import { t } from "@contracts/i18n";

describe("service picker", () => {
  it("only offers services and problems that exist", () => {
    for (const id of SERVICES_IN_ORDER) expect(CATEGORY_MAP[id], id).toBeDefined();
    for (const id of Object.keys(CATEGORY_PROBLEMS)) expect(CATEGORY_MAP[id], id).toBeDefined();
    for (const id of [...EMERGENCY_PROBLEMS, ...Object.values(CATEGORY_PROBLEMS).flat()]) {
      expect(PROBLEM_MAP[id], id).toBeDefined();
      expect((t.picker.problems as Record<string, unknown>)[id], `wording for ${id}`).toBeDefined();
    }
  });

  it("shows every service exactly once, in one group", () => {
    expect([...SERVICES_IN_ORDER].sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
  });

  it("pre-fills only answers the booking form accepts", () => {
    const dropped = Object.entries(PROBLEM_MAP).flatMap(([id, { cat, answers }]) => {
      const kept = answersFromLink(cat, JSON.stringify(answers));
      return Object.entries(answers)
        .filter(([q]) => kept[q] === undefined)
        .map(([q, value]) => `${id}: ${cat}.${q} = ${value}`);
    });
    expect(dropped).toEqual([]);
  });

  it("ignores anything a link adds that the form wouldn't offer", () => {
    expect(answersFromLink("plumbing", '{"problem":"leak","junk":"x"}')).toEqual({ problem: "leak" });
    expect(answersFromLink("plumbing", '{"problem":"not-an-option"}')).toEqual({});
    expect(answersFromLink("plumbing", "not json")).toEqual({});
    expect(answersFromLink("no-such-service", '{"problem":"leak"}')).toEqual({});
  });
});
