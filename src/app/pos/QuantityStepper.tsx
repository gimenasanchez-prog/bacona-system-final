"use client";

import { useEffect, useState } from "react";

export function QuantityStepper(props: {
  value: number;
  min?: number;
  disabled?: boolean;
  onChange: (next: number) => void | Promise<void>;
}) {
  const min = props.min ?? 0;
  const [draft, setDraft] = useState(String(props.value));

  useEffect(() => {
    setDraft(String(props.value));
  }, [props.value]);

  function commit(raw: string) {
    const parsed = Math.max(min, Math.round(Number(raw)));
    if (!Number.isFinite(parsed) || raw.trim() === "") {
      setDraft(String(props.value));
      return;
    }
    setDraft(String(parsed));
    if (parsed !== props.value) props.onChange(parsed);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-md border text-lg hover:bg-neutral-50 disabled:opacity-40"
        disabled={props.disabled || props.value <= min}
        onClick={() => props.onChange(Math.max(min, props.value - 1))}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="w-14 rounded-md border px-1 py-1 text-center text-sm"
        value={draft}
        disabled={props.disabled}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-md border text-lg hover:bg-neutral-50 disabled:opacity-40"
        disabled={props.disabled}
        onClick={() => props.onChange(props.value + 1)}
      >
        +
      </button>
    </div>
  );
}
