"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PickerItem = { id: string; name: string; hint?: string; group?: string };

const MAX_RESULTS = 50;

/** Minúsculas y sin acentos, para buscar "jamon" y encontrar "Jamón". */
function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Selector con buscador: se escribe parte del nombre (en cualquier orden, ej. "papa gra")
 * y muestra las coincidencias en orden alfabético, primero las que empiezan con lo escrito.
 * `className` es para ubicarlo en la grilla; `fieldClassName` es el estilo del campo.
 */
export function ItemPicker(props: {
  items: PickerItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  fieldClassName?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = props.items.find((i) => i.id === props.value);

  const sorted = useMemo(
    () => [...props.items].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
    [props.items],
  );

  const results = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return sorted.slice(0, MAX_RESULTS);
    const first = words[0]!;
    const matches = sorted.filter((it) => {
      const text = norm(`${it.name} ${it.group ?? ""}`);
      return words.every((w) => text.includes(w));
    });
    // Primero los que empiezan con lo escrito, después el resto (ambos en orden alfabético)
    const starts = matches.filter((it) => norm(it.name).startsWith(first));
    const rest = matches.filter((it) => !norm(it.name).startsWith(first));
    return [...starts, ...rest].slice(0, MAX_RESULTS);
  }, [query, sorted]);

  // Cerrar al tocar afuera (no con blur: en el celular cerraría la lista al querer scrollearla)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    inputRef.current?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function pick(id: string) {
    props.onChange(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${props.className ?? ""}`}>
      {!open ? (
        <button type="button" aria-label={props.ariaLabel}
          onClick={() => {
            setQuery("");
            setActive(0);
            setOpen(true);
          }}
          className={`${props.fieldClassName ?? ""} flex items-center justify-between gap-2 text-left`}>
          <span className={`truncate ${selected ? "" : "text-neutral-500"}`}>
            {selected ? `${selected.name}${selected.hint ? ` (${selected.hint})` : ""}` : props.placeholder ?? "— Elegir —"}
          </span>
          <span aria-hidden className="shrink-0 text-neutral-400">▾</span>
        </button>
      ) : (
        <>
          <input
            ref={inputRef}
            className={props.fieldClassName}
            placeholder="Escribí para buscar…"
            aria-label={props.ariaLabel}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Tab") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const it = results[active];
                if (it) pick(it.id);
              }
            }}
          />
          <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border bg-white shadow-lg">
            {results.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-neutral-500">No hay insumos con &quot;{query}&quot;</li>
            ) : (
              results.map((it, i) => (
                <li key={it.id}>
                  <button type="button" onClick={() => pick(it.id)}
                    className={`block w-full px-3 py-2.5 text-left text-base sm:py-2 sm:text-sm ${i === active ? "bg-neutral-100" : ""} ${it.id === props.value ? "font-semibold" : ""}`}>
                    {it.name}
                    {it.hint ? <span className="text-neutral-500"> ({it.hint})</span> : null}
                    {it.group ? <span className="block text-xs text-neutral-500">{it.group}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
