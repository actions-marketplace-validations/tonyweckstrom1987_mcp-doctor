import { describe, expect, it } from "vitest";
import { lintTools } from "../src/lint.js";

const okSchema = { type: "object", properties: { a: { type: "string", description: "kuvaus" } }, required: ["a"] };
const good = { name: "hyva", description: "Riittävän pitkä kuvaus työkalulle.", inputSchema: okSchema };

const ids = (tools: Parameters<typeof lintTools>[0]) => lintTools(tools).map((f) => f.id);

describe("lintTools", () => {
  it("kunnossa oleva työkalu ei anna löydöksiä", () => {
    expect(lintTools([good])).toEqual([]);
  });

  it("raportoi päällekkäiset nimet kerran ja virheenä", () => {
    const f = lintTools([good, good]);
    expect(f.filter((x) => x.id === "TOOL_DUPLICATE")).toHaveLength(1);
    expect(f.find((x) => x.id === "TOOL_DUPLICATE")?.severity).toBe("error");
    expect(f).toHaveLength(1); // duplikaatin skeemaa ei tarkisteta kahdesti
  });

  it("duplikaatin muut löydökset raportoidaan vain kerran", () => {
    const bad = { name: "x", inputSchema: okSchema }; // kuvaus puuttuu
    const f = lintTools([bad, bad]);
    expect(f.filter((x) => x.id === "TOOL_DESC_MISSING")).toHaveLength(1);
    expect(f.filter((x) => x.id === "TOOL_DUPLICATE")).toHaveLength(1);
  });

  it("nimi: virhe kielletyistä merkeistä, varoitus pisteestä tai yli 64 merkistä", () => {
    expect(lintTools([{ ...good, name: "a b" }]).find((x) => x.id === "TOOL_NAME_INVALID")?.severity).toBe("error");
    expect(lintTools([{ ...good, name: "" }]).find((x) => x.id === "TOOL_NAME_INVALID")).toBeDefined();
    expect(lintTools([{ ...good, name: "a".repeat(129) }]).find((x) => x.id === "TOOL_NAME_INVALID")).toBeDefined();
    expect(lintTools([{ ...good, name: "a.b" }]).find((x) => x.id === "TOOL_NAME_PORTABILITY")?.severity).toBe("warning");
    expect(lintTools([{ ...good, name: "a".repeat(65) }]).find((x) => x.id === "TOOL_NAME_PORTABILITY")).toBeDefined();
    expect(ids([{ ...good, name: "a".repeat(64) }])).toEqual([]);
  });

  it("kuvaus: puuttuva ja tyhjä on varoitus, lyhyt on huomio", () => {
    expect(lintTools([{ name: "x", inputSchema: okSchema }]).find((f) => f.id === "TOOL_DESC_MISSING")?.severity).toBe("warning");
    expect(ids([{ name: "x", description: "   ", inputSchema: okSchema }])).toContain("TOOL_DESC_MISSING");
    expect(lintTools([{ name: "x", description: "lyhyt", inputSchema: okSchema }]).find((f) => f.id === "TOOL_DESC_SHORT")?.severity).toBe("info");
  });

  it("syöteskeema: puuttuva tai muu kuin object on virhe", () => {
    expect(ids([{ ...good, inputSchema: undefined }])).toContain("SCHEMA_NOT_OBJECT");
    expect(ids([{ ...good, inputSchema: { type: "string" } }])).toContain("SCHEMA_NOT_OBJECT");
  });

  it("required: tuntematon kenttä ja väärä muoto ovat virheitä", () => {
    const unknown = lintTools([{ ...good, inputSchema: { type: "object", properties: {}, required: ["puuttuu"] } }]);
    expect(unknown.find((f) => f.id === "SCHEMA_REQUIRED_UNKNOWN")?.message).toContain("puuttuu");
    expect(ids([{ ...good, inputSchema: { type: "object", required: ["x"] } }])).toContain("SCHEMA_REQUIRED_UNKNOWN");
    expect(ids([{ ...good, inputSchema: { type: "object", properties: {}, required: "x" } }])).toContain("SCHEMA_REQUIRED_INVALID");
    expect(ids([{ ...good, inputSchema: { type: "object", properties: {}, required: [1] } }])).toContain("SCHEMA_REQUIRED_INVALID");
  });

  it("kenttä: puuttuva kuvaus ja tyyppi ovat varoituksia", () => {
    const f = lintTools([{ ...good, inputSchema: { type: "object", properties: { x: {}, y: { type: "string" }, z: { type: "string", description: " " } } } }]);
    expect(f.filter((x) => x.id === "SCHEMA_PROP_UNTYPED")).toHaveLength(1);
    expect(f.filter((x) => x.id === "SCHEMA_PROP_DESC_MISSING")).toHaveLength(3);
    expect(f.every((x) => x.severity === "warning")).toBe(true);
  });

  it("anyOf/enum/$ref riittävät tyypiksi", () => {
    const props = { a: { anyOf: [{ type: "string" }], description: "k" }, b: { enum: [1, 2], description: "k" }, c: { $ref: "#/x", description: "k" } };
    expect(lintTools([{ ...good, inputSchema: { type: "object", properties: props } }])).toEqual([]);
  });

  it("tulosskeema: väärä tyyppi on virhe, kunnollinen ei anna löydöksiä", () => {
    expect(ids([{ ...good, outputSchema: { type: "array" } }])).toContain("OUTPUT_SCHEMA_NOT_OBJECT");
    expect(lintTools([{ ...good, outputSchema: { type: "object", properties: { sum: { type: "number" } } } }])).toEqual([]);
  });

  it("required ei anna virhettä, kun kentät voivat tulla allOf/anyOf/oneOf/$ref-rakenteen kautta", () => {
    for (const k of ["allOf", "anyOf", "oneOf", "$ref"]) {
      const schema = { type: "object", [k]: k === "$ref" ? "#/$defs/x" : [{}], required: ["a"] };
      expect(ids([{ ...good, inputSchema: schema }])).not.toContain("SCHEMA_REQUIRED_UNKNOWN");
    }
  });

  it("required: perityt avaimet (constructor) eivät ole kenttiä", () => {
    const schema = { type: "object", properties: { a: { type: "string", description: "kuvaus" } }, required: ["constructor"] };
    expect(ids([{ ...good, inputSchema: schema }])).toContain("SCHEMA_REQUIRED_UNKNOWN");
  });

  it("boolean-skeema kentän määrittelynä on kelvollinen eikä anna varoitusta", () => {
    const schema = { type: "object", properties: { a: true } };
    expect(ids([{ ...good, inputSchema: schema }])).toEqual([]);
  });

  describe("sisäkkäiset skeemat", () => {
    // Muoto kuten server-memoryn create_entities: taulukko objekteja, joiden kentät on kuvattu.
    const entities = (item: Record<string, unknown>) => ({
      ...good,
      inputSchema: { type: "object", properties: { entities: { type: "array", description: "Lisättävät entiteetit", items: item } }, required: ["entities"] },
    });
    const okItem = {
      type: "object",
      properties: { name: { type: "string", description: "Nimi" }, tags: { type: "array", items: { type: "string" }, description: "Tunnisteet" } },
      required: ["name"],
    };

    it("hyvin kuvattu sisäkkäinen rakenne ei anna löydöksiä", () => {
      expect(lintTools([entities(okItem)])).toEqual([]);
    });

    it("taulukon alkion kentän puuttuva kuvaus ja tyyppi ovat huomioita polun kanssa", () => {
      const f = lintTools([entities({ type: "object", properties: { name: { type: "string" }, extra: {} } })]);
      const desc = f.filter((x) => x.id === "SCHEMA_NESTED_DESC_MISSING");
      expect(desc.map((x) => x.message)).toEqual(["kentältä 'entities[].name' puuttuu kuvaus", "kentältä 'entities[].extra' puuttuu kuvaus"]);
      expect(f.find((x) => x.id === "SCHEMA_NESTED_PROP_UNTYPED")?.message).toContain("'entities[].extra'");
      expect(f.every((x) => x.severity === "info")).toBe(true);
    });

    it("sisäkkäisen objektin tuntematon required-kenttä on virhe", () => {
      const f = lintTools([entities({ ...okItem, required: ["name", "nimi"] })]);
      expect(f).toHaveLength(1);
      expect(f[0]).toMatchObject({ id: "SCHEMA_REQUIRED_UNKNOWN", severity: "error" });
      expect(f[0].message).toContain("'entities[].nimi'");
      expect(ids([entities({ ...okItem, required: "name" })])).toEqual(["SCHEMA_REQUIRED_INVALID"]);
    });

    it("taulukko ilman items-määrittelyä on varoitus ylä- ja alatasolla", () => {
      const top = lintTools([{ ...good, inputSchema: { type: "object", properties: { ids: { type: "array", description: "Tunnisteet" } } } }]);
      expect(top).toEqual([expect.objectContaining({ id: "SCHEMA_ARRAY_ITEMS_MISSING", severity: "warning" })]);
      expect(top[0].message).toContain("'ids'");
      const deep = lintTools([entities({ ...okItem, properties: { ...okItem.properties, tags: { type: "array", description: "Tunnisteet" } } })]);
      expect(deep.map((x) => x.id)).toEqual(["SCHEMA_ARRAY_ITEMS_MISSING"]);
      expect(deep[0].message).toContain("'entities[].tags'");
      // type-lista ja prefixItems tunnistetaan
      expect(ids([{ ...good, inputSchema: { type: "object", properties: { x: { type: ["array", "null"], description: "x" } } } }])).toEqual(["SCHEMA_ARRAY_ITEMS_MISSING"]);
      expect(ids([{ ...good, inputSchema: { type: "object", properties: { x: { type: "array", description: "x", prefixItems: [{ type: "string" }] } } } }])).toEqual([]);
    });

    it("sisäkkäinen objekti ilman taulukkoa tarkistetaan pistepolulla", () => {
      const schema = { type: "object", properties: { opts: { type: "object", description: "Valinnat", properties: { depth: { type: "integer" } } } } };
      expect(lintTools([{ ...good, inputSchema: schema }]).map((x) => x.message)).toEqual(["kentältä 'opts.depth' puuttuu kuvaus"]);
    });

    it("syvä rakenne katkaistaan eikä kaada tarkistusta", () => {
      let node: Record<string, unknown> = { type: "string" };
      for (let i = 0; i < 50; i++) node = { type: "object", description: "taso", properties: { a: node } };
      const f = lintTools([{ ...good, inputSchema: { type: "object", properties: { root: node } } }]);
      expect(f.filter((x) => x.severity !== "info")).toEqual([]);
      expect(f.length).toBeLessThan(15);
    });

    it("tulosskeeman sisältöä ei tarkisteta (kuten ennenkin)", () => {
      expect(ids([{ ...good, outputSchema: { type: "object", properties: { x: { type: "array" } } } }])).toEqual([]);
    });
  });
  describe("yhdistelmähaarat ja tuple-taulukot", () => {
    const withProp = (def: Record<string, unknown>) => [{ ...good, inputSchema: { type: "object", properties: { x: def } } }];

    it("nullable-taulukko anyOf-haarassa ilman items-määrittelyä on varoitus", () => {
      const f = lintTools(withProp({ description: "x", anyOf: [{ type: "array" }, { type: "null" }] }));
      expect(f).toEqual([expect.objectContaining({ id: "SCHEMA_ARRAY_ITEMS_MISSING", severity: "warning" })]);
      expect(f[0].message).toContain("'x.anyOf[0]'");
    });

    it("haaroilta ei vaadita omaa kuvausta, eikä kunnossa oleva haara anna löydöksiä", () => {
      expect(ids(withProp({ description: "x", anyOf: [{ type: "string" }, { type: "null" }] }))).toEqual([]);
      expect(ids(withProp({ description: "x", oneOf: [{ type: "array", items: { type: "string" } }, { type: "string" }] }))).toEqual([]);
    });

    it("oneOf-haaran objekti tarkistetaan kuten sisäkkäinen objekti", () => {
      const f = lintTools(withProp({ description: "x", oneOf: [{ type: "object", properties: { nimi: { type: "string" } } }] }));
      expect(f.map((y) => [y.id, y.severity])).toEqual([["SCHEMA_NESTED_DESC_MISSING", "info"]]);
      expect(f[0].message).toContain("'x.oneOf[0].nimi'");
    });

    it("allOf-haaran rikkinäinen required on virhe", () => {
      expect(ids(withProp({ description: "x", type: "object", properties: {}, allOf: [{ properties: { a: { type: "string", description: "a" } }, required: "a" }] }))).toEqual(["SCHEMA_REQUIRED_INVALID"]);
    });

    it("haaran required saa viitata vanhemman kenttiin (ei väärää virhettä)", () => {
      const schema = { type: "object", properties: { a: { type: "string", description: "a" }, b: { type: "string", description: "b" } }, anyOf: [{ required: ["a"] }, { required: ["b"] }] };
      expect(ids([{ ...good, inputSchema: schema }])).toEqual([]);
      const wrong = { ...schema, anyOf: [{ required: ["c"] }] };
      expect(ids([{ ...good, inputSchema: wrong }])).toEqual(["SCHEMA_REQUIRED_UNKNOWN"]);
    });

    it("ylätason allOf-haaran kentät tarkistetaan", () => {
      const schema = { type: "object", properties: {}, allOf: [{ properties: { q: { type: "array", description: "q" } } }] };
      const f = lintTools([{ ...good, inputSchema: schema }]);
      expect(f.map((y) => y.id)).toEqual(["SCHEMA_ARRAY_ITEMS_MISSING"]);
      expect(f[0].message).toContain("'allOf[0].q'");
    });

    it("tuple-muotoisen items-taulukon ja prefixItemsin alkiot tarkistetaan", () => {
      const f = lintTools(withProp({ type: "array", description: "x", items: [{ type: "string" }, { type: "array" }] }));
      expect(f.map((y) => y.id)).toEqual(["SCHEMA_ARRAY_ITEMS_MISSING"]);
      expect(f[0].message).toContain("'x[1]'");
      const g = lintTools(withProp({ type: "array", description: "x", prefixItems: [{ type: "object", properties: { a: { type: "string" } } }] }));
      expect(g.map((y) => y.message)).toEqual(["kentältä 'x[0].a' puuttuu kuvaus"]);
    });

    it("syvästi sisäkkäiset haarat katkaistaan eikä kaada tarkistusta", () => {
      let node: Record<string, unknown> = { type: "array" };
      for (let i = 0; i < 50; i++) node = { anyOf: [node, { type: "null" }] };
      const f = lintTools(withProp({ description: "x", ...node }));
      expect(f.length).toBeLessThanOrEqual(1);
    });
  });
});
