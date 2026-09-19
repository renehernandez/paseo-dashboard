# Paseo Dashboard v1

## Objective

Create `renehernandez/paseo-dashboard` as a public, standalone Paseo plugin that gives a user a native workspace operations hub. The first release must answer three questions at a glance: what is running, what needs attention, and which agent should the user open next.

## Scope

### Included

- Create the public GitHub repository with an initialized `main` branch, Apache-2.0 license, README, and Node-oriented ignore rules.
- Build one client-only Paseo plugin with plugin ID `paseo-dashboard` and minimum host version Paseo 0.8.0.
- Add a workspace-context **Dashboard** panel and a workspace Command Center item that opens it.
- Show a workspace summary, actionable attention queue, root-agent and subagent hierarchy, lifecycle state, elapsed/recent activity, and concise output previews.
- Let users open the corresponding agent through Paseo-owned navigation when the host supports it. Hide the action when navigation is unavailable.
- Make the panel responsive for wide and compact Paseo clients with React Native components and Paseo theme/layout tokens.
- Add public-repository documentation, focused automated verification, and GitHub Actions.

### Excluded from v1

- Permission responses, sending prompts, agent creation, archive or detach actions.
- Terminal, script, schedule, CI, pull-request, or hosted-review controls.
- A global cross-workspace dashboard or historical analytics.
- AX-specific phases, review semantics, metadata mappings, or presets.
- A server plugin entry point, plugin RPC, persisted plugin settings, npm publication, or installation-time build commands.
- Raw HTML, CSS, DOM access, WebView UI, or dependencies not supplied by Paseo at runtime.

## Observable behavior

- Opening Dashboard inside a workspace immediately shows the current aggregate workspace state and agents already known to Paseo.
- Newly created agents and lifecycle changes appear without manual refresh through one owned agent-directory subscription.
- Agents are grouped into roots and descendants using Paseo's `parentAgentId`; siblings remain ordered by creation time.
- Attention is ordered by required human action: pending permission, error or failed state, explicit attention, active work, then completed work.
- Each agent card names the agent, provider/model when available, current state, recent activity, and parent/child relationship without relying on color alone.
- Expanding or exposing an agent may load a bounded recent timeline tail. Live timeline observation exists only for visible running agents and is released when no longer needed.
- Output previews distinguish assistant output, errors, permissions, and tool activity without rendering a full duplicate chat transcript. The complete conversation remains owned by Paseo's agent view.
- Selecting **Open agent** uses `navigation.openAgent({ agentId })`. Older hosts that omit `navigation` see no broken action.
- Compact layouts use stacked cards and disclosure. Wide layouts may show denser metadata but preserve the same information and actions.
- Empty, loading, disconnected, unsupported-navigation, and timeline-fetch failure states remain honest and recoverable. A preview failure does not remove directory state or prevent opening the agent.
- The plugin stores no copied timeline or workspace history and sends no telemetry. State lives in the connected Paseo client and in-memory plugin subscriptions only.

## Selected approach

### Runtime and compatibility

Start from the Paseo 0.8.0 plugin scaffold and preserve its implementation boundary:

- `@getpaseo/plugin` 0.8.0
- React 19.1.0
- React Native 0.81.5
- TypeScript `^5.9.3`
- Zod `^4.4.3` only if a schema is required by shipped code
- Vitest `^4.1.6` for pure model and subscription-state tests
- Node 26 and pnpm for repository development and CI only

Paseo compiles the source at install time. `paseo-plugin.json` contains no build command. The plugin has no production dependency that requires package installation on the daemon host.

### Client architecture

Keep registration in `index.client.tsx`. Separate the implementation into:

- a workspace panel composed from small React Native components;
- a pure domain layer for hierarchy, status aggregation, attention ordering, and presentation models;
- one owned directory-subscription store with snapshot/upsert/remove reconciliation and deterministic cleanup;
- demand-loaded timeline preview helpers that fetch bounded history and observe only visible running agents.

Use React state and `useSyncExternalStore`-style subscription boundaries rather than adding a state-management or query library. Use Paseo's cached workspace/agent hooks where they fit exact focused records, and the public Paseo API with abortable effects for directory and bounded timeline operations.

### Repository and delivery

Bootstrap the public GitHub repository with an initial `main`, then implement on `feat/workspace-dashboard-v1`. Commit this reviewed plan as `.agents/plans/paseo-dashboard-v1.md` in the implementation change set. Publish one Ready GitHub pull request to `main`; creation does not authorize merge or deployment.

## Reuse and deviation contract

### Precedents and canonical owners

