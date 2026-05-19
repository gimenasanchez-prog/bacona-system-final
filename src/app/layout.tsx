import "./globals.css";

export const dynamic = "force-dynamic";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

async function getActiveEmployee() {
  try {
    const jar = await cookies();
    const employeeId = jar.get("bcn_employeeId")?.value;
    const cashSessionId = jar.get("bcn_cashSessionId")?.value;
    if (!employeeId) return null;
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { displayName: true },
    });
    return employee ? { displayName: employee.displayName, cashSessionId: cashSessionId ?? null } : null;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const active = await getActiveEmployee();

  return (
    <html lang="es-AR">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <div className="sticky top-0 z-50 border-b bg-white">
          <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
            <Link href="/" className="text-sm font-semibold tracking-wide hover:opacity-70">
              BACOÑA
            </Link>
            {active ? (
              <Link
                href="/caja/turno"
                className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
              >
                {active.displayName}
              </Link>
            ) : (
              <Link
                href="/caja/abrir"
                className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-neutral-50"
              >
                Abrir turno
              </Link>
            )}
          </div>
        </div>
        <div className="mx-auto max-w-screen-2xl px-4 py-4">{children}</div>
      </body>
    </html>
  );
}

