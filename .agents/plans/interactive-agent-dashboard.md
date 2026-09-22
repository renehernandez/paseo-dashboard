# Interactive-agent dashboard

## Objective and scope

Make the agents the user works with the primary workspace objects. Replace the duplicate attention strip and always-expanded hierarchy with one compact, virtualized operations list. Deliver this plan and implementation in one Ready GitHub PR to `main`. Merge, deployment, and cleanup are not authorized.

Preserve the client-only Paseo 0.8.0 public-plugin boundary, React Native components, theme tokens, accessible text and actions, directory updates, and bounded preview cleanup. Add no dependencies, server state, telemetry, stored history, persistent settings, manual pins, or read/unread tracking.

## Selected behavior

### Ownership and ordering

Use the existing `paseo.parent-agent-id` hierarchy as the ownership authority. Agents without a nonempty parent label are interactive candidates, labeled **Your agent**, including newly created agents without a user-message timestamp. A child timestamp alone does not erase its explicit background ownership: spawn prompts can also produce activity. Do not infer interaction from the selected tab, provider, or model name.

Order interactive cards by `lastUserMessageAt`, newest first, falling back to creation time when the timestamp is missing or invalid. Use deterministic ID tie-breaking. Background activity must not reorder the interactive list. Treat invalid dates defensively and deterministically without inventing activity.

Assign every background agent to its reachable interactive ancestor. Self-links, missing parents, and cycles without a valid interactive ancestor belong in **Other background agents**, collapsed at the bottom. Every directory agent appears exactly once in the projection. Order that section by latest activity, newest first, with stable ties; preserve parent context text even when activity order separates relatives. Workspace filtering remains owned by the directory store.

### Cards and descendant disclosure

Each compact interactive card shows title, text status, latest user interaction time (explicit creation-time wording when there has been no interaction), an Open action when supported, and a concise summary of all recursive background descendants. Omit zero-count states. For example: `4 background agents · 1 needs input · 1 working · 2 done`. Count each descendant once; exclude the interactive parent from its background summary.

Keep permission and failure counts visible while collapsed, even for a completed parent. Distinguish the parent's own state from descendant state rather than overwriting one with the other. Do not show an attention section when all work is complete; remove the old attention section altogether.

Cards with descendants disclose dense background rows; cards without descendants have no descendant expansion control. Rows show a useful title, **Background** label, text status, latest activity time, bounded parent context, and supported Open action. Use **Review** only when existing reliable role metadata or explicit naming supports it; generic Background is the safe default, never model-name guessing. Do not recreate nested large cards or unbounded indentation.

Parent expansion changes only directory-derived visible rows. A separate row disclosure mounts that agent's recent activity preview on demand. Opening a group must fetch no descendant timelines. Collapsing the group removes its preview mounts and clears descendant preview disclosure so reopening does not silently refetch all previously expanded previews. Remove obsolete expansion keys when agents disappear or ownership changes. Disclosure state is memory-only and keyed by agent identity, not row index.

Use a single flattened visible-row projection with the existing virtualized list boundary, not an unvirtualized descendant tree inside each card. Compact and wide layouts preserve the same information and actions, wrapping long titles/context without horizontal overflow. Buttons retain labels, focus usability, and expanded-state accessibility metadata.

### Status and navigation

Permission and failure are actionable; only those conditions may receive **Needs you** wording. Preserve distinct **Needs input** and **Failed** labels and counts. Running/initializing remains **Working** unless permission or failure takes precedence. A finished attention flag alone is **Done**, not Attention; no persistent New result/read-state mechanism is needed. `requiresAttention` adds no distinct state, including when its reason is null, missing, or unrecognized: permission/error signals retain precedence, and otherwise lifecycle determines Working or Done. Aggregate warning precedence stays permission, failure, working, done, without hiding concurrent counts.