- Paseo's plugin quickstart and v0.8 reference own plugin layout, split-runtime boundaries, host-supplied dependencies, React Native rules, navigation, panels, and subscription cleanup:
  - https://github.com/getpaseo/paseo/blob/v0.8.0/public-docs/plugins/index.md
  - https://github.com/getpaseo/paseo/blob/v0.8.0/packages/plugin/src/client/contracts.ts
  - https://github.com/getpaseo/paseo/blob/v0.8.0/packages/cli/src/commands/plugin/scaffold.ts
- The local plugin example owns the agent-directory snapshot/update/cleanup pattern:
  - https://github.com/getpaseo/paseo/blob/main/plugin-examples/local-plugin/client/main.tsx
- Paseo's built-in subagent track owns hierarchy wording, mixed-state summaries, direct-child presentation, and compact interaction precedent:
  - https://github.com/getpaseo/paseo/blob/main/packages/app/src/subagents/track.tsx
  - https://github.com/getpaseo/paseo/blob/main/packages/app/src/subagents/track-presentation.ts
  - https://github.com/getpaseo/paseo/blob/main/packages/app/src/subagents/select.ts
- The settings and modal examples supply responsive native component and compact-layout precedent, but v1 does not add settings or custom modal state:
  - https://github.com/getpaseo/paseo/tree/main/plugin-examples/settings
  - https://github.com/getpaseo/paseo/tree/main/plugin-examples/modal-ui

### Reuse

Reuse Paseo's public directory, timeline, navigation, workspace-panel, theme, and layout contracts. Reuse its five user-facing state concepts: needs input, failed, working, attention, and done. Keep the full conversation and agent controls in Paseo's canonical agent screen.

### Necessary deviation

The built-in Subagents Track is scoped to an opened parent agent. No upstream plugin or core surface provides a workspace-wide, attention-first overview with bounded output previews. The new plugin adds that projection without replacing or copying Paseo's agent screen, subagent controls, persistence, or connection management.

## Risks and controls

- **Runtime drift:** Pin development to the Paseo 0.8 scaffold versions and import only public plugin APIs. Treat a newer Paseo release as a separate compatibility update.
- **Subscription leaks:** Centralize ownership and test release on unmount, filter change, replacement, and failure.
- **Excess timeline traffic:** Fetch bounded tails on demand and live-observe only visible running agents.
- **Misleading aggregate status:** Preserve distinct concurrent states and give needs-input/failure precedence; never turn an idle parent into proof that descendants are done.
- **Output disclosure:** Show only output already available to the connected authorized Paseo client, keep previews bounded, and persist nothing.
- **Mobile density:** Use compact disclosure and text alternatives; do not reproduce a desktop table on mobile.
- **Public bootstrap:** Seed only README/license/ignore state on `main`; all functional code and this plan go through the feature pull request.
- **Rollback:** Disable or remove the plugin. No migration, daemon data, or external service state requires rollback.

## Delivery shape

One atomic plan-plus-implementation change set and one final pull request are appropriate. Repository bootstrap is prerequisite provider setup, not an independently valuable product unit. The panel, directory model, previews, documentation, and verification form one coherent first user outcome and should not be split into setup-only pull requests.

## Acceptance and proof

### First visible proof

Install the plugin from the feature checkout into an isolated Paseo 0.8 host and open Dashboard for a seeded workspace. Show at least one root, one running child, one completed child, and one attention/error condition. Confirm that a newly created child appears live and **Open agent** routes to the correct Paseo agent.

### Automated layers

- **TypeScript validation:** the client-only plugin compiles under the official Paseo 0.8 scaffold configuration and versions.
- **Unit tests:** hierarchy construction, deterministic sibling order, mixed-state aggregation, attention ordering, snapshot/upsert/remove reconciliation, and preview summarization.
- **Subscription tests:** directory and timeline observations release on replacement and teardown; preview failure does not discard directory state.
- **CI:** clean pnpm installation followed by named TypeScript and unit-test jobs on pull requests and `main`.

### Installed behavior layers

- **Paseo plugin load:** isolated host reports the plugin running without a server entry point or build hook.
- **Browser workspace route:** wide layout shows summary, attention, hierarchy, bounded previews, and agent navigation.
- **Compact browser route:** phone-width layout stacks and discloses the same content without horizontal overflow or hidden actions.
- **Mobile compatibility:** React Native-only source and compact installed behavior are required for v1; physical iOS/Android interaction remains a documented post-v1 acceptance gap unless a paired device is available during delivery.

## Completion boundary

The delivery is technically ready when the exact feature head is hook-clean, automated layers pass, isolated Paseo 0.8 wide and compact behavior is demonstrated, the Ready GitHub pull request exists, required CI is complete, and configured hosted review has no unresolved actionable finding. Merge, npm publication, live-daemon installation, and deployment require separate authority.
