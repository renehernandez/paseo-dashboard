# Paseo Dashboard

Paseo Dashboard is a client-only [Paseo](https://paseo.sh) plugin for monitoring one workspace. It highlights agents that need input, failed agents, active work, and completed work in a responsive native panel.

## Features

- Live workspace agent directory updates
- Root-agent and subagent hierarchy
- Attention-first status ordering with text labels
- Bounded, demand-loaded timeline previews
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

The summary reports the number of working, needs-input, and failed agents. The attention strip orders agents by required action:

1. Pending permission
2. Error or failed state
3. Explicit attention
4. Running work
5. Done work

The hierarchy derives parent relationships from Paseo's agent directory and orders siblings by creation time. Select **Show recent activity** to fetch a bounded timeline tail. A visible running preview observes live updates until you hide it or leave the panel. Preview errors do not remove the agent card or its **Open agent** action.

Older Paseo clients that do not provide plugin navigation omit **Open agent** and show an explanatory message.

## Develop

Use Node 26 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run unit-test
```

`pnpm run typecheck` validates the client-only source against `@getpaseo/plugin` 0.8.0. `pnpm run unit-test` covers hierarchy, state ordering, directory reconciliation, bounded preview summaries, and subscription release.

Reload an installed local checkout after source changes:

```sh
paseo plugin reload paseo-dashboard
```

## Privacy and scope

The plugin reads information already available to the connected, authorized Paseo client. It keeps directory and preview state in memory, requests at most 12 projected timeline entries per preview, and sends no telemetry.

Paseo Dashboard v1 does not answer permission requests, send prompts, create or archive agents, expose terminal controls, or manage workflow state. The full conversation and all agent controls remain in Paseo's agent view.

## Compatibility

The UI uses React Native components and Paseo theme tokens for web, iOS, and Android clients. Compact browser behavior is part of v1 verification. Physical iOS and Android interaction remains a documented post-v1 verification gap.

## License

Apache-2.0. See [LICENSE](LICENSE).
