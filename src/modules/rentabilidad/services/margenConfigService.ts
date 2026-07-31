import { prisma } from "@/lib/prisma";

export class MargenConfigService {
  static async list() {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: { margenConfig: true },
      orderBy: { sortOrder: "asc" },
    });
    return categories.map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      cogsPercent: c.margenConfig ? Number(c.margenConfig.cogsPercent) : null,
    }));
  }

  static async upsert(
    categoryId: string,
    cogsPercent: number,
    updatedByEmployeeId: string
  ) {
    return prisma.configMargenCategoria.upsert({
      where: { categoryId },
      update: { cogsPercent, updatedByEmployeeId },
      create: { categoryId, cogsPercent, updatedByEmployeeId },
    });
  }
}
