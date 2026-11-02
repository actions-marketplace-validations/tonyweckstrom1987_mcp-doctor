import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Marketplace-vaatimukset action.yml:lle. Kevyt rivipohjainen luku, ei YAML-riippuvuutta.
const lue = (polku: string) => readFileSync(fileURLToPath(new URL(`../${polku}`, import.meta.url)), "utf8");
const yml = lue("action.yml");
const ylataso = (avain: string) => new RegExp(`^${avain}: (.+)$`, "m").exec(yml)?.[1]?.trim();

describe("action.yml (GitHub Marketplace)", () => {
  it("nimi ja kuvaus löytyvät, kuvaus alle 125 merkkiä", () => {
    expect(ylataso("name")).toBeTruthy();
    const kuvaus = ylataso("description");
    expect(kuvaus).toBeTruthy();
    expect(kuvaus!.length).toBeLessThan(125);
  });

  it("branding: icon ja color", () => {
    expect(yml).toMatch(/^branding:\n {2}icon: \S+\n {2}color: \S+$/m);
  });

  it("jokaisella syötteellä on kuvaus", () => {
    const lohko = /^inputs:\n([\s\S]*?)^runs:/m.exec(yml)![1]!;
    const nimet = [...lohko.matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1]);
    expect(nimet.length).toBeGreaterThan(0);
    for (const n of nimet) expect(lohko, n).toMatch(new RegExp(`^ {2}${n}:\\n {4}description: .+`, "m"));
  });

  it("runs on composite eikä viittaa paikalliseen polkuun", () => {
    expect(yml).toMatch(/^ {2}using: composite$/m);
    expect(yml).not.toMatch(/uses: \.\.?\//);
  });

  it("README:n ja esimerkin Action-versio vastaa package.json:ia", () => {
    const v = (JSON.parse(lue("package.json")) as { version: string }).version;
    for (const t of [lue("README.md"), lue("examples/workflow.yml")]) {
      expect(t).toContain(`tonyweckstrom1987/mcp-doctor@v${v}`);
    }
  });
});
