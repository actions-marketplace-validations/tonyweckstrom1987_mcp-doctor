export type Severity = "error" | "warning" | "info";

export interface Finding {
  /** Vakaa tunniste (esim. TOOL_DUPLICATE), jota voi käyttää suodatukseen. */
  id: string;
  severity: Severity;
  message: string;
  tool?: string;
}

export interface SmokeResult {
  tool: string;
  ok: boolean;
  ms: number;
}

export interface Report {
  version: 1;
  target: string;
  server: { name: string; version: string } | null;
  toolCount: number;
  findings: Finding[];
  smoke: SmokeResult[];
  /** Tokenimittari: työkalumäärittelyjen arvioitu koko (puuttuu, jos työkalulistaa ei saatu). */
  tokens?: { total: number; perTool: { tool: string; tokens: number }[]; budget?: number; method: "chars/4" };
  summary: { errors: number; warnings: number; infos: number };
  /** true, kun virheitä ei ole (--strict: myös varoitukset kaatavat). */
  ok: boolean;
}

export interface ToolLike {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

export interface SmokeCall {
  tool: string;
  arguments: Record<string, unknown>;
  /** Odotetaanko työkalun palauttavan virheen (isError). Oletus: ei. */
  expectError: boolean;
  /** Hitaaksi katsottava vasteaika millisekunteina. */
  maxMs: number;
}

/** Käyttövirhe (väärä valitsin, rikkinäinen tiedosto): CLI palauttaa exit-koodin 2. */
export class UsageError extends Error {}
