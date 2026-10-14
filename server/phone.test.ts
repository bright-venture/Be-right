// Phone numbers typed after a country code (the emergency form), shared with the API.
import { describe, expect, it } from "vitest";
import { isValidLocalPhone, isValidPhone, joinPhone } from "@contracts/phone";

describe("phone numbers with a country code chosen in front", () => {
  it("join the code and the number as typed, dropping the local 0", () => {
    expect(joinPhone("LB", "03 123 456")).toBe("+961 3 123 456");
    expect(joinPhone("LB", "71 123 456")).toBe("+961 71 123 456");
    expect(joinPhone("LB", "+33 6 12 34 56 78")).toBe("+33 6 12 34 56 78");
    expect(joinPhone("LB", "  ")).toBe("");
    expect(isValidPhone(joinPhone("LB", "03 123 456"))).toBe(true);
  });

  it("are the right length for Lebanon (7 or 8 digits), or a full international number", () => {
    for (const ok of ["3 123 456", "03 123 456", "71 123 456", "01 234 567", "+44 20 7946 0123"]) {
      expect(isValidLocalPhone("LB", ok)).toBe(true);
    }
    for (const bad of ["", "3 123", "71 123 456 789", "03-abc-456"]) {
      expect(isValidLocalPhone("LB", bad)).toBe(false);
    }
  });
});
