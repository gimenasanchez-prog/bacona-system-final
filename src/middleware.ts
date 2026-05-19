import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/pos")) {
    if (!req.cookies.get("bcn_cashSessionId")?.value) {
      return NextResponse.redirect(new URL("/caja/abrir", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/pos/:path*"],
};
