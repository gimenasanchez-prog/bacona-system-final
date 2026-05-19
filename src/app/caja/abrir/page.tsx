import { prisma } from "@/lib/prisma";
import { OpenCashSessionForm } from "./OpenCashSessionForm";

export default async function AbrirCajaPage() {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold">Abrir Caja</div>
        <div className="mt-1 text-sm text-neutral-600">
          Iniciá tu turno seleccionando asociada/o y turno. Se impide abrir más de una caja activa por persona y turno.
        </div>

        <div className="mt-4">
          <OpenCashSessionForm employees={employees} />
        </div>
      </div>
    </div>
  );
}

