import { EmployeeRole, Prisma } from "@prisma/client";

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

  static async monthlySummaryForAllEmployees(period: Date) {
    const start = periodStart(period);
    const end = periodEnd(start);

    const employees = await prisma.employee.findMany({
      where: { isActive: true, role: { in: [EmployeeRole.ASOCIADO, EmployeeRole.CAJA_LOCAL] } },
      select: { id: true, displayName: true, hourlyRateCents: true },
      orderBy: { displayName: "asc" },
    });
    const employeeIds = employees.map((e) => e.id);

    const entries = await prisma.employeeHoursEntry.findMany({
      where: { employeeId: { in: employeeIds }, workDate: { gte: start, lte: end } },
    });
    const hoursByEmployee = new Map<string, Prisma.Decimal>();
    for (const entry of entries) {
      const current = hoursByEmployee.get(entry.employeeId) ?? new Prisma.Decimal(0);
      hoursByEmployee.set(entry.employeeId, current.add(entry.hoursWorked));
    }

    const payments = await prisma.employeeHoursPayment.findMany({
      where: { employeeId: { in: employeeIds }, period: start },
    });
    const paymentByEmployee = new Map(payments.map((p) => [p.employeeId, p]));

    return employees.map((employee) => {
      const totalHours = hoursByEmployee.get(employee.id) ?? new Prisma.Decimal(0);
      const amountCents =
        employee.hourlyRateCents != null ? HoursService.calcAmountCents(totalHours, employee.hourlyRateCents) : null;
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

  static async markPeriodPaid(input: { employeeId: string; period: Date; createdByEmployeeId: string }) {
    const start = periodStart(input.period);

    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { hourlyRateCents: true },
    });
    if (!employee) throw new Error("Empleado no encontrado.");
    if (employee.hourlyRateCents == null) {
      throw new Error("Definí la tarifa por hora del empleado antes de marcar el mes como pagado.");
    }

    const existing = await prisma.employeeHoursPayment.findUnique({
      where: { employeeId_period: { employeeId: input.employeeId, period: start } },
    });
    if (existing) {
      throw new Error("Este período ya fue marcado como pagado.");
    }

    const { totalHours } = await HoursService.listMonthEntries(input.employeeId, start);
    const amountCents = HoursService.calcAmountCents(totalHours, employee.hourlyRateCents);

    return prisma.employeeHoursPayment.create({
      data: {
        employeeId: input.employeeId,
        period: start,
        hoursSnapshot: totalHours,
        hourlyRateCentsSnapshot: employee.hourlyRateCents,
        amountCents,
        createdByEmployeeId: input.createdByEmployeeId,
      },
    });
  }
}
