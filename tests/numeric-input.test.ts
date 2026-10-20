import { describe, expect, it } from "vitest";
import { parseNumericInput } from "../src/client/numeric-input";

describe("manual numeric input", () => {
  it.each([
    ["65", 65],
    ["６５", 65],
    [" ６５ ", 65],
    ["0", 0],
    ["０", 0],
    ["０６５", 65],
    ["－１", -1],
    ["+12", 12],
    ["＋１２", 12],
    ["−12", -12],
  ])("reads %s without losing the entered number", (text, value) => {
    expect(parseNumericInput(text)).toBe(value);
  });

  it.each(["", " ", "　", "-", "６あ", "NaN", "Infinity", "1e2", "1.5"])(
    "does not turn incomplete or invalid integer input %j into a stored number",
    (text) => {
      expect(parseNumericInput(text)).toBeNull();
    },
  );

  it("accepts fractional multipliers, including full-width decimal input", () => {
    expect(parseNumericInput("２．５", true)).toBe(2.5);
    expect(parseNumericInput("2.", true)).toBe(2);
    expect(parseNumericInput(".5", true)).toBe(0.5);
    expect(parseNumericInput(".", true)).toBeNull();
  });

  it("rejects overflow instead of storing Infinity", () => {
    expect(parseNumericInput("9".repeat(400))).toBeNull();
  });
});
