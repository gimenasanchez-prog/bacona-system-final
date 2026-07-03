"use client";

import { useState } from "react";

type Role = "ASOCIADO" | "CAJA_LOCAL" | "GERENCIA" | "ADMINISTRATIVO";

type Employee = {
  id: string;
  displayName: string;
  role: Role;
  isActive: boolean;
};

const ROLE_LABELS: Record<Role, string> = {
  ASOCIADO: "Asociado",
  CAJA_LOCAL: "Caja Local",
  GERENCIA: "Gerencia",
  ADMINISTRATIVO: "Administrativo",
};

const ROLES: Role[] = ["ASOCIADO", "CAJA_LOCAL", "GERENCIA", "ADMINISTRATIVO"];

export function EmpleadosClient({ initial }: { initial: Employee[] }) {
  const [employees, setEmployees] = useState<Employee[]>(initial);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("ASOCIADO");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, data: Partial<Pick<Employee, "isActive" | "role">>) {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/gerencia/empleados/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Error al actualizar");
        return;
      }
      const { employee } = await res.json();
      setEmployees((prev) => prev.map((e) => (e.id === id ? employee : e)));
    } finally {
      setLoadingId(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/gerencia/empleados", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: newName.trim(), role: newRole }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Error al crear empleado");
        return;
      }
      const { employee } = await res.json();
      setEmployees((prev) => [employee, ...prev]);
      setNewName("");
      setNewRole("ASOCIADO");
    } finally {
      setCreating(false);
    }
  }

  const active = employees.filter((e) => e.isActive);
  const inactive = employees.filter((e) => !e.isActive);

  return (
    <div className="space-y-8">
      {/* Form nuevo empleado */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Nuevo empleado
        </h2>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">Nombre</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre completo"
              className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              style={{ minWidth: 200 }}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">Rol</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? "Agregando..." : "Agregar"}
          </button>
        </form>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Tabla activos */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Activos ({active.length})
        </h2>
        <EmployeeTable
          employees={active}
          loadingId={loadingId}
          onToggle={(id) => patch(id, { isActive: false })}
          onRoleChange={(id, role) => patch(id, { role })}
          toggleLabel="Desactivar"
          toggleClass="text-red-600 hover:underline"
        />
      </section>

      {/* Tabla inactivos */}
      {inactive.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Inactivos ({inactive.length})
          </h2>
          <EmployeeTable
            employees={inactive}
            loadingId={loadingId}
            onToggle={(id) => patch(id, { isActive: true })}
            onRoleChange={(id, role) => patch(id, { role })}
            toggleLabel="Reactivar"
            toggleClass="text-green-700 hover:underline"
          />
        </section>
      )}
    </div>
  );
}

function EmployeeTable({
  employees,
  loadingId,
  onToggle,
  onRoleChange,
  toggleLabel,
  toggleClass,
}: {
  employees: Employee[];
  loadingId: string | null;
  onToggle: (id: string) => void;
  onRoleChange: (id: string, role: Role) => void;
  toggleLabel: string;
  toggleClass: string;
}) {
  if (employees.length === 0) {
    return <p className="text-sm text-neutral-400">—</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="border-b bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-2 text-left">Nombre</th>
            <th className="px-4 py-2 text-left">Rol</th>
            <th className="px-4 py-2 text-left">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {employees.map((emp) => {
            const busy = loadingId === emp.id;
            return (
              <tr key={emp.id} className={busy ? "opacity-50" : ""}>
                <td className="px-4 py-3 font-medium">{emp.displayName}</td>
                <td className="px-4 py-3">
                  <select
                    value={emp.role}
                    disabled={busy}
                    onChange={(e) => onRoleChange(emp.id, e.target.value as Role)}
                    className="rounded border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-400"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggle(emp.id)}
                    disabled={busy}
                    className={`text-xs disabled:opacity-40 ${toggleClass}`}
                  >
                    {busy ? "Guardando..." : toggleLabel}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
