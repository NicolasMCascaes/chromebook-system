import { describe, expect, it } from "vitest";
import { corsHeaders, parseAllowedOrigins } from "@/lib/http/cors";

describe("CORS", () => {
  const allowed = parseAllowedOrigins(" https://agenda.escola.app/ , http://localhost:5173 ");

  it("normaliza a lista de origens", () => {
    expect(allowed).toEqual(["https://agenda.escola.app", "http://localhost:5173"]);
  });

  it("libera origem autorizada com os cabeçalhos necessários", () => {
    const headers = corsHeaders("http://localhost:5173", allowed);
    expect(headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("Idempotency-Key");
    expect(headers.get("Vary")).toBe("Origin");
  });

  it("não libera origem desconhecida nem requisição sem origem", () => {
    expect(corsHeaders("https://malicioso.example", allowed).get("Access-Control-Allow-Origin")).toBeNull();
    expect(corsHeaders(null, allowed).get("Access-Control-Allow-Origin")).toBeNull();
  });
});
