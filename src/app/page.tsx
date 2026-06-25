import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

import { IdentifyForm } from "./IdentifyForm";
import { clearIdentityAction } from "@/modules/caja/actions/identifyAction";

function NavButton({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          : "inline-flex rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50"
      }
    >
      {label}
    </Link>
  );
}

export default async function HomePage() {
  const jar = await cookies();
  const role = jar.get("bcn_role")?.value;
  const hasSession = !!jar.get("bcn_cashSessionId")?.value;

  if (!role) {
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, role: true },
      orderBy: { displayName: "asc" },
    });
    return (
      <main className="mx-auto max-w-lg space-y-3 pt-8">
        <h1 className="text-xl font-semibold">¿Quién sos?</h1>
        <p className="text-sm text-neutral-600">Tocá tu nombre para entrar.</p>
        <IdentifyForm employees={employees} />
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">BACOÑA</h1>
        <form action={clearIdentityAction}>
          <button type="submit" className="rounded-md border px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-50">
            Cambiar usuario
          </button>
        </form>
      </div>

      {role === "GERENCIA" && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Gestión</div>
          <div className="flex flex-wrap gap-2">
            <NavButton href="/rentabilidad" label="Rentabilidad" primary />
            <NavButton href="/caja/consolidado" label="Consolidado de Caja" primary />
            <NavButton href="/caja/local" label="Caja BCÑ" primary />
            <NavButton href="/cuentas-corrientes" label="Cuentas Corrientes" />
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Operación</div>
          <div className="flex flex-wrap gap-2">
            {hasSession ? (
              <NavButton href="/pos" label="Ventas" primary />
            ) : (
              <NavButton href="/caja/abrir" label="Abrir turno para vender" />
            )}
            {hasSession && <NavButton href="/caja/turno" label="Mi turno" />}
            <NavButton href="/stock" label="Stock" />
            <NavButton href="/compras" label="Compras" />
            <NavButton href="/produccion" label="Producción" />
            <NavButton href="/mermas" label="Mermas" />
          </div>
        </div>
      )}

      {role === "CAJA_LOCAL" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {hasSession ? (
              <NavButton href="/pos" label="Ir a Ventas" primary />
            ) : (
              <NavButton href="/caja/abrir" label="Abrir turno" primary />
            )}
            {hasSession && <NavButton href="/caja/turno" label="Mi turno" />}
            <NavButton href="/caja/local" label="Caja BCÑ" />
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Operación</div>
          <div className="flex flex-wrap gap-2">
            <NavButton href="/stock" label="Stock" />
            <NavButton href="/produccion" label="Producción" />
            <NavButton href="/mermas" label="Mermas" />
          </div>
        </div>
      )}

      {role === "ADMINISTRATIVO" && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Administración</div>
          <div className="flex flex-wrap gap-2">
            <NavButton href="/cuentas-corrientes" label="Cuentas Corrientes" primary />
            <NavButton href="/caja/consolidado" label="Consolidado de Caja" />
            <NavButton href="/rentabilidad" label="Rentabilidad" />
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Operación</div>
          <div className="flex flex-wrap gap-2">
            <NavButton href="/stock" label="Stock" />
          </div>
        </div>
      )}

      {role === "ASOCIADO" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {hasSession ? (
              <NavButton href="/pos" label="Ir a Ventas" primary />
            ) : (
              <NavButton href="/caja/abrir" label="Abrir turno" primary />
            )}
            {hasSession && <NavButton href="/caja/turno" label="Mi turno" />}
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Operación</div>
          <div className="flex flex-wrap gap-2">
            <NavButton href="/stock" label="Stock" />
            <NavButton href="/produccion" label="Producción" />
            <NavButton href="/mermas" label="Mermas" />
          </div>
        </div>
      )}
    </main>
  );
}
