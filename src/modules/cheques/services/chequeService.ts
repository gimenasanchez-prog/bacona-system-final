import { prisma } from "@/lib/prisma";
import { addBusinessDays } from "@/lib/businessDays";
import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";

export class ChequeService {
  static async listCheques() {
    return prisma.cheque.findMany({
      include: {
        posPayment: {
          include: {
            sale: { include: { comercialSaleLine: true } },
          },
        },
        createdByEmployee: { select: { id: true, displayName: true } },
        cuentaBancaria: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { fechaRecepcion: "desc" }],
    });
  }

  static async setDeposito(chequeId: string, fechaDeposito: Date) {
    const cheque = await prisma.cheque.findUnique({ where: { id: chequeId }, select: { status: true } });
    if (!cheque) throw new Error("Cheque no encontrado");
    if (cheque.status !== "EN_CARTERA") throw new Error("Solo se puede depositar un cheque que está en cartera");

    return prisma.cheque.update({
      where: { id: chequeId },
      data: {
        status: "DEPOSITADO",
        fechaDeposito,
        fechaAcreditacionEstimada: addBusinessDays(fechaDeposito, 2),
      },
    });
  }

  static async markAcreditado(chequeId: string, bankAccountId: string, employeeId: string) {
    const cheque = await prisma.cheque.findUnique({ where: { id: chequeId } });
    if (!cheque) throw new Error("Cheque no encontrado");
    if (cheque.status !== "DEPOSITADO") throw new Error("Solo se puede acreditar un cheque que está depositado");

    // Reutiliza el mismo motor de conciliación bancaria que ya usan tarjeta/transferencia:
    // crea el LocalCashMovement real en la cuenta elegida, aplicando la comisión/retención
    // configurada para el método CHEQUE en esa cuenta (0% si no se configuró ninguna).
    await LocalCashBoxService.reconcileSales({
      cashBoxId: bankAccountId,
      posPaymentIds: [cheque.posPaymentId],
      date: new Date(),
      createdByEmployeeId: employeeId,
    });

    return prisma.cheque.update({
      where: { id: chequeId },
      data: { status: "ACREDITADO", acreditadoAt: new Date(), cuentaBancariaId: bankAccountId },
    });
  }

  static async markRechazado(chequeId: string, motivo: string) {
    const cheque = await prisma.cheque.findUnique({ where: { id: chequeId }, select: { status: true } });
    if (!cheque) throw new Error("Cheque no encontrado");
    if (cheque.status === "ACREDITADO" || cheque.status === "RECHAZADO") {
      throw new Error("Este cheque ya no se puede rechazar");
    }

    return prisma.cheque.update({
      where: { id: chequeId },
      data: { status: "RECHAZADO", rechazadoAt: new Date(), rechazoMotivo: motivo },
    });
  }

  static async updateDetails(
    chequeId: string,
    data: { numeroCheque?: string | null; banco?: string | null; librador?: string | null }
  ) {
    return prisma.cheque.update({ where: { id: chequeId }, data });
  }
}
