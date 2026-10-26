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

## Removal

An author can ask for an entry to be removed: open an issue.
The entry moves to `removed.json` with the reason, and the next media server release drops it.
