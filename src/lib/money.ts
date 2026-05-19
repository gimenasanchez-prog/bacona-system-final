export function formatArsFromCents(cents: number): string {
  const ars = cents / 100;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ars);
}

export function assertIntCents(value: number, fieldName: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer number of cents`);
  }
}

