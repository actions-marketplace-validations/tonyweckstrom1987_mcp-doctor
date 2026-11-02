# Demo: rikkinäinen MCP-palvelin ennen ja jälkeen

*English version below.*

Tämä demo näyttää kolmessa minuutissa, mitä mcp-doctor löytää ja miksi sillä on väliä. Demopalvelin on pieni muistiinpanopalvelin, joka käynnistyy ja vastaa kättelyyn normaalisti. MCP-asiakas (Claude Desktop, Cursor) ei siis kerro sen vioista mitään: työkalut vain toimivat huonosti tai kaatuvat kesken.

Tiedostot:

- [`examples/demo/ennen.mjs`](../examples/demo/ennen.mjs): palvelin, jossa on viisi tyypillistä vikaa (merkitty kommentein `Vika 1–5`)
- [`examples/demo/jalkeen.mjs`](../examples/demo/jalkeen.mjs): sama palvelin korjattuna
- [`examples/demo/savuajo.json`](../examples/demo/savuajo.json): kolme työkalukutsua, joista yksi odottaa virhettä

Testi [`test/demo.test.ts`](../test/demo.test.ts) ajaa demon jokaisessa CI-ajossa, joten alla oleva tuloste pysyy totena.

## Valmistelu (kerran)

```bash
git clone https://github.com/tonyweckstrom1987/mcp-doctor.git
cd mcp-doctor
npm ci          # asentaa ja kääntää
```

## 1. Ennen: palvelin "toimii", mutta

```bash
npm run demo:ennen
```

```
mcp-doctor: node examples/demo/ennen.mjs
Palvelin: muistio-demo 0.1.0, 3 työkalua
VIRHE    [SMOKE_TOOL_ERROR] search_notes: työkalu palautti virheen: String(...).trim(...).toLowercase is not a function
VAROITUS [SCHEMA_PROP_DESC_MISSING] add_note: kentältä 'text' puuttuu kuvaus
VAROITUS [SCHEMA_PROP_DESC_MISSING] add_note: kentältä 'tags' puuttuu kuvaus
VAROITUS [SCHEMA_PROP_UNTYPED] search_notes: kentällä 'query' ei ole tyyppiä (type/enum/const/$ref/anyOf/oneOf/allOf): skeema on liian väljä
VAROITUS [SCHEMA_PROP_DESC_MISSING] search_notes: kentältä 'query' puuttuu kuvaus
VAROITUS [TOOL_DESC_MISSING] delete_note: kuvaus puuttuu: malli ei tiedä milloin työkalua kuuluu käyttää
HUOMIO   [TOOL_DESC_SHORT] search_notes: kuvaus on hyvin lyhyt (6 merkkiä)
Savuajo:
  OK     add_note (5 ms)
  VIRHE  search_notes (1 ms)
  OK     delete_note (1 ms)
Yhteenveto: 1 virhettä, 5 varoitusta, 1 huomiota -> EPÄONNISTUI
```

Poistumiskoodi on `1`, joten CI-ajo kaatuu. (npm tulostaa perään oman virheilmoituksensa, koska skripti palautti muun kuin nollan. Se on odotettua.)

## 2. Jälkeen: sama palvelin korjattuna

```bash
npm run demo:jalkeen
```

```
mcp-doctor: node examples/demo/jalkeen.mjs
Palvelin: muistio-demo 0.2.0, 3 työkalua
Savuajo:
  OK     add_note (5 ms)
  OK     search_notes (1 ms)
  OK     delete_note (0 ms)
Yhteenveto: 0 virhettä, 0 varoitusta, 0 huomiota -> OK
```

Molemmat skriptit ajavat `--strict`-tilassa, eli varoituksetkin kaatavat ajon. Millisekunnit vaihtelevat koneittain.

## Mitä kukin löydös tarkoittaa

