import { EmployeePaymentType, EmployeeRole, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function periodStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function periodEnd(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
}

function combineDateAndTime(workDate: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(
    Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), hours, minutes, 0, 0)
  );
}

const MAX_SHIFT_HOURS = 14;

type DbClient = Prisma.TransactionClient | typeof prisma;

export class HoursService {
  static computeShiftHours(workDate: Date, checkInTime: string, checkOutTime: string) {
    if (checkInTime === checkOutTime) {
      throw new Error("La hora de salida no puede ser igual a la de ingreso.");
    }

    const checkIn = combineDateAndTime(workDate, checkInTime);
    let checkOut = combineDateAndTime(workDate, checkOutTime);
    // Turno cruza medianoche (ej. entra 22:00, sale 02:00): la salida cae en el día siguiente.
    if (checkOut.getTime() <= checkIn.getTime()) {
      checkOut = new Date(checkOut.getTime() + 24 * 60 * 60 * 1000);
    }

    const hoursWorked = new Prisma.Decimal(checkOut.getTime() - checkIn.getTime())
      .div(1000 * 60 * 60)
      .toDecimalPlaces(2);

    if (hoursWorked.greaterThan(MAX_SHIFT_HOURS)) {
      throw new Error(
        `El turno calculado da ${hoursWorked.toFixed(2)} horas, que supera el máximo esperado. ` +
          `Revisá la hora de salida (¿pusiste AM en vez de PM?).`
      );
    }

    return { checkIn, checkOut, hoursWorked };
  }

  static calcAmountCents(totalHours: Prisma.Decimal, hourlyRateCents: number): number {
    return totalHours.mul(hourlyRateCents).round().toNumber();
  }

  static async upsertDailyEntry(input: {
    employeeId: string;
    workDate: Date;
    checkInTime: string;
    checkOutTime: string;
  }) {
    const workDate = new Date(
      Date.UTC(input.workDate.getUTCFullYear(), input.workDate.getUTCMonth(), input.workDate.getUTCDate())
    );
    const period = periodStart(workDate);

    const alreadyPaid = await prisma.employeeHoursPayment.findUnique({
      where: { employeeId_period: { employeeId: input.employeeId, period } },
    });
    if (alreadyPaid) {
      throw new Error("Este mes ya fue marcado como pagado, no se puede modificar la carga de horas.");
    }

    const { checkIn, checkOut, hoursWorked } = HoursService.computeShiftHours(
      workDate,
      input.checkInTime,
      input.checkOutTime
    );

    return prisma.employeeHoursEntry.upsert({
      where: { employeeId_workDate: { employeeId: input.employeeId, workDate } },
      create: { employeeId: input.employeeId, workDate, checkIn, checkOut, hoursWorked },
      update: { checkIn, checkOut, hoursWorked },
    });
  }

  static async listMonthEntries(employeeId: string, period: Date) {
    const start = periodStart(period);
    const end = periodEnd(start);

    const entries = await prisma.employeeHoursEntry.findMany({
      where: { employeeId, workDate: { gte: start, lte: end } },
      orderBy: { workDate: "asc" },
    });
    const totalHours = entries.reduce((sum, e) => sum.add(e.hoursWorked), new Prisma.Decimal(0));

    return { entries, totalHours, period: start };
  }

