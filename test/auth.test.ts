import { describe, expect, it } from "vitest";
import { authCheck, parseWwwAuthenticate, wellKnown, type FetchLike } from "../src/auth.js";
import { main } from "../src/cli.js";
import { makeIo } from "./helpers.js";

const MCP = "https://mcp.example.com/mcp";
const AS = "https://auth.example.com";
const PRM_URL = "https://mcp.example.com/.well-known/oauth-protected-resource/mcp";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const goodAs = {
  issuer: AS,
  authorization_endpoint: `${AS}/authorize`,
  token_endpoint: `${AS}/token`,
  registration_endpoint: `${AS}/register`,
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
};

/** Väärennetty fetch: reitit -> vastaus. Kirjaa kutsut, jotta voidaan todeta, ettei tunnuksia lähetetä. */
function fake(routes: Record<string, () => Response>, opts: { www?: string | null; initStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (init?.method === "POST") {
      const headers: Record<string, string> = {};
      const www = opts.www === undefined ? `Bearer resource_metadata="${PRM_URL}"` : opts.www;
      if (www !== null) headers["www-authenticate"] = www;
      return new Response("{}", { status: opts.initStatus ?? 401, headers });
    }
    const r = routes[url];
    return r ? r() : new Response("not found", { status: 404 });
  };
  return { fn, calls };
}

const goodRoutes = (asMeta: Record<string, unknown> = goodAs, prm: Record<string, unknown> = { resource: MCP, authorization_servers: [AS] }) => ({
  [PRM_URL]: () => json(prm),
  [`${AS}/.well-known/oauth-authorization-server`]: () => json(asMeta),
});

const ids = (fs: { id: string }[]) => fs.map((x) => x.id);

describe("OAuth-tarkistus: apufunktiot", () => {
  it("well-known lisätään hostin ja polun väliin, juuri varalla", () => {
    expect(wellKnown("https://x.fi/mcp", "oauth-protected-resource")).toEqual([
      "https://x.fi/.well-known/oauth-protected-resource/mcp",
      "https://x.fi/.well-known/oauth-protected-resource",
    ]);
    expect(wellKnown("https://x.fi", "openid-configuration")).toEqual(["https://x.fi/.well-known/openid-configuration"]);
  });

  it("WWW-Authenticate: Bearer ja resource_metadata lainausmerkeillä tai ilman", () => {
    expect(parseWwwAuthenticate(`Bearer realm="x", resource_metadata="${PRM_URL}"`)).toEqual({ bearer: true, resourceMetadata: PRM_URL });
    expect(parseWwwAuthenticate(`Bearer resource_metadata=${PRM_URL}`)).toEqual({ bearer: true, resourceMetadata: PRM_URL });
    expect(parseWwwAuthenticate("Basic realm=x")).toEqual({ bearer: false });
    expect(parseWwwAuthenticate(null)).toEqual({ bearer: false });
  });
});

describe("OAuth-tarkistus: palvelimet", () => {
  it("kunnossa: vain AUTH_OK, eikä tunnuksia lähetetä", async () => {
    const { fn, calls } = fake(goodRoutes());
    const r = await authCheck(MCP, fn, 1000);
    expect(ids(r)).toEqual(["AUTH_OK"]);
    for (const c of calls) expect(JSON.stringify(c.init?.headers ?? {})).not.toMatch(/authorization/i);
  });

  it("kirjautumista ei vaadita: huomio ja tarkistus ohitetaan", async () => {
    const { fn, calls } = fake({}, { initStatus: 200 });
    expect(ids(await authCheck(MCP, fn, 1000))).toEqual(["AUTH_NOT_REQUIRED"]);
    expect(calls).toHaveLength(1);
  });

  it("ei WWW-Authenticate-otsaketta: varoitus, metatiedot löytyvät silti well-known-polusta", async () => {
    const { fn } = fake(goodRoutes(), { www: null });
    const r = await authCheck(MCP, fn, 1000);
    expect(ids(r)).toEqual(["AUTH_WWW_AUTHENTICATE_MISSING"]);
  });

  it("ei resource_metadata-parametria: huomio", async () => {
    const { fn } = fake(goodRoutes(), { www: "Bearer" });
    expect(ids(await authCheck(MCP, fn, 1000))).toEqual(["AUTH_RESOURCE_METADATA_HINT_MISSING", "AUTH_OK"]);
  });

  it("resurssin metatiedot puuttuvat: virhe", async () => {
    const { fn } = fake({}, { www: "Bearer" });
    const r = await authCheck(MCP, fn, 1000);
    expect(ids(r)).toContain("AUTH_RESOURCE_METADATA_MISSING");
    expect(r.find((x) => x.id === "AUTH_RESOURCE_METADATA_MISSING")?.severity).toBe("error");
  });

  it("väärä resource ja puuttuvat valtuutuspalvelimet", async () => {
    const { fn } = fake(goodRoutes(goodAs, { resource: "https://muu.example.com/api" }));
    expect(ids(await authCheck(MCP, fn, 1000))).toEqual(["AUTH_RESOURCE_MISMATCH", "AUTH_SERVERS_MISSING"]);
  });

  it("valtuutuspalvelimen metatiedot OpenID-polusta kelpaavat", async () => {
    const { fn } = fake({ [PRM_URL]: () => json({ resource: MCP, authorization_servers: [AS] }), [`${AS}/.well-known/openid-configuration`]: () => json(goodAs) });
    expect(ids(await authCheck(MCP, fn, 1000))).toEqual(["AUTH_OK"]);
  });

  it("ei PKCE S256:ta, ei refresh_tokenia, ei rekisteröintiä, http-päätepiste", async () => {
    const bad = { ...goodAs, token_endpoint: "http://auth.example.com/token", code_challenge_methods_supported: ["plain"], grant_types_supported: ["authorization_code"], registration_endpoint: undefined };
    const r = await authCheck(MCP, fake(goodRoutes(bad)).fn, 1000);
    expect(ids(r)).toEqual(["AUTH_INSECURE_URL", "AUTH_PKCE_S256_MISSING", "AUTH_REFRESH_TOKEN_UNSUPPORTED", "AUTH_REGISTRATION_UNSUPPORTED"]);
    expect(r.find((x) => x.id === "AUTH_REFRESH_TOKEN_UNSUPPORTED")?.severity).toBe("warning");
  });

  it("valtuutuspalvelimen metatiedot puuttuvat: virhe", async () => {
    const r = await authCheck(MCP, fake({ [PRM_URL]: () => json({ resource: MCP, authorization_servers: [AS] }) }).fn, 1000);
    expect(ids(r)).toEqual(["AUTH_SERVER_METADATA_MISSING"]);
  });

  it("yhteysvirhe initialize-pyynnössä: virhe, ei kaadu", async () => {
    const r = await authCheck(MCP, async () => { throw new Error("ECONNREFUSED"); }, 1000);
    expect(ids(r)).toEqual(["AUTH_CHECK_FAILED"]);
  });

  it("valtuutuspalvelimen teksti ei pääse raporttiin rivinvaihtoina", async () => {
    const r = await authCheck(MCP, fake(goodRoutes(goodAs, { resource: "x\n::error::y", authorization_servers: [AS] })).fn, 1000);
    expect(r.every((x) => !x.message.includes("\n"))).toBe(true);
  });
});

describe("OAuth-tarkistus: CLI", () => {
  it("--auth ilman --url:ia on käyttövirhe (exit 2)", async () => {
    expect(await main(["--auth", "--", "x"], makeIo())).toBe(2);
  });
});