Open remains `navigation.openAgent({ agentId })` for both interactive and background agents. When navigation is unsupported, hide actions and retain the existing explanatory message. Loading, empty, directory-disconnected/retry, preview-loading, preview-error, and no-output states remain honest. A preview error must not remove directory rows or Open actions.

## Reuse and deviation contract

Inspected canonical owners are `client/dashboard-model.ts` and its tests for parent relationships, cycle protection, status and aggregates; `client/dashboard-panel.tsx` for the FlatList, native layout, theme, navigation, and preview mounting; `client/directory-store.ts` for workspace snapshots/subscriptions; and `client/timeline-preview.ts` for bounded tails and cleanup. README and the v1 plan describe the existing installation and runtime constraints.

Extend the existing pure dashboard model for interactive sorting, recursive counts, orphan partitioning, and visible rows. Keep one hierarchy/status authority; retire obsolete attention ordering rather than maintain a parallel presentation model. Extend the panel's existing rendering path, with small cohesive components if needed. Preserve DirectoryStore and PreviewSession unless a demonstrated integration defect requires a focused repair. The preview contract remains at most 12 projected entries, bounded text, one in-flight refetch, burst coalescing, and release on unmount.

This plan supersedes v1's attention-first/root-card presentation, not its runtime, privacy, or lifecycle guarantees. Update README to explain interactive ordering, disclosure, orphan handling, and finished-state semantics. The new projection is necessary because the existing flattened hierarchy renders every agent as a full card and duplicates agents in the attention strip; existing owners can absorb the change without another store or service.

## Delivery and risks

One coherent change joins ownership projection, status semantics, disclosure, documentation, and proof. Splitting model and UI would leave an intermediate misleading dashboard, so there is one final PR and no POC. Target a small change across the existing model, panel, tests, README, and this plan; replacement of the large card rendering may exceed the normal 500-line diff target. Keep the complete diff under 1,000 changed lines and 15 files; stop for a material size exception rather than split mechanically.

Primary risks are lost orphan/cyclic agents, double-counted descendants, hidden failures, accidental timeline fan-out, stale disclosure identity under live updates, and compact-layout overflow. Control these with pure-model fixtures and installed browser interaction evidence. No data migration is needed; rollback is a normal code revert, not an authorized action in this delivery.

## Acceptance and proof

The first visible proof is an installed feature checkout in an isolated Paseo-compatible test host: two interactive agents with different interaction times, recursive background work with mixed states, a newly created interactive agent, and an orphan. No live-user daemon installation is authorized by this test requirement.

Automated proof covers recent-user ordering and creation fallback, timestamp ties/invalid values, recursive counts, completed parents with active/permission/failed descendants, orphan/self-link/cycle retention without duplicates, and removal of finished-Attention semantics, including attention flags with null/missing reasons on both running and idle agents. Preserve directory reconciliation and preview bounding/coalescing/cleanup tests; add projection/disclosure proof that group expansion alone never requests timelines. Run the project's TypeScript validation and complete unit suite.

Installed wide and compact browser proof must demonstrate initial hidden backgrounds, accurate collapsed recursive summaries, ordering unaffected by background activity, dense expansion with parent context, separately demand-loaded previews, cleanup when hidden or leaving the panel, correct Open target, and unsupported-navigation behavior where testable. Include long titles, all-complete state, loading/error/retry, and no horizontal overflow. Record observed timeline requests/subscriptions rather than infer demand-loading only from screenshots. Use isolated fixtures through a test-only host boundary, not shipped fake data or a second production model. If the host or fixture controls are unavailable, report the exact gap; mocked proof alone is not installed-host proof.

Follow the managed Pi/Paseo contract: one planning review round, one implementation review round, one local repair batch, native hook-enabled commit, Ready publication, required CI and configured hosted review, and at most one hosted repair batch. Missing hosted reviewer configuration or completion remains explicit evidence, never an inferred pass. No merge, deployment, or cleanup.
