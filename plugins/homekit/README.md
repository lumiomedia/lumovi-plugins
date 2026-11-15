# Apple Home

Works with Apple Home. The official Lumio plugin for playback-triggered
lighting and automation scenes in Apple Home.

Svenska: Fungerar med Apple Hem. Det officiella Lumio-pluginet för scener och
automationer i Apple Hem som styrs av uppspelningen.

This plugin is currently scaffolded as metadata-first while core still owns the
runtime event pipeline.

## Intended scope

- configure the Apple Home accessory and pairing state
- react to playback events such as start, pause and close
- drive dimming and scene transitions from Lumio playback state
- own Apple Home status and reset flows through a plugin settings section

## SDK gap

Apple Home needs a plugin-facing playback event contract so core can emit
neutral events without importing Apple Home-specific code directly.

## Migration status

Current Lumio builds still call the Apple Home integration from core playback
components. This plugin folder is the starting point for moving that behavior
behind the SDK.
