import { describe, expect, it } from "vitest";
import { fitmentFormSchema } from "./fitment-schema";

const VIN_MESSAGE = "Enter the 17-character VIN from your registration card";
const PART = "A2059062203";

function vinMessages(vin: string): string[] {
  const result = fitmentFormSchema.safeParse({ part: PART, vin });
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path[0] === "vin")
    .map((issue) => issue.message);
}

describe("fitmentFormSchema VIN rule", () => {
  it.each([
    ["I", "WDD2050421R12345I"],
    ["O", "WDD2050421R12345O"],
    ["Q", "WDD2050421R12345Q"],
  ])("MOTO-01-TC06 a VIN containing %s is rejected", (_letter, vin) => {
    expect(vinMessages(vin)).toEqual([VIN_MESSAGE]);
  });

  it("MOTO-01-TC17 a VIN already in canonical form passes unchanged", () => {
    const result = fitmentFormSchema.safeParse({ part: PART, vin: "WDD2050421R123456" });
    expect(result.success).toBe(true);
  });

  it("MOTO-01-TC17 a lowercase VIN with spaces around it passes, trimmed and uppercased", () => {
    const result = fitmentFormSchema.safeParse({ part: PART, vin: "  wdd2050421r123456 " });
    expect(result.success && result.data.vin).toBe("WDD2050421R123456");
  });

  it("MOTO-01-TC05 a 16-character VIN is rejected", () => {
    expect(vinMessages("WDD2050421R12345")).toEqual([VIN_MESSAGE]);
  });

  it("MOTO-01-TC05 an empty VIN is rejected with the same message", () => {
    expect(vinMessages("")).toEqual([VIN_MESSAGE]);
  });
});

describe("fitmentFormSchema part number rule", () => {
  it.each(["", "   ", "...", "A 205 906 22 03 #"])(
    "MOTO-01-TC15 the part number %j is rejected",
    (part) => {
      const result = fitmentFormSchema.safeParse({ part, vin: "WDD2050421R123456" });
      expect(result.success).toBe(false);
      expect(!result.success && result.error.issues[0]?.message).toBe("Enter a part number");
    },
  );

  it.each(["A 205 906 22 03", "a2059062203", "A-205.906.22.03"])(
    "MOTO-01-TC04 the part number %j is accepted",
    (part) => {
      const result = fitmentFormSchema.safeParse({ part, vin: "WDD2050421R123456" });
      expect(result.success).toBe(true);
    },
  );
});
