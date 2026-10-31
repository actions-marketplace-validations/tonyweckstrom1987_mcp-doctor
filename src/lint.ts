import type { Finding, ToolLike } from "./types.js";

const NAME_STRICT = /^[A-Za-z0-9_-]{1,64}$/;
const NAME_SPEC = /^[A-Za-z0-9_.-]{1,128}$/;
const TYPE_KEYS = ["type", "enum", "const", "$ref", "anyOf", "oneOf", "allOf"];
const SHORT_DESCRIPTION = 20;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function find(id: string, severity: Finding["severity"], tool: string, message: string): Finding {
  return { id, severity, tool, message };
}

function lintSchema(tool: string, schema: unknown, kind: "input" | "output"): Finding[] {
  const out: Finding[] = [];
  const label = kind === "input" ? "syöteskeema" : "tulosskeema";
  if (!isRecord(schema) || schema.type !== "object") {
    out.push(find(kind === "input" ? "SCHEMA_NOT_OBJECT" : "OUTPUT_SCHEMA_NOT_OBJECT", "error", tool, `${label} puuttuu tai sen type ei ole "object"`));
    return out;
  }
  if (kind === "output") return out;
  out.push(...lintObject(tool, schema, "", 0));
  out.push(...lintBranches(tool, schema, "", 1));
  return out;
}

const MAX_DEPTH = 8;

function hasType(def: Record<string, unknown>, t: string): boolean {
  return def.type === t || (Array.isArray(def.type) && def.type.includes(t));
}

