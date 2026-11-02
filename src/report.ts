import { clean, short } from "./text.js";
import type { Finding, Report } from "./types.js";

export function summarize(findings: Finding[]): Report["summary"] {
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length,
  };
}

const LABEL = { error: "VIRHE   ", warning: "VAROITUS", info: "HUOMIO  " } as const;
const ORDER = { error: 0, warning: 1, info: 2 } as const;

export function formatText(r: Report): string {
  const lines: string[] = [];
  // Kaikki palvelimelta tuleva teksti siivotaan (clean/short), jotta se ei voi aloittaa uutta riviä eikä sisältää ohjausmerkkejä.
  lines.push(`mcp-doctor: ${clean(r.target)}`);
  lines.push(r.server ? `Palvelin: ${short(r.server.name)} ${short(r.server.version)}, ${r.toolCount} työkalua` : "Palvelin: ei tietoja (yhteys ei onnistunut)");
  const sorted = [...r.findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  for (const f of sorted) {
    lines.push(`${LABEL[f.severity]} [${f.id}]${f.tool ? ` ${short(f.tool)}:` : ""} ${clean(f.message)}`);
  }
  if (r.smoke.length > 0) {
    lines.push("Savuajo:");
    for (const s of r.smoke) lines.push(`  ${s.ok ? "OK    " : "VIRHE "} ${short(s.tool)} (${s.ms} ms)`);
  }
  if (r.tokens && r.tokens.perTool.length > 0) {
    const top = r.tokens.perTool.slice(0, 3).map((t) => `${short(t.tool)} ${t.tokens}`).join(", ");
    const budget = r.tokens.budget !== undefined ? ` / raja ${r.tokens.budget}` : "";
    lines.push(`Tokenit (arvio): työkalumäärittelyt yhteensä ${r.tokens.total}${budget}; suurimmat: ${top}`);
  }
  const { errors, warnings, infos } = r.summary;
  lines.push(`Yhteenveto: ${errors} virhettä, ${warnings} varoitusta, ${infos} huomiota -> ${r.ok ? "OK" : "EPÄONNISTUI"}`);
  return lines.join("\n") + "\n";
}

export function formatJson(r: Report): string {
  return JSON.stringify(r, null, 2) + "\n";
}
