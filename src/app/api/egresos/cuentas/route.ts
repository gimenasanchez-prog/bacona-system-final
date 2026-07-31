import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CashBoxKind } from "@prisma/client";
import { z } from "zod";

import { LocalCashBoxService } from "@/modules/caja_local/services/localCashBoxService";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA" && role !== "ADMINISTRATIVO") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const kindParam = searchParams.get("kind");
    const kind: CashBoxKind = kindParam === "EFECTIVO" ? "EFECTIVO" : "CUENTA_BANCARIA";
    const referenceDateParam = searchParams.get("referenceDate");
    const referenceDate = referenceDateParam ? new Date(referenceDateParam) : new Date();
    const boxes = await LocalCashBoxService.listBoxesByKind(kind);
    const withBalance = await Promise.all(
      boxes.map(async (box) => ({
        ...box,
        balanceCents: await LocalCashBoxService.getLocalCashBalance(box.id),
        reconciliation:
          kind === "CUENTA_BANCARIA"
            ? await LocalCashBoxService.getReconciliationSummary(box.id, referenceDate)
            : null,
        paymentMethodConfigs:
          kind === "CUENTA_BANCARIA" ? await LocalCashBoxService.getPaymentMethodConfigs(box.id) : [],
      }))
    );
    return NextResponse.json({ items: withBalance });
  } catch (err) {
    console.error("[/api/egresos/cuentas GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

const CreateSchema = z.object({ name: z.string().min(1) });

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  if (role !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const account = await LocalCashBoxService.createBankAccount(parsed.data.name);
    return NextResponse.json(account);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear la cuenta.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
