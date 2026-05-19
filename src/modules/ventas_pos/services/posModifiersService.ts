import { prisma } from "@/lib/prisma";

export class PosModifiersService {
  static async validateProductModifierSelection(params: {
    productId: string;
    selectedOptionIds: string[];
  }): Promise<{ optionPriceDeltaById: Record<string, number> }> {
    const { productId, selectedOptionIds } = params;

    const productGroups = await prisma.productModifierGroup.findMany({
      where: { productId },
      include: {
        group: {
          include: { options: { where: { isActive: true } } },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const allowedGroupIds = new Set(productGroups.map((pg) => pg.groupId));

    // Load selected options and ensure they belong to allowed groups
    const selectedOptions = selectedOptionIds.length
      ? await prisma.modifierOption.findMany({
          where: { id: { in: selectedOptionIds }, isActive: true },
          include: { group: true },
        })
      : [];

    const selectedByGroup = new Map<string, string[]>();
    for (const opt of selectedOptions) {
      if (!allowedGroupIds.has(opt.groupId)) {
        throw new Error("Selected modifier option not allowed for this product");
      }
      const arr = selectedByGroup.get(opt.groupId) ?? [];
      arr.push(opt.id);
      selectedByGroup.set(opt.groupId, arr);
    }

    for (const pg of productGroups) {
      const selectedCount = (selectedByGroup.get(pg.groupId) ?? []).length;
      if (selectedCount < pg.group.minSelect) {
        throw new Error(`Missing required modifier selection for group: ${pg.group.name}`);
      }
      if (selectedCount > pg.group.maxSelect) {
        throw new Error(`Too many selections for group: ${pg.group.name}`);
      }
    }

    // Ensure no unknown ids (inactive or missing) were provided
    if (selectedOptions.length !== selectedOptionIds.length) {
      throw new Error("One or more modifier options are invalid or inactive");
    }

    const optionPriceDeltaById: Record<string, number> = {};
    for (const opt of selectedOptions) optionPriceDeltaById[opt.id] = opt.priceDeltaCents;
    return { optionPriceDeltaById };
  }
}

