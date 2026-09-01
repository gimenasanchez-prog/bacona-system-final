export function openPrintWindow(title: string, bodyHtml: string, extraStyles = "") {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:24px}
      h2{margin:0 0 4px;font-size:14px}p{margin:0 0 12px;color:#666;font-size:11px}
      table{width:100%;border-collapse:collapse}
      th,td{padding:5px 8px;border:1px solid #ddd;font-size:11px}
      th{background:#f0f0f0;text-align:left}
      .right{text-align:right}.bold{font-weight:bold}
      ${extraStyles}
    </style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.print();
}
