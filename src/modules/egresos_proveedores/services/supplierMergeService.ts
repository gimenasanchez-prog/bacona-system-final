import { prisma } from "@/lib/prisma";

export class SupplierMergeService {
  /**
   * Unifica dos proveedores que son el mismo: todo lo de `sourceId` (compras, deudas, pagos, egresos,
   * tickets y lo aprendido de sus productos) pasa a `targetId`, que además completa los datos que le falten.
   * El de origen queda inactivo (no se borra, para no perder trazabilidad).
   */
  static async merge(params: { sourceId: string; targetId: string }) {
    const { sourceId, targetId } = params;
    if (sourceId === targetId) throw new Error("Elegí un proveedor distinto para unificar");

    const [source, target] = await Promise.all([
      prisma.supplier.findUnique({ where: { id: sourceId } }),
      prisma.supplier.findUnique({ where: { id: targetId } }),
    ]);
    if (!source || !target) throw new Error("Proveedor no encontrado");
    if (!target.active) throw new Error(`"${target.name}" está inactivo: elegí uno activo`);

    return prisma.$transaction(async (tx) => {
      const where = { supplierId: sourceId };
      const data = { supplierId: targetId };
      const [purchases, payables, payments, expenses, tickets] = await Promise.all([
        tx.purchase.updateMany({ where, data }),
        tx.supplierPayable.updateMany({ where, data }),
        tx.supplierPayment.updateMany({ where, data }),
        tx.localExpense.updateMany({ where, data }),
        tx.ticketImport.updateMany({ where, data }),
      ]);

      // Lo aprendido: si los dos tienen el mismo texto, queda el del destino (sumando los usos)
      const sourceAliases = await tx.supplierProductAlias.findMany({ where });
      const targetTexts = new Map(
        (await tx.supplierProductAlias.findMany({ where: { supplierId: targetId } })).map((a) => [a.normalizedText, a]),
      );
      for (const a of sourceAliases) {
        const clash = targetTexts.get(a.normalizedText);
        if (clash) {
          await tx.supplierProductAlias.update({ where: { id: clash.id }, data: { timesUsed: { increment: a.timesUsed } } });
          await tx.supplierProductAlias.delete({ where: { id: a.id } });
        } else {
          await tx.supplierProductAlias.update({ where: { id: a.id }, data });
        }
      }

      await tx.supplier.update({
        where: { id: targetId },
        data: {
          ...(!target.razonSocial && source.razonSocial ? { razonSocial: source.razonSocial } : {}),
          ...(!target.cuit && source.cuit ? { cuit: source.cuit } : {}),
          ...(!target.categoria && source.categoria ? { categoria: source.categoria } : {}),
        },
      });
      await tx.supplier.update({ where: { id: sourceId }, data: { active: false } });

      return {
        purchases: purchases.count,
        payables: payables.count,
        payments: payments.count,
        expenses: expenses.count,
        tickets: tickets.count,
        aliases: sourceAliases.length,
      };
    });
  }
}
