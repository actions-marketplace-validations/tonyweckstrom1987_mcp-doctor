import type { Finding, ToolLike } from "./types.js";

/**
 * Tokenimittari: arvioi, montako tokenia palvelimen työkalumäärittelyt vievät mallin kontekstista
 * jokaisessa pyynnössä. Asiakas lähettää mallille jokaisen työkalun nimen, kuvauksen ja syöteskeeman,
 * joten ne maksetaan joka kerta, vaikka työkalua ei käytettäisi.
 *
 * Arvio: tiivis JSON (name, description, inputSchema) jaettuna neljällä merkillä per token. Se on
 * yleinen nyrkkisääntö englanninkieliselle tekstille ja JSONille; todellinen luku riippuu mallin
 * tokenisoijasta ja asiakkaan kääreestä (tyypillisesti noin ±25 %). Siksi raportissa puhutaan arviosta.
 */
export const CHARS_PER_TOKEN = 4;
/** Yksittäisen työkalun raja, jonka ylittyessä annetaan huomio (ei kaada --strict-ajoja). */
export const TOOL_TOKENS_HIGH = 1000;

export interface ToolTokens {
  tool: string;
  tokens: number;
}

export interface TokenReport {
  /** Kaikkien työkalumäärittelyjen arvioitu yhteismäärä. */
  total: number;
  /** Työkalut suurimmasta pienimpään. */
  perTool: ToolTokens[];
  /** --max-tokens-raja, jos annettu. */
  budget?: number;
  method: "chars/4";
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Mitä asiakas lähettää mallille yhdestä työkalusta. outputSchema ei yleensä mene mallille, joten sitä ei lasketa. */
export function toolDefinitionText(t: ToolLike): string {
  return JSON.stringify({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema ?? {} });
}

export function measureTools(tools: ToolLike[], budget?: number): TokenReport {
  const perTool = tools
    .map((t) => ({ tool: t.name, tokens: estimateTokens(toolDefinitionText(t)) }))
    .sort((a, b) => b.tokens - a.tokens || a.tool.localeCompare(b.tool));
  const total = perTool.reduce((s, x) => s + x.tokens, 0);
  return budget === undefined ? { total, perTool, method: "chars/4" } : { total, perTool, budget, method: "chars/4" };
}

export function tokenFindings(r: TokenReport): Finding[] {
  const out: Finding[] = [];
  for (const t of r.perTool) {
    if (t.tokens > TOOL_TOKENS_HIGH) {
      out.push({
        id: "TOOL_TOKENS_HIGH",
        severity: "info",
        tool: t.tool,
        message: `työkalun määrittely vie arviolta ${t.tokens} tokenia jokaisesta pyynnöstä (raja ${TOOL_TOKENS_HIGH}); lyhennä kuvausta tai skeeman kenttäkuvauksia`,
      });
    }
  }
  if (r.budget !== undefined && r.total > r.budget) {
    const top = r.perTool.slice(0, 3).map((t) => `${t.tool} ${t.tokens}`).join(", ");
    out.push({
      id: "TOOLS_TOKEN_BUDGET_EXCEEDED",
      severity: "error",
      message: `työkalumäärittelyt vievät arviolta ${r.total} tokenia, raja on ${r.budget} (--max-tokens); suurimmat: ${top}`,
    });
  }
  return out;
}
