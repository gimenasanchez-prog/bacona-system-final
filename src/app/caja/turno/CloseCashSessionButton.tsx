"use client";

export function CloseCashSessionButton() {
  return (
    <button
      type="submit"
      className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
      onClick={(e) => {
        if (!confirm("¿Cerrar turno? Esta acción guarda el cierre de caja.")) {
          e.preventDefault();
        }
      }}
    >
      Cerrar turno
    </button>
  );
}

