# Käytä CI:ssä

*English summary: run `mcp-doctor` as a CI step; the exit code (0 ok, 1 findings, 2 usage error, 3 internal error) fails the job. `--strict` makes warnings fail too.*

mcp-doctor on tehty CI:hin: yksi komento, jonka poistumiskoodi kertoo työnkululle, meneekö ajo läpi.

## GitHub Actions -esimerkki

Käytä valmista Actionia. Tämä esimerkki olettaa, että palvelimesi käännetään komennolla `npm run build` ja käynnistyy komennolla `node dist/index.js`. Korvaa komennot omillasi.

```yaml
name: mcp-doctor
on: [push, pull_request]

jobs:
  tarkistus:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci && npm run build        # oma palvelimesi
      - uses: tonyweckstrom1987/mcp-doctor@v0.4.1
        with:
          command: node dist/index.js
          smoke: smoke.json                 # valinnainen, katso README: Savuajo
          strict: "true"                    # valinnainen, katso alla
```

Lukitse Action versiotagiin (`@v0.4.1`) tai commit-SHA:han, älä `@main`-haaraan. Kaikki syötteet (`command`, `url`, `smoke`, `strict`, `timeout-ms`, `env-names`, `bearer-env`) on kuvattu [README:n GitHub Action -osiossa](../README.md#github-action) ja tiedostossa [`action.yml`](../action.yml). Anna joko `command` tai `url`, ei molempia.

Ilman Actionia voit ajaa CLI:n suoraan:

```yaml
      - run: npx @tonyweckstrom/mcp-doctor --strict --smoke smoke.json -- node dist/index.js
```

## Poistumiskoodit

CI-järjestelmä kaataa askeleen, kun komento palauttaa muun kuin `0`. mcp-doctor käyttää näitä (lähde: `src/cli.ts`):

| Koodi | Merkitys | Esimerkki |
| --- | --- | --- |
| `0` | kunnossa | ei virheitä (eikä varoituksia, jos `--strict`) |
| `1` | löydöksiä | palvelin ei yhdisty, `tools/list` epäonnistuu, skeemavirhe tai epäonnistunut savukutsu |
| `2` | käyttö- tai tiedostovirhe | tuntematon valinta, savuajotiedostoa ei löydy, sekä `--url` että komento |
| `3` | odottamaton sisäinen virhe | mcp-doctorin oma vika; ilmoita se |

Koodi `1` tarkoittaa, että tarkastettavassa palvelimessa on jotain korjattavaa. Koodi `2` tarkoittaa, että työnkulun kutsu on väärin (korjaa komento tai polku).

## `--strict`

Oletuksena vain **virheet** (`VIRHE`) kaatavat ajon. **Varoitukset** (`VAROITUS`) näkyvät raportissa, mutta poistumiskoodi on silti `0`. Huomiot (`HUOMIO`) eivät kaada ajoa koskaan.

`--strict` (Actionissa `strict: "true"`) tekee varoituksista kaatavia: jo yksi varoitus antaa koodin `1`. Käytä sitä, kun haluat estää kuvausten ja skeemojen rapistumisen. Aloita ilman sitä, jos olemassa olevassa palvelimessa on paljon varoituksia, ja ota se käyttöön kun ne on korjattu.

Sama palvelin, jossa on yksi varoitus (kentältä puuttuu kuvaus):

```
$ mcp-doctor -- node palvelin.mjs
VAROITUS [SCHEMA_PROP_DESC_MISSING] hae: kentältä 'id' puuttuu kuvaus
Yhteenveto: 0 virhettä, 1 varoitusta, 0 huomiota -> OK            # exit 0

$ mcp-doctor --strict -- node palvelin.mjs
VAROITUS [SCHEMA_PROP_DESC_MISSING] hae: kentältä 'id' puuttuu kuvaus
Yhteenveto: 0 virhettä, 1 varoitusta, 0 huomiota -> EPÄONNISTUI   # exit 1
```

## Kokeile paikallisesti ennen CI:tä

Repon mukana tulevilla demopalvelimilla (ei ulkoisia riippuvuuksia):

```bash
npm ci && npm run build
node dist/bin.js --strict --smoke examples/demo/savuajo.json -- node examples/demo/jalkeen.mjs; echo "exit=$?"   # 0
node dist/bin.js --strict --smoke examples/demo/savuajo.json -- node examples/demo/ennen.mjs;   echo "exit=$?"   # 1
```

Katso myös [demo](demo.md).

## Huomioita

- Savuajo kutsuu vain tiedostossa nimetyt työkalut. Älä nimeä työkaluja, jotka muuttavat tuotantodataa.
- CI-lokiin päätyy stdio-palvelimen viimeinen stderr-teksti, jos yhteys epäonnistuu. Älä kirjoita salaisuuksia palvelimen lokiin.
- `--json` tulostaa raportin koneluettavana, jos haluat käsitellä sen myöhemmin työnkulussa.
