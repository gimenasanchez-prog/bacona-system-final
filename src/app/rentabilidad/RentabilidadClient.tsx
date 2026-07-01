"use client";

import { useCallback, useEffect, useState } from "react";
import { formatArsFromCents } from "@/lib/money";

// ─── Types ───────────────────────────────────────────────────────────────────

type Analisis = {
  posRevenue: number;
  ccRevenue: number;
  ingresoReal: number;
  cogsEstimado: number;
  cogsEffPct: number;
  costosVariables: number;
  costosFijos: number;
  puntoEquilibrio: number | null;
  targetDiario: number | null;
  brecha: number | null;
  pctEquilibrio: number | null;
  daysInMonth: number;
};

type BreachDay = {
  date: string;
  ingresoReal: number;
  targetDiario: number;
  brecha: number;
};

type BreachData = { series: BreachDay[]; targetDiario: number | null };

type Palanca = {
  key: string;
  label: string;
  valorActual: number;
  unidad: string;
  descripcion: string;
  impacto: string;
  deltaMensual: number;
};

type ScenarioResult = {
  revenue: number;
  cogs: number;
  varCosts: number;
  costosFijos: number;
  totalCosts: number;
  resultado: number;
};

type Escenarios = {
  avgRevenue: number;
  avgVarCosts: number;
  costosFijos: number;
  conservador: ScenarioResult;
  base: ScenarioResult;
  optimista: ScenarioResult;
  puntoEquilibrio: number | null;
};

type CostoFijo = {
  id: string;
  nombre: string;
  categoria: string;
  amountCents: number;
  isActive: boolean;
  validFrom: string;
  notas: string | null;
};

