import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { formatText } from "../src/report.js";
import { diagnose } from "../src/runner.js";
import { CHARS_PER_TOKEN, TOOL_TOKENS_HIGH, estimateTokens, measureTools, tokenFindings, toolDefinitionText } from "../src/tokens.js";
import { NODE, fixture, makeIo } from "./helpers.js";

const tool = (name: string, description = "Kuvaus, joka on riittävän pitkä.", props: Record<string, unknown> = {}) => ({
  name,
  description,
  inputSchema: { type: "object", properties: props },
});

describe("tokenimittari: laskenta", () => {
  it("arvio on merkit jaettuna neljällä, ylöspäin pyöristettynä", () => {
    expect(CHARS_PER_TOKEN).toBe(4);
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("laskee nimen, kuvauksen ja syöteskeeman, ei tulosskeemaa", () => {
    const t = { ...tool("a"), outputSchema: { type: "object", properties: { iso: { type: "string", description: "x".repeat(5000) } } } };
    expect(toolDefinitionText(t)).not.toContain("xxxx");
    expect(toolDefinitionText(t)).toContain("Kuvaus");
  });

  it("järjestää suurimmasta pienimpään ja laskee summan", () => {
    const r = measureTools([tool("pieni", "lyhyt"), tool("iso", "k".repeat(2000)), tool("keski", "k".repeat(400))]);
    expect(r.perTool.map((x) => x.tool)).toEqual(["iso", "keski", "pieni"]);
    expect(r.total).toBe(r.perTool.reduce((s, x) => s + x.tokens, 0));
    expect(r.budget).toBeUndefined();
    expect(r.method).toBe("chars/4");
  });
});

describe("tokenimittari: löydökset", () => {
  it("raskas työkalu on huomio, joka ei kaada --strict-ajoa", () => {
    const f = tokenFindings(measureTools([tool("raskas", "k".repeat(TOOL_TOKENS_HIGH * CHARS_PER_TOKEN + 100))]));
    expect(f.map((x) => [x.id, x.severity, x.tool])).toEqual([["TOOL_TOKENS_HIGH", "info", "raskas"]]);
  });

  it("raja ylittyy: virhe, jossa on suurimmat työkalut", () => {
    const f = tokenFindings(measureTools([tool("a", "k".repeat(800)), tool("b", "k".repeat(400))], 100));
    const e = f.find((x) => x.id === "TOOLS_TOKEN_BUDGET_EXCEEDED");
    expect(e?.severity).toBe("error");
    expect(e?.message).toMatch(/raja on 100/);
    expect(e?.message).toMatch(/suurimmat: a \d+, b \d+/);
  });

  it("rajan alla tai täsmälleen rajalla ei löydöksiä", () => {
    const r = measureTools([tool("a")]);
    expect(tokenFindings({ ...r, budget: r.total })).toEqual([]);
  });
});

describe("tokenimittari: palvelin ja CLI", () => {
  const run = (maxTokens?: number) =>
    diagnose({ transport: new StdioClientTransport({ command: NODE, args: [fixture("good-server.mjs")] }), target: "g", timeoutMs: 10000, strict: false, maxTokens });

  it("kunnossa olevan palvelimen raportissa on tokenit, ei löydöksiä", async () => {
    const r = await run();
    expect(r.findings).toEqual([]);
    expect(r.tokens?.perTool).toHaveLength(5);
    expect(r.tokens?.total).toBeGreaterThan(0);
    expect(formatText(r)).toMatch(/Tokenit \(arvio\): työkalumäärittelyt yhteensä \d+; suurimmat: /);
  });

  it("--max-tokens: ylitys kaataa ajon (exit 1), riittävä raja ei (exit 0)", async () => {
    const io1 = makeIo();
    expect(await main(["--max-tokens", "1", "--", NODE, fixture("good-server.mjs")], io1)).toBe(1);
    expect(io1.out).toContain("TOOLS_TOKEN_BUDGET_EXCEEDED");
    const io2 = makeIo();
    expect(await main(["--json", "--max-tokens", "100000", "--", NODE, fixture("good-server.mjs")], io2)).toBe(0);
    expect(JSON.parse(io2.out).tokens.budget).toBe(100000);
  });

  it.each([["abc"], ["0"], ["1.5"]])("--max-tokens %s on käyttövirhe (exit 2)", async (v) => {
    expect(await main(["--max-tokens", v, "--", "x"], makeIo())).toBe(2);
  });

  it("yhteysvirheessä tokeneita ei raportoida", async () => {
    const r = await diagnose({ transport: new StdioClientTransport({ command: NODE, args: [fixture("crash-server.mjs")] }), target: "c", timeoutMs: 5000, strict: false });
    expect(r.tokens).toBeUndefined();
  });
});
