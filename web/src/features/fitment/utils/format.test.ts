import { describe, expect, it } from "vitest";
import { formatAED, formatPartNumber, normalizePartNumber, tabbySplit } from "./format";

describe("price formatting", () => {
  it("MOTO-01-TC09 formats 1250 as AED 1,250 with a Tabby split of AED 312.50", () => {
    expect(formatAED(1250)).toBe("AED 1,250");
    expect(tabbySplit(1250)).toBe("AED 312.50");
  });

  it("MOTO-01-TC09 formats 899 as AED 899 with a Tabby split of AED 224.75", () => {
    expect(formatAED(899)).toBe("AED 899");
    expect(tabbySplit(899)).toBe("AED 224.75");
  });
});

describe("part number formatting", () => {
  it.each(["A 205 906 22 03", "a2059062203", "A-205.906.22.03"])(
    "MOTO-01-TC04 normalizes %j to A2059062203",
    (input) => {
      expect(normalizePartNumber(input)).toBe("A2059062203");
    },
  );

  it("MOTO-01-TC25 spaces an OEM number the way the design shows it", () => {
    expect(formatPartNumber("A0004204102")).toBe("A 000 420 41 02");
  });

  it("MOTO-01-TC25 leaves a number that does not follow the OEM pattern unchanged", () => {
    expect(formatPartNumber("XY12")).toBe("XY12");
  });
});