| Vika demossa | Tunniste | Miksi sillä on väliä |
| --- | --- | --- |
| 1. `text`- ja `tags`-kentiltä puuttuu `.describe(...)` | `SCHEMA_PROP_DESC_MISSING` | Malli täyttää kentät pelkän nimen perusteella. Esim. `tags`: lista mitä, missä muodossa? |
| 2. `search_notes`-kuvaus on "Search" | `TOOL_DESC_SHORT` | Malli valitsee työkalun kuvauksen perusteella. Kuusi merkkiä ei kerro, mitä haetaan tai mitä palautetaan. |
| 3. `query: z.any()` | `SCHEMA_PROP_UNTYPED` | Skeema hyväksyy mitä tahansa, joten virheellinen syöte pääsee koodiin asti. |
| 4. Kirjoitusvirhe `toLowercase` | `SMOKE_TOOL_ERROR` | Skeematarkistus ei näe ajonaikaista bugia. Vain oikea kutsu (savuajo) paljastaa sen. |
| 5. `delete_note` ilman kuvausta | `TOOL_DESC_MISSING` | Poistava työkalu ilman kuvausta on riski: malli ei tiedä, että toiminto on peruuttamaton. |

Vika 1 ei ole keksitty. Sama puute (taulukkokenttä ilman kuvausta) löytyi mcp-doctorilla virallisen `@modelcontextprotocol/server-memory`-palvelimen neljästä työkalusta lokakuussa 2026.

## Huomaa savuajossa

`delete_note` kutsutaan olemattomalla tunnisteella (`999`) ja `expectError: true`. Näin poistotyökalu testataan ilman, että mitään poistetaan. mcp-doctor ei koskaan kutsu työkaluja arvaamalla: vain `savuajo.json`-tiedostossa nimetyt kutsut ajetaan.

## Sama CI:ssä

```yaml
- uses: tonyweckstrom1987/mcp-doctor@v0.4.1
  with:
    command: node examples/demo/jalkeen.mjs
    smoke: examples/demo/savuajo.json
    strict: "true"
```

## Usein kysyttyä demossa

- **Miksi puuttuva kuvaus on vain varoitus?** Palvelin toimii protokollan mukaan. Haitta näkyy mallin käytöksessä, ei virheenä. `--strict` tekee varoituksista CI:ssä kaatavia.
- **Miksi ei kutsuta kaikkia työkaluja automaattisesti?** Työkalu voi muuttaa dataa (kuten `delete_note`). Turvallinen oletus on kutsua vain sitä, minkä ihminen on nimennyt.
- **Mitä tämä ei tarkista?** `resources`- ja `prompts`-osiot, OAuth, vanha SSE-siirto ja täysi JSON Schema -validointi jäävät pois. Ks. README, kohta Rajaukset.

---

# Demo: a broken MCP server, before and after

A three-minute demo of what mcp-doctor finds and why it matters. The demo server is a small notes server that starts and completes the handshake normally, so an MCP client gives no hint that anything is wrong.

Files: [`examples/demo/ennen.mjs`](../examples/demo/ennen.mjs) ("before", five typical defects marked `Vika 1–5`), [`examples/demo/jalkeen.mjs`](../examples/demo/jalkeen.mjs) ("after", fixed), [`examples/demo/savuajo.json`](../examples/demo/savuajo.json) (smoke calls). [`test/demo.test.ts`](../test/demo.test.ts) runs the demo in CI so the documented output stays accurate.

```bash
git clone https://github.com/tonyweckstrom1987/mcp-doctor.git && cd mcp-doctor && npm ci
npm run demo:ennen     # 1 error, 5 warnings, 1 info -> exit 1
npm run demo:jalkeen   # 0 / 0 / 0 -> exit 0
```

| Defect | Finding | Why it matters |
| --- | --- | --- |
| Fields without `.describe(...)` | `SCHEMA_PROP_DESC_MISSING` | The model fills arguments from the field name alone. |
| Tool description "Search" | `TOOL_DESC_SHORT` | The model picks tools by description; six characters say nothing. |
| `query: z.any()` | `SCHEMA_PROP_UNTYPED` | The schema accepts anything, so bad input reaches the code. |
| Typo `toLowercase` | `SMOKE_TOOL_ERROR` | Schema lint cannot see runtime bugs; only a real call (smoke run) does. |
| Delete tool without description | `TOOL_DESC_MISSING` | The model cannot tell the action is irreversible. |

The first defect is real-world: the same gap (array field without a description) was found with mcp-doctor in four tools of the official `@modelcontextprotocol/server-memory` in October 2026.

The smoke file calls `delete_note` with a non-existent id and `expectError: true`, so the destructive tool is exercised without deleting anything. mcp-doctor never calls tools by guessing.