type MargenConfigItem = {
  categoryId: string;
  categoryName: string;
  cogsPercent: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORIAS_COSTO = [
  "ALQUILER",
  "SALARIOS",
  "SERVICIOS_BASICOS",
  "SEGUROS",
  "IMPUESTOS_FIJOS",
  "SUSCRIPCIONES",
  "OTRO",
] as const;

const CATEGORIA_LABEL: Record<string, string> = {
  ALQUILER: "Alquiler",
  SALARIOS: "Salarios",
  SERVICIOS_BASICOS: "Servicios básicos",
  SEGUROS: "Seguros",
  IMPUESTOS_FIJOS: "Impuestos fijos",
  SUSCRIPCIONES: "Suscripciones",
  OTRO: "Otro",
};

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

function nextMonthStr(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pctColor(pct: number | null) {
  if (pct === null) return "bg-neutral-200";
  if (pct >= 100) return "bg-green-500";
  if (pct >= 80) return "bg-yellow-400";
  return "bg-red-500";
}

function pctBadge(pct: number | null) {
  if (pct === null) return "text-neutral-400";
  if (pct >= 100) return "text-green-700";
  if (pct >= 80) return "text-yellow-700";
  return "text-red-700";
}

function resultadoBadge(v: number) {
  if (v > 0) return "text-green-700 font-semibold";
  if (v < 0) return "text-red-700 font-semibold";
  return "text-neutral-700";
}

// ─── Chart ─────────────────────────────────────────────────────────────────

function BrechaChart({ data }: { data: BreachData }) {
  if (!data.series?.length) {
    return <p className="text-sm text-neutral-400 py-6 text-center">Sin datos de ventas para este mes.</p>;
  }
  const target = data.targetDiario ?? 0;
  const maxVal = Math.max(...data.series.map((d) => d.ingresoReal), target * 1.1, 1);
  const BAR_W = 24;
  const GAP = 4;
  const H = 150;
  const W = data.series.length * (BAR_W + GAP);
  const targetY = H - (target / maxVal) * H;

  return (
    <div className="overflow-x-auto pb-2">
      <svg width={W} height={H + 24} style={{ minWidth: W }}>
        {data.series.map((day, i) => {
          const barH = Math.max(2, (day.ingresoReal / maxVal) * H);
          const x = i * (BAR_W + GAP);
          const isGood = day.ingresoReal >= target;
          return (
            <g key={day.date}>
              <title>{`${day.date}: ${formatArsFromCents(day.ingresoReal)}`}</title>
              <rect
                x={x}
                y={H - barH}
                width={BAR_W}
                height={barH}
                fill={isGood ? "#4ade80" : "#f87171"}
                rx={3}
              />
              <text
                x={x + BAR_W / 2}
                y={H + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
              >
                {day.date.slice(8)}
              </text>
            </g>
          );
        })}
        {target > 0 && (
          <line
            x1={0}
            y1={targetY}
            x2={W}
            y2={targetY}
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="5,3"
          />
        )}
      </svg>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function RentabilidadClient({ isGerencia }: { isGerencia: boolean }) {
  const [month, setMonth] = useState(currentMonthStr);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [brecha, setBrecha] = useState<BreachData | null>(null);
  const [palancas, setPalancas] = useState<Palanca[] | null>(null);
  const [escenarios, setEscenarios] = useState<Escenarios | null>(null);
  const [costosFijos, setCostosFijos] = useState<CostoFijo[]>([]);
  const [margenConfig, setMargenConfig] = useState<MargenConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  // Add-costo form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    nombre: "",
    categoria: "SALARIOS",
    amountARS: "",
    validFrom: new Date().toISOString().slice(0, 10),
    notas: "",
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  // COGS edit mode
  const [cogsEditing, setCogsEditing] = useState(false);
  const [cogsDraft, setCogsDraft] = useState<Record<string, string>>({});
  const [cogsSaving, setCogsSaving] = useState(false);


  const safeJson = async (url: string) => {
    const r = await fetch(url);
    const text = await r.text();
    if (!text) throw new Error(`${url} → vacío (status ${r.status})`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${url} → no es JSON (${r.status}): ${text.slice(0, 120)}`);
    }
    if (!r.ok) {
      const msg = parsed && typeof parsed === "object" && "error" in parsed ? (parsed as { error: string }).error : text.slice(0, 200);
      throw new Error(`${url} → ${r.status}: ${msg}`);
    }
    return parsed;
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const nm = nextMonthStr(month);

    const errors: string[] = [];

    const [aRes, bRes, pRes, eRes, cfRes, mcRes] = await Promise.allSettled([
      safeJson(`/api/rentabilidad/analisis?month=${month}`),
      safeJson(`/api/rentabilidad/brecha-diaria?month=${month}`),
      safeJson(`/api/rentabilidad/palancas?month=${month}`),
      safeJson(`/api/rentabilidad/escenarios?month=${nm}`),
      safeJson(`/api/rentabilidad/costos-fijos`),
      safeJson(`/api/rentabilidad/margen-config`),
    ]);

    if (aRes.status === "fulfilled") setAnalisis(aRes.value as Analisis);
    else errors.push(`analisis: ${aRes.reason}`);

    if (bRes.status === "fulfilled") setBrecha(bRes.value as BreachData);
    else errors.push(`brecha-diaria: ${bRes.reason}`);

    if (pRes.status === "fulfilled") setPalancas(Array.isArray(pRes.value) ? (pRes.value as Palanca[]) : []);
    else errors.push(`palancas: ${pRes.reason}`);

    if (eRes.status === "fulfilled") setEscenarios(eRes.value as Escenarios);
    else errors.push(`escenarios: ${eRes.reason}`);

    if (cfRes.status === "fulfilled") setCostosFijos(((cfRes.value as any).items ?? []) as CostoFijo[]);
    else errors.push(`costos-fijos: ${cfRes.reason}`);

    if (mcRes.status === "fulfilled") setMargenConfig(((mcRes.value as any).items ?? []) as MargenConfigItem[]);
    else errors.push(`margen-config: ${mcRes.reason}`);

    if (errors.length) setLoadError(errors.join(" · "));
    setLoading(false);
  }, [month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAddCosto() {
    setAddError(null);
    const amountARS = parseFloat(addForm.amountARS);
    if (!addForm.nombre.trim() || isNaN(amountARS) || amountARS <= 0) {
      setAddError("Completá nombre y monto válido.");
      return;
    }
    setAddSaving(true);
    const res = await fetch("/api/rentabilidad/costos-fijos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: addForm.nombre.trim(),
        categoria: addForm.categoria,
        amountCents: Math.round(amountARS * 100),
        validFrom: new Date(`${addForm.validFrom}T00:00:00`).toISOString(),
        notas: addForm.notas.trim() || undefined,
      }),
    });
    setAddSaving(false);
    if (!res.ok) {
      setAddError("Error al guardar. Intentá de nuevo.");
      return;
    }
    setShowAddForm(false);
    setAddForm({ nombre: "", categoria: "SALARIOS", amountARS: "", validFrom: new Date().toISOString().slice(0, 10), notas: "" });
    await loadData();
  }

  async function handleDeactivate(id: string) {
    await fetch("/api/rentabilidad/costos-fijos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action: "deactivate" }),
    });
    await loadData();
  }

  function startCogsEdit() {
    const draft: Record<string, string> = {};
    margenConfig.forEach((item) => {
      draft[item.categoryId] = item.cogsPercent != null ? String(item.cogsPercent) : "";
    });
    setCogsDraft(draft);
    setCogsEditing(true);
  }

  async function saveCogsConfig() {
    setCogsSaving(true);
    await Promise.all(
      Object.entries(cogsDraft)
        .filter(([, v]) => v !== "" && !isNaN(parseFloat(v)))
        .map(([categoryId, v]) =>
          fetch("/api/rentabilidad/margen-config", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ categoryId, cogsPercent: parseFloat(v) }),
          })
        )
    );
    setCogsSaving(false);
    setCogsEditing(false);
    await loadData();
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const noCostosConfig = costosFijos.length === 0 && !loading;
  const noCogsConfig = margenConfig.every((c) => c.cogsPercent == null) && !loading;

  return (
    <main className="min-h-screen bg-neutral-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 px-4 py-4">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">Camino a la Rentabilidad</h1>
            <p className="text-sm text-neutral-500">Punto de equilibrio · Palancas · Escenarios</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-600">Período</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-neutral-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {/* Error */}
        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error cargando datos: {loadError}
          </div>
        )}

        {/* Setup warning */}
        {(noCostosConfig || noCogsConfig) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <strong>Falta configuración inicial:</strong>{" "}
            {noCostosConfig && "No hay costos fijos cargados. "}
            {noCogsConfig && "No hay % COGS configurado por categoría. "}
            Abrí <button className="underline font-medium" onClick={() => setConfigOpen(true)}>Configuración</button> para cargarlos.
          </div>
        )}

        {/* ─── Configuración ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-neutral-200">
          <button
            className="w-full flex items-center justify-between px-5 py-4 text-left"
            onClick={() => setConfigOpen((o) => !o)}
          >
            <span className="font-medium text-neutral-800">Configuración</span>
            <span className="text-neutral-400 text-lg">{configOpen ? "▲" : "▼"}</span>
          </button>

          {configOpen && (
            <div className="border-t border-neutral-100 px-5 pb-5 space-y-6">
              {/* Costos fijos */}
              <div>
                <div className="flex items-center justify-between mt-4 mb-2">
                  <h3 className="text-sm font-semibold text-neutral-700">Costos fijos mensuales</h3>
                  {isGerencia && (
                    <button
                      className="text-xs bg-neutral-900 text-white rounded px-3 py-1"
                      onClick={() => setShowAddForm((s) => !s)}
                    >
                      {showAddForm ? "Cancelar" : "+ Agregar"}
                    </button>
                  )}
                </div>

                {showAddForm && isGerencia && (
                  <div className="bg-neutral-50 rounded-lg p-4 mb-3 space-y-3 border border-neutral-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
                        <input
                          className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm"
                          placeholder="ej: Salarios mozos"
                          value={addForm.nombre}
                          onChange={(e) => setAddForm((f) => ({ ...f, nombre: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
                        <select
                          className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white"
                          value={addForm.categoria}
                          onChange={(e) => setAddForm((f) => ({ ...f, categoria: e.target.value }))}
                        >
                          {CATEGORIAS_COSTO.map((c) => (
                            <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">Monto mensual (ARS)</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm"
                          placeholder="ej: 350000"
                          value={addForm.amountARS}
                          onChange={(e) => setAddForm((f) => ({ ...f, amountARS: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">Vigente desde</label>
                        <input
                          type="date"
                          className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm"
                          value={addForm.validFrom}
                          onChange={(e) => setAddForm((f) => ({ ...f, validFrom: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 block mb-1">Notas (opcional)</label>
                      <input
                        className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm"
                        value={addForm.notas}
                        onChange={(e) => setAddForm((f) => ({ ...f, notas: e.target.value }))}
                      />
                    </div>
                    {addError && <p className="text-xs text-red-600">{addError}</p>}
                    <button
                      className="bg-neutral-900 text-white text-sm rounded px-4 py-1.5 disabled:opacity-50"
                      disabled={addSaving}
                      onClick={handleAddCosto}
                    >
                      {addSaving ? "Guardando…" : "Guardar costo"}
                    </button>
                  </div>
                )}

                {costosFijos.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-3">No hay costos fijos configurados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-neutral-500 border-b border-neutral-100">
                          <th className="text-left py-1.5 font-medium">Nombre</th>
                          <th className="text-left py-1.5 font-medium">Categoría</th>
                          <th className="text-right py-1.5 font-medium">Monto/mes</th>
                          <th className="text-left py-1.5 font-medium pl-4">Desde</th>
                          {isGerencia && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {costosFijos.map((cf) => (
                          <tr key={cf.id} className="border-b border-neutral-50">
                            <td className="py-2 text-neutral-800">{cf.nombre}</td>
                            <td className="py-2 text-neutral-500">{CATEGORIA_LABEL[cf.categoria] ?? cf.categoria}</td>
                            <td className="py-2 text-right font-mono text-neutral-900">{formatArsFromCents(cf.amountCents)}</td>
                            <td className="py-2 pl-4 text-neutral-400 text-xs">
                              {new Date(cf.validFrom).toLocaleDateString("es-AR")}
                            </td>
                            {isGerencia && (
                              <td className="py-2 text-right">
                                <button
                                  className="text-xs text-red-500 hover:text-red-700"
                                  onClick={() => handleDeactivate(cf.id)}
                                >
                                  Quitar
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        <tr className="bg-neutral-50">
                          <td colSpan={2} className="py-2 text-xs font-semibold text-neutral-600">TOTAL FIJOS</td>
                          <td className="py-2 text-right font-mono font-bold text-neutral-900">
                            {formatArsFromCents(costosFijos.reduce((s, f) => s + f.amountCents, 0))}
                          </td>
                          <td colSpan={isGerencia ? 2 : 1} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* COGS config */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-neutral-700">% Costo sobre venta (COGS) por categoría</h3>
                  {isGerencia && !cogsEditing && (
                    <button className="text-xs text-neutral-600 border border-neutral-300 rounded px-3 py-1" onClick={startCogsEdit}>
                      Editar
                    </button>
                  )}
                  {isGerencia && cogsEditing && (
                    <div className="flex gap-2">
                      <button className="text-xs text-neutral-500" onClick={() => setCogsEditing(false)}>Cancelar</button>
                      <button
                        className="text-xs bg-neutral-900 text-white rounded px-3 py-1 disabled:opacity-50"
                        disabled={cogsSaving}
                        onClick={saveCogsConfig}
                      >
                        {cogsSaving ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mb-3">
                  Estimación del costo de lo vendido como % del precio de venta. Ej: si un sandwich cuesta $1050 y se vende a $3000, el COGS es 35%.
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-neutral-500 border-b border-neutral-100">
                      <th className="text-left py-1.5 font-medium">Categoría de producto</th>
                      <th className="text-right py-1.5 font-medium">COGS %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {margenConfig.map((item) => (
                      <tr key={item.categoryId} className="border-b border-neutral-50">
                        <td className="py-2 text-neutral-800">{item.categoryName}</td>
                        <td className="py-2 text-right">
                          {cogsEditing && isGerencia ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              className="w-20 border border-neutral-300 rounded px-2 py-0.5 text-sm text-right"
                              value={cogsDraft[item.categoryId] ?? ""}
                              onChange={(e) =>
                                setCogsDraft((d) => ({ ...d, [item.categoryId]: e.target.value }))
                              }
                              placeholder="—"
                            />
                          ) : (
                            <span className={item.cogsPercent != null ? "text-neutral-800 font-mono" : "text-neutral-300"}>
                              {item.cogsPercent != null ? `${item.cogsPercent}%` : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ─── Punto de Equilibrio ──────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-neutral-200 p-5">
          <h2 className="font-semibold text-neutral-800 mb-4">
            Punto de Equilibrio — {monthLabel(month)}
          </h2>

          {loading ? (
            <p className="text-sm text-neutral-400">Cargando…</p>
          ) : analisis ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <KpiCard
                  label="Costos fijos"
                  value={formatArsFromCents(analisis.costosFijos)}
                  sub={analisis.daysInMonth > 0 ? `${formatArsFromCents(Math.round(analisis.costosFijos / analisis.daysInMonth))}/día` : undefined}
                  tone="neutral"
                />
                <KpiCard
                  label="COGS estimado"
                  value={formatArsFromCents(analisis.cogsEstimado)}
                  sub={`${analisis.cogsEffPct}% de lo vendido`}
                  tone="neutral"
                />
                <KpiCard
                  label="Ventas del período"
                  value={formatArsFromCents(analisis.ingresoReal)}
                  sub={`POS ${formatArsFromCents(analisis.posRevenue)} · CC ${formatArsFromCents(analisis.ccRevenue)}`}
                  tone="neutral"
                />
                <KpiCard
                  label="Necesitás vender"
                  value={analisis.puntoEquilibrio != null ? formatArsFromCents(analisis.puntoEquilibrio) : "—"}
                  sub={analisis.targetDiario != null ? `${formatArsFromCents(analisis.targetDiario)}/día` : undefined}
                  tone={analisis.pctEquilibrio != null && analisis.pctEquilibrio >= 100 ? "green" : "red"}
                />
              </div>

              {/* Progress */}
              {analisis.puntoEquilibrio != null && (
                <div>
                  <div className="flex justify-between text-xs text-neutral-500 mb-1">
                    <span>Progreso hacia equilibrio</span>
                    <span className={pctBadge(analisis.pctEquilibrio)}>
                      {analisis.pctEquilibrio ?? 0}%
                      {analisis.brecha != null && (
                        <> · {analisis.brecha >= 0 ? "+" : ""}{formatArsFromCents(analisis.brecha)}</>
                      )}
                    </span>
                  </div>
                  <div className="h-3 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pctColor(analisis.pctEquilibrio)}`}
                      style={{ width: `${Math.min(analisis.pctEquilibrio ?? 0, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-neutral-400 mt-1">
                    <span>$0</span>
                    <span>{formatArsFromCents(analisis.puntoEquilibrio)}</span>
                  </div>
                </div>
              )}

              {analisis.costosFijos === 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  Sin costos fijos cargados — el punto de equilibrio no puede calcularse. Configurá los costos primero.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-red-500">Error cargando datos.</p>
          )}
        </section>

        {/* ─── Brecha Diaria ────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-neutral-200 p-5">
          <h2 className="font-semibold text-neutral-800 mb-1">Brecha Diaria</h2>
          <p className="text-xs text-neutral-400 mb-4">
            Barra verde = superó el objetivo · roja = no llegó · línea = objetivo diario
          </p>

          {loading ? (
            <p className="text-sm text-neutral-400">Cargando…</p>
          ) : brecha ? (
            <>
              <BrechaChart data={brecha} />
              {(brecha.series?.length ?? 0) > 0 && analisis && (
                <div className="mt-3 pt-3 border-t border-neutral-100 flex flex-wrap gap-4 text-sm">
                  <span className="text-neutral-600">
                    Brecha acumulada:{" "}
                    <span className={resultadoBadge(analisis.brecha ?? 0)}>
                      {analisis.brecha != null
                        ? `${analisis.brecha >= 0 ? "+" : ""}${formatArsFromCents(analisis.brecha)}`
                        : "—"}
                    </span>
                  </span>
                  <span className="text-neutral-400">
                    Objetivo diario: {brecha.targetDiario != null ? formatArsFromCents(brecha.targetDiario) : "—"}
                  </span>
                  <span className="text-neutral-400">
                    Días con ventas: {brecha.series.length}
                  </span>
                  <span className="text-neutral-400">
                    Días ok: {brecha.series.filter((d) => d.brecha >= 0).length}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-red-500">Error cargando datos.</p>
          )}
        </section>

        {/* ─── Palancas ────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-neutral-200 p-5">
          <h2 className="font-semibold text-neutral-800 mb-1">Palancas de Rentabilidad</h2>
          <p className="text-xs text-neutral-400 mb-4">Efecto estimado de mejorar cada variable un 10%</p>

          {loading ? (
            <p className="text-sm text-neutral-400">Cargando…</p>
          ) : palancas && palancas.length > 0 ? (
            (() => {
              const maxDelta = Math.max(...palancas.map((p) => p.deltaMensual));
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {palancas.map((p) => (
                    <div key={p.key} className="border border-neutral-200 rounded-lg p-4 relative">
                      {p.deltaMensual === maxDelta && maxDelta > 0 && (
                        <span className="absolute top-3 right-3 text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">
                          Mayor impacto
                        </span>
                      )}
                      <p className="text-xs text-neutral-500 mb-1">{p.impacto}</p>
                      <p className="text-sm font-medium text-neutral-800 mb-2">{p.label}</p>
                      <p className="text-xs text-neutral-400 mb-3">{p.descripcion}</p>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-semibold text-green-700">
                          +{formatArsFromCents(p.deltaMensual)}/mes
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          ) : (
            <p className="text-sm text-neutral-400">Sin datos suficientes para calcular palancas.</p>
          )}
        </section>

        {/* ─── Escenarios ───────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-neutral-200 p-5">
          <h2 className="font-semibold text-neutral-800 mb-1">
            Escenarios — {monthLabel(nextMonthStr(month))}
          </h2>
          <p className="text-xs text-neutral-400 mb-4">
            Proyección basada en el promedio de los últimos 3 meses
          </p>

          {loading ? (
            <p className="text-sm text-neutral-400">Cargando…</p>
          ) : escenarios ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500 border-b border-neutral-100">
                    <th className="text-left py-2 font-medium">Concepto</th>
                    <th className="text-right py-2 font-medium text-blue-600">Conservador</th>
                    <th className="text-right py-2 font-medium text-neutral-700">Base</th>
                    <th className="text-right py-2 font-medium text-green-600">Optimista</th>
                  </tr>
                </thead>
                <tbody>
                  <ScenarioRow label="Ingresos esperados" c={escenarios.conservador.revenue} b={escenarios.base.revenue} o={escenarios.optimista.revenue} />
                  <ScenarioRow label="COGS estimado" c={escenarios.conservador.cogs} b={escenarios.base.cogs} o={escenarios.optimista.cogs} />
                  <ScenarioRow label="Costos variables" c={escenarios.conservador.varCosts} b={escenarios.base.varCosts} o={escenarios.optimista.varCosts} />
                  <ScenarioRow label="Costos fijos" c={escenarios.conservador.costosFijos} b={escenarios.base.costosFijos} o={escenarios.optimista.costosFijos} />
                  <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                    <td className="py-2.5 text-sm font-semibold text-neutral-800">Resultado neto</td>
                    <td className={`py-2.5 text-right font-mono font-bold ${resultadoBadge(escenarios.conservador.resultado)}`}>
                      {escenarios.conservador.resultado >= 0 ? "+" : ""}{formatArsFromCents(escenarios.conservador.resultado)}
                    </td>
                    <td className={`py-2.5 text-right font-mono font-bold ${resultadoBadge(escenarios.base.resultado)}`}>
                      {escenarios.base.resultado >= 0 ? "+" : ""}{formatArsFromCents(escenarios.base.resultado)}
                    </td>
                    <td className={`py-2.5 text-right font-mono font-bold ${resultadoBadge(escenarios.optimista.resultado)}`}>
                      {escenarios.optimista.resultado >= 0 ? "+" : ""}{formatArsFromCents(escenarios.optimista.resultado)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-xs text-neutral-500">¿Llega al equilibrio?</td>
                    {[escenarios.conservador, escenarios.base, escenarios.optimista].map((s, i) => (
                      <td key={i} className="py-2 text-right">
                        {s.resultado >= 0 ? (
                          <span className="text-xs text-green-700 font-medium">✓ Sí</span>
                        ) : (
                          <span className="text-xs text-red-600">
                            Falta {formatArsFromCents(Math.abs(s.resultado))}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {escenarios.avgRevenue === 0 && (
                <p className="text-xs text-neutral-400 mt-3">
                  Sin historial de los últimos 3 meses — los escenarios usan $0 como base de ingresos.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-red-500">Error cargando datos.</p>
          )}
        </section>
      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "neutral" | "green" | "red";
}) {
  const border =
    tone === "green"
      ? "border-green-200 bg-green-50"
      : tone === "red"
        ? "border-red-200 bg-red-50"
        : "border-neutral-200 bg-white";
  const valueColor =
    tone === "green"
      ? "text-green-800"
      : tone === "red"
        ? "text-red-800"
        : "text-neutral-900";

  return (
    <div className={`rounded-lg border p-3 ${border}`}>
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-base font-semibold font-mono ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-400 mt-0.5 leading-tight">{sub}</p>}
    </div>
  );
}

function ScenarioRow({
  label,
  c,
  b,
  o,
}: {
  label: string;
  c: number;
  b: number;
  o: number;
}) {
  return (
    <tr className="border-b border-neutral-50">
      <td className="py-2 text-neutral-600">{label}</td>
      <td className="py-2 text-right font-mono text-blue-700">{formatArsFromCents(c)}</td>
      <td className="py-2 text-right font-mono text-neutral-800">{formatArsFromCents(b)}</td>
      <td className="py-2 text-right font-mono text-green-700">{formatArsFromCents(o)}</td>
    </tr>
  );
}
