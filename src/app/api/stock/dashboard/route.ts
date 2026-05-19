import { NextResponse } from "next/server";

import { StockDashboardService } from "@/modules/stock/services/stockDashboardService";

export async function GET() {
  try {
    const dashboard = await StockDashboardService.getBaconaDashboard();
    return NextResponse.json(dashboard);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

