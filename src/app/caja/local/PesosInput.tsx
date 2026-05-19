"use client";

import { useState } from "react";

export function PesosInput(props: { name: string; required?: boolean; min?: number }) {
  const [pesos, setPesos] = useState("");
  const cents = pesos ? Math.round(parseFloat(pesos) * 100) : 0;

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">$</span>
      <input
        type="number"
        min={props.min ?? 0}
        step="1"
        className="w-full rounded-md border py-2 pl-7 pr-3 text-sm"
        placeholder="0"
        value={pesos}
        onChange={(e) => setPesos(e.target.value)}
        required={props.required}
      />
      <input type="hidden" name={props.name} value={cents > 0 ? cents : ""} />
    </div>
  );
}
