import { Prisma } from "@prisma/client";

/**
 * Units valid per dimension.
 */
const DIMENSION_UNITS: Record<string, string[]> = {
  VOLUME: ["ML", "L"],
  MASS: ["G", "KG"],
  COUNT: ["UN"],
};

/**
 * "Natural multiplier": how many base-of-base units are in 1 of this unit.
 * Base-of-base: ML for VOLUME, G for MASS, UN for COUNT.
 */
const METRIC_BASE: Record<string, number> = {
  ML: 1,
  L: 1000,
  G: 1,
  KG: 1000,
  UN: 1,
};

export class UnitConversionService {
  /**
   * Convert an entered qty (in entryUnit) to the item's base unit (item.unit = ML/G/UN).
   * Returns the base qty as Decimal.
   */
  static toBaseQty(params: {
    qty: number | string;
    entryUnit: string;
    itemUnit: string;       // item.unit — the base unit stored in the ledger
    itemDimension: string;  // item.dimension
    itemName: string;       // for error messages
  }): Prisma.Decimal {
    const { qty, entryUnit, itemUnit, itemDimension, itemName } = params;

    const allowed = DIMENSION_UNITS[itemDimension] ?? [];
    if (!allowed.includes(entryUnit)) {
      throw new Error(
        `Unidad "${entryUnit}" no es válida para el ítem "${itemName}" (dimensión: ${itemDimension}). Unidades válidas: ${allowed.join(", ")}`
      );
    }

    const multiplier = METRIC_BASE[entryUnit]! / METRIC_BASE[itemUnit]!;
    return new Prisma.Decimal(String(qty)).mul(new Prisma.Decimal(String(multiplier)));
  }

  /**
   * Convert an entered qty via a custom UOM presentation (multiplierToBase already in base units).
   */
  static toBaseQtyFromUom(params: {
    qty: number | string;
    multiplierToBase: Prisma.Decimal | number | string;
  }): Prisma.Decimal {
    return new Prisma.Decimal(String(params.qty)).mul(
      new Prisma.Decimal(String(params.multiplierToBase))
    );
  }

  /**
   * Convert a qty stored in base unit to the item's display unit.
   */
  static toDisplayQty(params: {
    qtyBase: Prisma.Decimal;
    baseUnit: string;    // item.unit
    displayUnit: string; // item.displayUnit
  }): Prisma.Decimal {
    const { qtyBase, baseUnit, displayUnit } = params;
    const multiplier = METRIC_BASE[baseUnit]! / METRIC_BASE[displayUnit]!;
    return qtyBase.mul(new Prisma.Decimal(String(multiplier)));
  }

  /**
   * All standard units valid for a given dimension.
   */
  static validUnitsForDimension(dimension: string): string[] {
    return DIMENSION_UNITS[dimension] ?? [];
  }

  /**
   * Numeric multiplier to convert from baseUnit to displayUnit (pure math, no DB).
   */
  static displayMultiplier(baseUnit: string, displayUnit: string): number {
    return (METRIC_BASE[baseUnit] ?? 1) / (METRIC_BASE[displayUnit] ?? 1);
  }
}