  static async monthlySummaryForAllEmployees(period: Date, db: DbClient = prisma) {
    const start = periodStart(period);
    const end = periodEnd(start);

    const employees = await db.employee.findMany({
      where: {
        isActive: true,
        role: { in: [EmployeeRole.ASOCIADO, EmployeeRole.CAJA_LOCAL, EmployeeRole.ADMINISTRATIVO] },
      },
      select: { id: true, displayName: true, hourlyRateCents: true, paymentType: true, monthlySalaryCents: true },
      orderBy: { displayName: "asc" },
    });
    const employeeIds = employees.map((e) => e.id);

    const entries = await db.employeeHoursEntry.findMany({
      where: { employeeId: { in: employeeIds }, workDate: { gte: start, lte: end } },
    });
    const hoursByEmployee = new Map<string, Prisma.Decimal>();
    for (const entry of entries) {
      const current = hoursByEmployee.get(entry.employeeId) ?? new Prisma.Decimal(0);
      hoursByEmployee.set(entry.employeeId, current.add(entry.hoursWorked));
    }

    const payments = await db.employeeHoursPayment.findMany({
      where: { employeeId: { in: employeeIds }, period: start },
    });
    const paymentByEmployee = new Map(payments.map((p) => [p.employeeId, p]));

    return employees.map((employee) => {
      const totalHours = hoursByEmployee.get(employee.id) ?? new Prisma.Decimal(0);
      const amountCents =
        employee.paymentType === EmployeePaymentType.FIXED_MONTHLY
          ? employee.monthlySalaryCents
          : employee.hourlyRateCents != null
            ? HoursService.calcAmountCents(totalHours, employee.hourlyRateCents)
            : null;
      const payment = paymentByEmployee.get(employee.id) ?? null;

      return {
        employee,
        totalHours,
        amountCents,
        isPaid: payment !== null,
        paidAt: payment?.paidAt ?? null,
        paidAmountCents: payment?.amountCents ?? null,
      };
    });
  }

  // Suma cuánto se debe a TODOS los empleados de "Sueldos Operativos"
  // (ASOCIADO/CAJA_LOCAL/ADMINISTRATIVO) en un período — es lo que lee Costos
  // Fijos como monto a pagar de "Sueldos Operativos" (ver CostoFijo.linkedToHoras).
  // Excluye a los que ya están
  // congelados/pagados para ese período (row.isPaid) — si no, un empleado ya
  // saldado seguiría inflando el total a pagar del mes siguiente.
  static async totalOwedForPeriod(period: Date, db: DbClient = prisma): Promise<number> {
    const summary = await HoursService.monthlySummaryForAllEmployees(period, db);
    return summary.reduce((sum, row) => sum + (row.isPaid ? 0 : row.amountCents ?? 0), 0);
  }

  // Congela (crea el snapshot EmployeeHoursPayment) de cada empleado operativo
  // que todavía no esté congelado para el período — igual que hacía antes el
  // botón "Marcar pagado" por empleado, pero ahora se dispara automáticamente
  // desde CostosFijosService.payPeriod cuando el total de "Sueldos Operativos"
  // de ese mes queda completamente pagado. Empleados sin tarifa/sueldo
  // definido (amountCents null) se saltean, no hay nada que congelar.
  static async freezeAllForPeriod(period: Date, createdByEmployeeId: string, db: DbClient = prisma): Promise<void> {
    const start = periodStart(period);
    const summary = await HoursService.monthlySummaryForAllEmployees(start, db);

    for (const row of summary) {
      if (row.isPaid || row.amountCents == null) continue;

      if (row.employee.paymentType === EmployeePaymentType.FIXED_MONTHLY) {
        await db.employeeHoursPayment.create({
          data: {
            employeeId: row.employee.id,
            period: start,
            paymentType: EmployeePaymentType.FIXED_MONTHLY,
            monthlySalaryCentsSnapshot: row.employee.monthlySalaryCents,
            amountCents: row.amountCents,
            createdByEmployeeId,
          },
        });
      } else {
        await db.employeeHoursPayment.create({
          data: {
            employeeId: row.employee.id,
            period: start,
            paymentType: EmployeePaymentType.HOURLY,
            hoursSnapshot: row.totalHours,
            hourlyRateCentsSnapshot: row.employee.hourlyRateCents,
            amountCents: row.amountCents,
            createdByEmployeeId,
          },
        });
      }
    }
  }

  static async listPaymentHistory(params: { employeeId?: string; from?: Date; to?: Date }) {
    return prisma.employeeHoursPayment.findMany({
      where: {
        employeeId: params.employeeId,
        period: { gte: params.from, lte: params.to },
      },
      include: { employee: { select: { displayName: true } } },
      orderBy: [{ period: "desc" }, { employee: { displayName: "asc" } }],
    });
  }
}
