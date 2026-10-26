# nomercy-visualizers

The music visualizers NoMercy ships: GPU shaders and MilkDrop presets.
Every entry carries its own name, author and license.

The NoMercy media server bundles this content and serves it to every client.
The web app and the KMP apps (Android, iOS, TV, desktop) read the same files.

## Layout

```
shaders/            one shader per .glsl file, or one folder per multi-pass shader
  <id>.glsl         header lines: format, name, author, license
  <id>/kodelife.json + passes   multi-pass (KodeLife) shader
milkdrop/
  manifest.json     one entry per preset: id, name, author, textures
  presets/<id>.json one preset per file (equations as EEL text; never JavaScript)
  textures/         textures the presets use
  rights.json       license texts the presets and textures fall under
  removed.json      presets taken out on request, with the reason
  unrenderable.json presets that do not render, with the reason
```

## Formats

A shader file starts with header comments:

```glsl
// format: twigl-geekest | shadertoy | kodelife
// name: 4D Fractal
// author: mrange
// license: CC0 1.0 (where the permission was given)
```

A MilkDrop preset is JSON with its equations as EEL source text.
A client runs EEL only in a sandbox (WebAssembly on the web).
A preset with JavaScript equations is refused, here and in every client.

## Credits

Each entry names its author and license.
All of mrange's shaders are credited to mrange, at his request.
The MilkDrop presets come from the projectM preset collection; `rights.json` holds their license texts.
Each preset links its projectM source file (`sourceUrl`, pinned to one commit).
Each preset names its author: from the `Author - Name` file name, or from the author tags at the start of a file name without that separator.

## Bundle

`npm run build:bundle` reads every shader and preset and writes `dist/`:

```
visualizers-bundle.json       raw bundle
visualizers-bundle.json.gz    the file the media server pins
textures/<name>.jpg           served at GET /visualizers/textures/<name>.jpg
```

The bundle is `{ bundle_schema, bundle_hash, entries, textures }`.
Each entry has `slug` (`milkdrop/<id>` or `shader/<id>`, unique), `name`, `author`, `license`, `source_url`, `tags`, `format`, `content_hash`, `renderable` and the `payload`.
`content_hash` is the SHA-256 of the payload as canonical JSON: sorted keys, no whitespace.
`renderable.webgl2` is false for the presets in `unrenderable.json`; clients hide what they cannot run.
The build checks every entry against `schema/visualizer-entry.v1.schema.json` and `schema/visualizer-payload.v1.schema.json` (Ajv, strict).
A payload with `useJS`, a non-empty `*_eqs_str` or an unknown key fails the build.

`packages/converters` holds the converters as pure functions: the twigl and Shadertoy wrappers, the KodeLife folder reader and the MilkDrop preset build.
The build and the web app import the same code.

`npm test` runs the tests, `npm run typecheck` the type check.
A `v*` tag runs the same checks and attaches `visualizers-bundle.json.gz` and the textures to the GitHub release.

The media server pins one release: it copies `visualizers-bundle.json.gz` into its repo, embeds it, and fetches nothing from this repo at build time.
To update, copy the file from a newer release and commit it.

## Removal

An author can ask for an entry to be removed: open an issue.
The entry moves to `removed.json` with the reason, and the next media server release drops it.
