import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders, parseAllowedOrigins } from "@/lib/http/cors";

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

export function proxy(request: NextRequest) {
  const headers = corsHeaders(request.headers.get("origin"), allowedOrigins);

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
