import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Cotización oficial (BCRA/BNA) del día, vía API pública gratuita de terceros
// (argentinadatos.com). Si no hay dato para hoy (fin de semana, feriado, o la
// fuente está caída), se prueba con días anteriores; si nada responde, se
// devuelve sin tipo de cambio en vez de romper la pantalla.
async function fetchOficialRateForDate(date: Date): Promise<{ venta: number; fecha: string } | null> {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  try {
    const res = await fetch(`https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/${yyyy}/${mm}/${dd}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.venta !== "number") return null;
    return { venta: data.venta, fecha: data.fecha };
  } catch {
    return null;
  }
}

export async function GET() {
  const jar = await cookies();
  if (jar.get("bcn_role")?.value !== "GERENCIA") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const attempt = new Date(today);
    attempt.setUTCDate(attempt.getUTCDate() - i);
    const rate = await fetchOficialRateForDate(attempt);
    if (rate) {
      return NextResponse.json(rate);
    }
  }

  return NextResponse.json({ error: "No se pudo obtener el tipo de cambio oficial." }, { status: 502 });
}
