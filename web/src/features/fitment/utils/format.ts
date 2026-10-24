const TABBY_INSTALMENTS = 4;

const wholeDirhams = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dirhamsAndFils = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const OEM_PART_PATTERN = /^([A-Z])(\d{3})(\d{3})(\d{2})(\d{2})$/;

export function formatAED(amount: number): string {
  return `AED ${wholeDirhams.format(amount)}`;
}

export function tabbySplit(amount: number): string {
  return `AED ${dirhamsAndFils.format(amount / TABBY_INSTALMENTS)}`;
}

export function normalizePartNumber(value: string): string {
  return value.replace(/[\s.-]/g, "").toUpperCase();
}

export function formatPartNumber(partNumber: string): string {
  const match = OEM_PART_PATTERN.exec(partNumber);
  return match ? match.slice(1).join(" ") : partNumber;
}
