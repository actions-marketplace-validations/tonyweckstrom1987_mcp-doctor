# mcp-doctor

Health check for MCP servers: one command, or one GitHub Action step, that tells you whether your server completes the `initialize` handshake, has well-formed tool descriptions and schemas, and answers real tool calls.

*Suomenkielinen versio: [README.fi.md](README.fi.md).*

## Use as a GitHub Action

Copy this into `.github/workflows/mcp-doctor.yml` (also in [examples/workflow.yml](examples/workflow.yml)). It builds your server, starts it, and fails the job if mcp-doctor finds problems:

```yaml
name: mcp-doctor
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24 }
      - run: npm ci && npm run build   # build your own server
      - uses: tonyweckstrom1987/mcp-doctor@v0.4.1
        with:
          command: node dist/index.js  # your server's start command
          strict: "true"               # warnings fail the job too
```

Pin to a version tag or a commit SHA, never `@main`.

Inputs: `command` or `url` (use one of them), `smoke`, `strict`, `timeout-ms`, `env-names`, `bearer-env`.

- A stdio server sees only the environment variables you name. Set the values in the `env` block of the action step and list the names (separated by spaces) in `env-names`.
- For an HTTP server, set the token from a secret in the `env` block and pass the variable's name in `bearer-env`.
- Inputs are passed to the shell as environment variables, not on the command line, so they cannot inject commands.

More CI detail (exit codes, `--strict`): [docs/ci.md](docs/ci.md) (in Finnish).

## Use with npx

No installation needed (Node 22.12+ or 24):

```bash
npx @tonyweckstrom/mcp-doctor -- node ./my-server/dist/index.js
```

The server command goes after `--`. For a Streamable HTTP server, optionally with a Bearer token read from an environment variable:

```bash
export DOCTOR_TOKEN=...   # set it yourself, do not paste the token on the command line
npx @tonyweckstrom/mcp-doctor --url http://127.0.0.1:3000/mcp --bearer-env DOCTOR_TOKEN
```

Or install globally (the command is then `mcp-doctor`):

```bash
npm install -g @tonyweckstrom/mcp-doctor
mcp-doctor --version
```

Example output with smoke calls. The tool and finding messages in the report are in Finnish at the moment:

```
mcp-doctor: node ../starter/dist/index.js
Palvelin: mcp-server-starter 0.1.0, 2 työkalua
Savuajo:
  OK     greet (4 ms)
  OK     add (1 ms)
Yhteenveto: 0 virhettä, 0 varoitusta, 0 huomiota -> OK
```

| Option | Meaning |
| --- | --- |
| `--smoke <file>` | smoke calls: calls only the tools named in the file |
| `--json` | report as JSON |
| `--strict` | warnings fail the run too |
| `--timeout-ms <number>` | timeout for a single request, default 10000 |
| `--env <NAME>` | pass an environment variable to the stdio server (repeatable) |
| `--bearer-env <NAME>` | read the HTTP server's Bearer token from this variable |
| `--version` | print the version |

Exit codes: `0` healthy, `1` findings (an error, or a warning with `--strict`), `2` usage or file error, `3` unexpected internal error.

Smoke calls run **only** the tools named in the smoke file, with the arguments you give. Tools are never called by guessing, because a tool may change data. Leave out tools that modify data or point them at a test environment.

```json
{
  "calls": [
    { "tool": "greet", "arguments": { "name": "Tony" } },
    { "tool": "delete_all", "arguments": {}, "expectError": true },
    { "tool": "slow_search", "arguments": { "q": "x" }, "maxMs": 15000 }
  ]
}
```

Fields: `tool` (required), `arguments` (default `{}`), `expectError` (default `false`), `maxMs` (default 5000). A plain array also works.

## What it checks

