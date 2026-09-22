# Paseo Dashboard

Paseo Dashboard is a client-only [Paseo](https://paseo.sh) plugin for monitoring one workspace. It makes the agents you work with the primary workspace objects while keeping their background work close at hand in a responsive native panel.

## Features

- Live workspace agent directory updates
- Interaction-ordered agent cards with recursive background summaries
- Collapsible background rows with orphan and cycle retention
- Bounded, demand-loaded timeline previews with coalesced live refreshes
- Direct navigation to the full Paseo agent view when the host supports it
- Wide and compact React Native layouts
- No server process, persisted plugin state, telemetry, or copied conversation history

## Requirements

- Paseo 0.8.0 or later
- Plugins enabled on the target Paseo daemon

## Install

Install the repository through Paseo:

```sh
paseo plugin add renehernandez/paseo-dashboard
paseo plugin ls
```

For local development, install the checkout by absolute path:

```sh
paseo plugin install /absolute/path/to/paseo-dashboard
paseo plugin ls
```

`paseo plugin ls` should report `paseo-dashboard` as running. The manifest has no build command and the repository has no server entry point. Paseo compiles the client source and supplies its runtime dependencies.

Open a workspace, launch the Command Center, and select **Open workspace dashboard**. You can also open the **Dashboard** workspace panel directly.

## Use the dashboard

The summary reports the number of working, needs-input, and failed agents. **Your agent** cards are agents without a parent label, ordered by their latest user interaction with creation time as a fallback. Background activity does not reorder them.

Each card summarizes all recursively owned background agents while collapsed. Expand the summary to show dense background rows with their status, activity, and parent context. Missing-parent, self-linked, and cyclic agents remain available under the collapsed **Other background agents** section instead of disappearing.

Permission requests and failures remain actionable. Running work stays **Working**; a finished or generic attention flag does not create a separate state and resolves from the agent lifecycle instead. Select **Show recent activity** on an individual row to fetch its bounded timeline tail. Expanding a background group alone does not request timelines. A mounted running preview observes relevant live events, permits one timeline refetch at a time, and coalesces bursts until you hide it, collapse its group, or leave the panel. Preview errors do not remove the row or its **Open agent** action.

Older Paseo clients that do not provide plugin navigation omit **Open agent** and show an explanatory message.

## Develop

Use Node 26 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run unit-test
```

`pnpm run typecheck` validates the client-only source against `@getpaseo/plugin` 0.8.0. `pnpm run unit-test` covers interactive ordering, recursive ownership and status summaries, orphan retention, visible-row disclosure, directory reconciliation, bounded preview summaries, subscription release, and native Hermes syntax.

The native syntax test uses TypeScript's portable System-module emission at ES2016. This keeps unsupported class expressions visible while lowering async syntax. The test then compiles that JavaScript with the Hermes compiler supplied by the declared React Native version.

This test guards the production state-owner modules on supported development and CI platforms. It does not reproduce Paseo's bundler. Compatibility verification also compiles the Paseo host-equivalent bundle separately. Browser integration, native parser compilation, and physical-device interaction are distinct checks.

Reload an installed local checkout after source changes:

```sh
paseo plugin reload paseo-dashboard
```

## Privacy and scope

The plugin reads information already available to the connected, authorized Paseo client. It keeps directory and preview state in memory, requests at most 12 projected timeline entries per refresh, coalesces live refresh bursts, and sends no telemetry.

Paseo Dashboard v1 does not answer permission requests, send prompts, create or archive agents, expose terminal controls, or manage workflow state. The full conversation and all agent controls remain in Paseo's agent view.

## Compatibility

The UI uses React Native components and Paseo theme tokens for web, iOS, and Android clients. Wide and compact browser behavior and native Hermes parser compatibility are automated separately. Physical iOS and Android interaction still requires a connected device or emulator and must not be inferred from either automated check.

## License

Apache-2.0. See [LICENSE](LICENSE).