/** Polku löydösviestiin: ylätaso 'nimi', sisäkkäinen 'nimi.ala', taulukon alkio 'nimi[].ala'. */
function join(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}.${name}`;
}

/**
 * Tarkistaa objektiskeeman required-listan ja kentät. Ylätason (prefix "") löydökset ovat kuten ennen;
 * sisäkkäisten objektien ja taulukon alkioiden puuttuvat kuvaukset ja tyypit ovat huomioita (info),
 * jotta --strict-ajot eivät kaadu uusiin tarkistuksiin. Rakenteelliset virheet ovat yhtä vakavia tasosta riippumatta.
 */
function lintObject(tool: string, schema: Record<string, unknown>, prefix: string, depth: number, inherited: ReadonlySet<string> = new Set()): Finding[] {
  const out: Finding[] = [];
  const nested = prefix !== "";
  const where = nested ? ` (objektissa '${prefix}')` : "";
  const props = isRecord(schema.properties) ? schema.properties : undefined;
  const required = schema.required;
  if (required !== undefined) {
    if (!Array.isArray(required) || required.some((r) => typeof r !== "string")) {
      out.push(find("SCHEMA_REQUIRED_INVALID", "error", tool, `required ei ole merkkijonolista${where}`));
    } else {
      // Kentät voivat tulla allOf/anyOf/oneOf/$ref-rakenteen kautta: silloin properties-lista ei ole koko totuus, eikä puuttuvaa kenttää voi tuomita.
      const composed = ["allOf", "anyOf", "oneOf", "$ref"].some((k) => k in schema);
      for (const r of required) {
        // Object.hasOwn: perityt avaimet (esim. "constructor") eivät ole kenttiä.
        if (!props || !Object.hasOwn(props, r)) {
          // Yhdistelmähaara voi vaatia vanhemman kentän (esim. anyOf: [{required: ["a"]}, {required: ["b"]}]).
          if (composed || inherited.has(r)) continue;
          out.push(find("SCHEMA_REQUIRED_UNKNOWN", "error", tool, `pakollinen kenttä '${join(prefix, r)}' ei ole properties-listassa`));
        }
      }
    }
  }
  if (props) {
    for (const [name, def] of Object.entries(props)) {
      const path = join(prefix, name);
      if (typeof def === "boolean") continue; // true/false on kelvollinen JSON Schema (kaikki sallittu / ei mitään sallittu)
      if (!isRecord(def)) {
        out.push(find(nested ? "SCHEMA_NESTED_PROP_UNTYPED" : "SCHEMA_PROP_UNTYPED", nested ? "info" : "warning", tool, `kentän '${path}' skeema ei ole objekti`));
        continue;
      }
      if (!TYPE_KEYS.some((k) => k in def)) {
        out.push(find(nested ? "SCHEMA_NESTED_PROP_UNTYPED" : "SCHEMA_PROP_UNTYPED", nested ? "info" : "warning", tool, `kentällä '${path}' ei ole tyyppiä (type/enum/const/$ref/anyOf/oneOf/allOf): skeema on liian väljä`));
      }
      if (typeof def.description !== "string" || def.description.trim() === "") {
        out.push(find(nested ? "SCHEMA_NESTED_DESC_MISSING" : "SCHEMA_PROP_DESC_MISSING", nested ? "info" : "warning", tool, `kentältä '${path}' puuttuu kuvaus`));
      }
      out.push(...lintValue(tool, def, path, depth + 1));
    }
  }
  return out;
}

/** Laskeutuu kentän skeemaan: sisäkkäiset objektit, taulukon alkiot (myös tuple-muoto) ja anyOf/oneOf/allOf-haarat. $ref-viittauksia ei seurata. */
function lintValue(tool: string, def: Record<string, unknown>, path: string, depth: number, inherited: ReadonlySet<string> = new Set()): Finding[] {
  if (depth > MAX_DEPTH) return [];
  const out: Finding[] = [];
  if (hasType(def, "array")) {
    const items = def.items;
    if (items === undefined && def.prefixItems === undefined) {
      // Esim. Gemini hylkää koko työkalulistan, jos taulukolta puuttuu items; OpenAI:n strict-tila samoin.
      out.push(find("SCHEMA_ARRAY_ITEMS_MISSING", "warning", tool, `taulukkokentältä '${path}' puuttuu items: alkioiden tyyppi on tuntematon, ja osa asiakkaista hylkää skeeman`));
    } else if (isRecord(items)) {
      out.push(...lintValue(tool, items, `${path}[]`, depth + 1));
    }
    // Tuple-muoto: items-taulukko (draft-07) tai prefixItems (2020-12). Jokainen alkio tarkistetaan omana polkunaan.
    const tuple = Array.isArray(def.prefixItems) ? def.prefixItems : Array.isArray(items) ? items : [];
    tuple.forEach((t, i) => {
      if (isRecord(t)) out.push(...lintValue(tool, t, `${path}[${i}]`, depth + 1));
    });
  }
  if (isRecord(def.properties) || def.required !== undefined) {
    out.push(...lintObject(tool, def, path, depth, inherited));
  }
  out.push(...lintBranches(tool, def, path, depth + 1));
  return out;
}

const BRANCH_KEYS = ["anyOf", "oneOf", "allOf"] as const;

/**
 * Laskeutuu anyOf/oneOf/allOf-haaroihin. Esim. nullable-taulukko anyOf: [{type: "array"}, {type: "null"}] ilman items-määrittelyä
 * kaatuu Geminissä samoin kuin suora taulukko. Haaroilta ei vaadita omaa kuvausta (kuvaus on yleensä kentällä itsellään),
 * ja haaran required saa viitata vanhemman kenttiin.
 */
function lintBranches(tool: string, def: Record<string, unknown>, path: string, depth: number): Finding[] {
  if (depth > MAX_DEPTH) return [];
  const out: Finding[] = [];
  const parentProps = new Set(isRecord(def.properties) ? Object.keys(def.properties) : []);
  for (const key of BRANCH_KEYS) {
    const branches = def[key];
    if (!Array.isArray(branches)) continue;
    branches.forEach((b, i) => {
      if (isRecord(b)) out.push(...lintValue(tool, b, join(path, `${key}[${i}]`), depth, parentProps));
    });
  }
  return out;
}

/** Tarkistaa työkalulistan ja niiden skeemat. Puhdas funktio, ei verkkoa. */
export function lintTools(tools: ToolLike[]): Finding[] {
  const out: Finding[] = [];
  const seen = new Map<string, number>();
  for (const t of tools) seen.set(t.name, (seen.get(t.name) ?? 0) + 1);
  for (const [name, n] of seen) {
    if (n > 1) out.push(find("TOOL_DUPLICATE", "error", name, `työkalun nimi esiintyy ${n} kertaa`));
  }
  const reported = new Set<string>();
  for (const t of tools) {
    if (reported.has(t.name)) continue; // duplikaatin skeema tarkistetaan kerran
    reported.add(t.name);
    if (!NAME_SPEC.test(t.name)) {
      out.push(find("TOOL_NAME_INVALID", "error", t.name, "nimi on tyhjä, yli 128 merkkiä tai sisältää sallittujen merkkien (A-Z a-z 0-9 _ - .) ulkopuolisia merkkejä"));
    } else if (!NAME_STRICT.test(t.name)) {
      out.push(find("TOOL_NAME_PORTABILITY", "warning", t.name, "nimi ei sovi muotoon [A-Za-z0-9_-]{1,64}, jota osa asiakkaista (esim. Claude API) vaatii"));
    }
    const desc = typeof t.description === "string" ? t.description.trim() : "";
    if (desc === "") out.push(find("TOOL_DESC_MISSING", "warning", t.name, "kuvaus puuttuu: malli ei tiedä milloin työkalua kuuluu käyttää"));
    else if (desc.length < SHORT_DESCRIPTION) out.push(find("TOOL_DESC_SHORT", "info", t.name, `kuvaus on hyvin lyhyt (${desc.length} merkkiä)`));
    out.push(...lintSchema(t.name, t.inputSchema, "input"));
    if (t.outputSchema !== undefined) out.push(...lintSchema(t.name, t.outputSchema, "output"));
  }
  return out;
}