| Code | Severity | What |
| --- | --- | --- |
| `CONNECT_FAILED` | error | connection or `initialize` failed, including an unknown protocol version. For stdio servers the message includes the last stderr text |
| `SERVER_INFO_MISSING` | warning | the server does not report its name |
| `TOOLS_CAPABILITY_MISSING` | warning | the server does not declare the tools capability |
| `TOOLS_LIST_FAILED` | error | `tools/list` failed |
| `TOOLS_EMPTY` | warning | tools capability declared, but the list is empty |
| `TOOLS_PAGINATION_LIMIT` | warning | the list continued past 50 pages, reading was stopped |
| `TOOLS_PAGINATION_LOOP` | warning | the server returned the same `nextCursor` again, listing was stopped |
| `TOOL_DUPLICATE` | error | the same tool name appears more than once |
| `TOOL_NAME_INVALID` | error | empty, longer than 128 characters, or characters other than `A-Z a-z 0-9 _ - .` |
| `TOOL_NAME_PORTABILITY` | warning | does not match `[A-Za-z0-9_-]{1,64}`, which some clients require |
| `TOOL_DESC_MISSING` / `TOOL_DESC_SHORT` | warning / info | description missing / shorter than 20 characters |
| `SCHEMA_NOT_OBJECT` | error | input schema is missing or its `type` is not `object` |
| `SCHEMA_REQUIRED_INVALID` / `SCHEMA_REQUIRED_UNKNOWN` | error | `required` is not a list of strings / names a property that does not exist |
| `SCHEMA_PROP_DESC_MISSING` | warning | a property has no description |
| `SCHEMA_PROP_UNTYPED` | warning | a property has none of `type`/`enum`/`const`/`$ref`/`anyOf`/`oneOf`/`allOf` |
| `SCHEMA_ARRAY_ITEMS_MISSING` | warning | an array property has no `items` (at any level); for example Gemini and OpenAI strict mode reject such schemas |
| `SCHEMA_NESTED_DESC_MISSING` / `SCHEMA_NESTED_PROP_UNTYPED` | info | a property inside a nested object, array item or `anyOf`/`oneOf`/`allOf` branch has no description / type. The path is in the message, e.g. `entities[].name` |
| `OUTPUT_SCHEMA_NOT_OBJECT` | error | `outputSchema` is not an `object` |
| `SMOKE_TOOL_NOT_FOUND` | error | the smoke file names a tool the server does not have |
| `SMOKE_TOOL_ERROR` | error | the tool returned `isError` although no error was expected |
| `SMOKE_EXPECTED_ERROR` | error | an expected error did not occur |
| `SMOKE_EXPECTED_PROTOCOL_ERROR` | info | the expected error came as a JSON-RPC error, not as an `isError` result |
| `SMOKE_CALL_FAILED` | error | the call failed (timeout, protocol error, `outputSchema` requirement violated) |
| `SMOKE_EMPTY_RESULT` | warning | the result is empty |
| `SMOKE_SLOW` | warning | the response took longer than `maxMs` (default 5000) |

Nested schemas are checked up to 8 levels deep. The check is lightweight (structure, `required`, types, descriptions), not full JSON Schema validation, and `$ref` references are not followed.

## Security

- The tool starts the command you give it and talks only to that server. It makes no other network connections and needs no API keys.
- A stdio server receives only `PATH` and basic variables. Other environment variables are passed only if you name them with `--env`.
- The Bearer token is read from an environment variable, not from the command line, and it is never printed. The printed target address omits query parameters.
- In the printed target line of a stdio command, arguments that look secret are masked (`--token`, `--api-key`, `--password`, `NAME_TOKEN=…`, credentials and query parameters in URLs). This is a safety net: pass secrets with `--env` rather than on the command line.
- The report contains no tool results, only the first line of an error text (at most 300 characters).
- A connection error message includes the last stderr text of a stdio server. If your server logs secrets there, they end up in the CI log.

## Limitations

No legacy SSE transport and no OAuth login. It checks tools only, not `resources` or `prompts`.

## More

- [docs/demo.md](docs/demo.md): three-minute before/after demo (`npm run demo:ennen`, `npm run demo:jalkeen`), English included.
- [CHANGELOG.md](CHANGELOG.md), [README.fi.md](README.fi.md) (full documentation in Finnish, including a comparison with other MCP testing tools).

## Development

```bash
npm ci
npm run typecheck
npm test        # starts real stdio and HTTP test servers
```

## License

MIT
