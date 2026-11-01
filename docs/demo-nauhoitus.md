# Demon nauhoitus (GIF / LinkedIn)

Tama ohje on sinulle, joka nauhoitat [demon](demo.md) terminaalitallenteeksi. Kaikki kestaa noin 10 minuuttia. Nauhoitus ei tarvitse verkkoa eika ulkoisia MCP-palvelimia: skripti ajaa vain repon omat `examples/demo/`-palvelimet.

## 1. Tyokalut

Tarvitset kaksi tyokalua. Mikaan ei tule repon mukana, asenna itse:

| Tarve | Suositus | Asennus (esimerkki) |
| --- | --- | --- |
| Nauhoitus | `asciinema` | `sudo apt install asciinema` tai `pipx install asciinema` |
| GIF-muunnos | `agg` | binaari: https://github.com/asciinema/agg/releases |

Vaihtoehdot, jos asciinema/agg ei onnistu:

- `script` (util-linux, yleensa valmiina) + `scriptreplay`: tallentaa istunnon ajastuksineen, mutta ei tee GIF:ia. Kayta sitten ruudunnauhoitusta (esim. OBS tai kayttojarjestelman oma) ja muunna video GIF:ksi `ffmpeg`-ohjelmalla.
- `vhs` (Charm): kirjoitat `.tape`-tiedoston, joka tuottaa GIF:n suoraan.
- Yksinkertaisin: ruudunnauhoitus + `ffmpeg`.

## 2. Terminaalin asetukset

- Koko: **100 x 28** merkkia (tarkista: `echo "$COLUMNS x $LINES"`).
- Fontti: monospace, 16-18 pt (esim. JetBrains Mono tai DejaVu Sans Mono). Tulosteen pisin rivi on noin 140 merkkia, joten LinkedIn-GIF:ssa se rivittyy: se on ok, mutta kayta tummaa taustaa ja isoa fonttia, jotta teksti pysyy luettavana.
- Tumma teema, kayta samaa joka kerta.
- Sulje muut ikkunat ja piilota shell-kehote: `export PS1='$ '`.
- Valmistelu kerran: `git clone https://github.com/tonyweckstrom1987/mcp-doctor.git && cd mcp-doctor && npm ci`

## 3. Nauhoitus

Skripti `scripts/demo-nauhoitus.sh` tulostaa otsikon, ajaa `npm run demo:ennen`, odottaa, tulostaa toisen otsikon, ajaa `npm run demo:jalkeen` ja odottaa. Tauko on oletuksena 4 s (parametri tai `DEMO_TAUKO`).

Harjoittele ensin ilman nauhoitusta:

```bash
scripts/demo-nauhoitus.sh 2
```

Nauhoita ja muunna:

```bash
asciinema rec --cols 100 --rows 28 -c "scripts/demo-nauhoitus.sh 4" demo.cast
agg --font-size 18 --theme monokai demo.cast demo.gif
```

Jos haluat nauhoittaa ajot erikseen (lyhyempi GIF per ajo):

```bash
asciinema rec --cols 100 --rows 28 -c "npm run --silent demo:ennen" ennen.cast
asciinema rec --cols 100 --rows 28 -c "npm run --silent demo:jalkeen" jalkeen.cast
```

Katso tulos ennen julkaisua: `asciinema play demo.cast`. Tarkista, ettei tallenteessa nay kotihakemistoa, kayttajanimea tai muuta yksityista (kehote!).

## 4. Odotettu tuloste

Millisekunnit vaihtelevat koneittain. Poistumiskoodi tulostuu skriptin lopussa riville `[poistumiskoodi: N]`.

Ensimmainen ajo, `npm run demo:ennen` (poistumiskoodi 1):

```
mcp-doctor: node examples/demo/ennen.mjs
Palvelin: muistio-demo 0.1.0, 3 tyokalua
VIRHE    [SMOKE_TOOL_ERROR] search_notes: ... toLowercase is not a function
VAROITUS [SCHEMA_PROP_DESC_MISSING] add_note: kentalta 'text' puuttuu kuvaus
VAROITUS [SCHEMA_PROP_DESC_MISSING] add_note: kentalta 'tags' puuttuu kuvaus
VAROITUS [SCHEMA_PROP_UNTYPED] search_notes: kentalla 'query' ei ole tyyppia ...
VAROITUS [SCHEMA_PROP_DESC_MISSING] search_notes: kentalta 'query' puuttuu kuvaus
VAROITUS [TOOL_DESC_MISSING] delete_note: kuvaus puuttuu ...
HUOMIO   [TOOL_DESC_SHORT] search_notes: kuvaus on hyvin lyhyt (6 merkkia)
Savuajo:
  OK     add_note
  VIRHE  search_notes
  OK     delete_note
Yhteenveto: 1 virhetta, 5 varoitusta, 1 huomiota -> EPAONNISTUI
```

Toinen ajo, `npm run demo:jalkeen` (poistumiskoodi 0):

```
mcp-doctor: node examples/demo/jalkeen.mjs
Palvelin: muistio-demo 0.2.0, 3 tyokalua
Savuajo:
  OK     add_note
  OK     search_notes
  OK     delete_note
Yhteenveto: 0 virhetta, 0 varoitusta, 0 huomiota -> OK
```

(Todellinen tuloste on taydellinen ja skandein: yllaoleva on tiivistetty ASCII-muotoon. Taysi versio on [demo.md](demo.md):ssa.)

## 5. Kolmen minuutin haastatteluesitys

Kayta GIF:ia tai aja skripti livena.

1. **0:00-0:30, ongelma.** MCP-palvelin kattelee oikein, joten Claude Desktop tai Cursor ei kerro vioista. Tyokalut vain toimivat huonosti. Kukaan ei huomaa ennen kuin malli kayttaa niita vaarin.
2. **0:30-1:30, ennen-ajo.** Nayta `demo:ennen`. Kay lapi: yksi oikea virhe (kirjoitusvirhe `toLowercase`, jonka vain oikea kutsu eli savuajo paljastaa), viisi varoitusta (kuvaukset ja tyypit puuttuvat, joiden perusteella malli valitsee ja taytta tyokalut). Poistumiskoodi 1: CI kaatuu.
3. **1:30-2:15, jalkeen-ajo.** Nayta `demo:jalkeen`: sama palvelin korjattuna, 0/0/0, koodi 0. Korosta, etta korjaukset ovat pienia.
4. **2:15-2:45, turvallisuus.** mcp-doctor kutsuu vain `savuajo.json`-tiedostossa nimettyja tyokaluja. `delete_note` kutsutaan olemattomalla tunnisteella ja `expectError: true`, joten mitaan ei poisteta.
5. **2:45-3:00, CI.** Sama GitHub Actionina (`--strict` kaataa varoituksista). Mainitse oikea loydos: virallisen `@modelcontextprotocol/server-memory`-palvelimen neljasta tyokalusta puuttui kuvaus.

## 6. Vianhaku

- `dist/bin.js puuttuu`: aja `npm ci` (kaantaa projektin).
- Ennen-ajon poistumiskoodi 1 on odotettu, ei virhe.
- Teksti hajoaa GIF:ssa: pienenna fonttia tai kasvata `--cols`-arvoa.
