# Android Hermes plugin loading

## Objective and accepted scope

Restore dashboard loading on the Android Paseo client without changing dashboard behavior or upgrading the Paseo 0.8.0 public-plugin contract. The Android client currently reports `263:22: Invalid expression encountered`; compiling the reconstructed Paseo client bundle with the React Native 0.81.5 Hermes compiler reproduces that error at `DirectoryStore = class` and a second error at `PreviewSession = class`. A daemon's running status and a narrow browser viewport do not prove native client compatibility.

Deliver one atomic plan and implementation in one Ready GitHub PR to main. The user accepted implementation, review, merge, and updating the live dashboard installation after verification. No branch/worktree cleanup, unrelated runtime changes, server changes, new dependencies, or new dashboard features are included.

## Selected approach

Replace the two class implementations with closure-based factories in their existing modules. Keep state private to each created instance and expose only the operations their existing callers use. Change panel construction and test fixtures to use the factories; do not leave alternate class wrappers or a second store/preview implementation. Public Paseo APIs, workspace ownership, dashboard layout, statuses, ordering, disclosure, and navigation remain unchanged.

The directory owner must preserve stable snapshot/subscription callbacks, subscribe-before-load reconciliation, workspace filtering, pagination, one current subscription, retained data on failure, retry, idempotent teardown, and suppression of stale async results after replacement or stop. Retain the existing cleanup behavior across restarts rather than accidentally capturing only an old subscription.

The preview owner must preserve bounded tails (12 projected entries and 180-character text), on-demand requests, running-only observation, relevant-event filtering, readiness-error reporting, a single in-flight request, coalesced refreshes, generation checks, and release/ignored results on stop or replacement. Group disclosure must still fetch no descendant timelines until an individual preview is requested. Do not introduce global state or change caller-visible lifecycle semantics while removing classes.

## Reuse and deviation contract

Inspected canonical owners are `client/directory-store.ts` and `client/timeline-preview.ts`, their lifecycle tests, and the panel that constructs both owners. The existing functional model and disclosure helpers establish local precedent for module-owned functions without classes. Reuse these boundaries and the existing React effects/useSyncExternalStore interface; no new service, state library, inheritance layer, or compatibility wrapper is needed.

Paseo's v0.8 compiler emits CommonJS at ES2020 with async syntax lowered, but leaves these classes in the string evaluated by Hermes. The existing React Native dependency already supplies the Hermes compiler, and TypeScript supplies source transformation for native syntax regression tests. The narrow plugin-side fix avoids requiring every user's daemon or Android app to upgrade. An upstream compiler improvement is a separate task, not a prerequisite.

Add behavior-specific native syntax verification to the project's existing automated verification path. Use the actual Hermes compiler provided by the declared React Native version. The regression must exercise emitted production code, fail for an introduced class expression, and pass for the fixed owners; a text search for `class` is insufficient. Do not use a compilation target that erases classes before the regression sees them. If portable source-level verification uses a different pipeline from Paseo's bundler, describe that boundary honestly and independently verify the actual/reconstructed host bundle with Paseo's compiler options. Keep host/bundle acquisition details private, not machine-specific paths in committed tests. Missing compiler/tool support on required development/CI platforms must be a clear failure, not a silent skip.

No new dependencies are approved. If a reliable portable test cannot use the already declared packages, return only that material dependency decision rather than installing a new bundler or relying on an undeclared transitive dependency. Preserve native hook execution and CI's existing TypeScript/unit-test obligations. Update README to distinguish native-parser validation, browser integration, and physical-device interaction evidence.

## Delivery shape and risks

This is one cohesive compatibility correction with one safe final outcome and no POC. Updating only one class still prevents the entire plugin from loading, so both owners and their integration proof belong together. Target no more than 10 files and 500 changed lines; replacing class bodies may exceed 500, but a semantic split would leave Android broken. Keep the effective diff below 1,000 changed lines and 15 files; seek a scoped exception before exceeding that bound.

Main risks are loss of callback identity, shared state between instances, stale updates after restart, preview request fan-out, and a test that accidentally lowers away the failing syntax. Existing lifecycle tests plus the native compiler regression control these risks. Preserve class-free syntax in all emitted plugin production modules, not only at the two original locations. There is no data migration. A normal code revert is the rollback mechanism; no automatic rollback or cleanup is authorized.

## Acceptance and proof

First objective proof: the pre-fix emitted code fails in Hermes on the two class expressions, while the fixed production bundle passes native compilation under the same compatibility assumptions. Keep the RED and GREEN evidence tied to source revisions and compiler versions.

Run TypeScript validation and the complete unit suite. Preserve and extend directory/preview lifecycle tests for restart, idempotent release, stale pending results, distinct instance state, coalescing, error propagation, and stable callbacks. Retain panel-level disclosure/navigation tests so the factory conversion cannot change real consumers unnoticed. Required native syntax regression must run in CI on its supported runner platform using declared dependencies.

Load the feature checkout in an isolated Paseo test host, verify wide/compact browser behavior and successful plugin registration, and compile the host-equivalent emitted bundle using Hermes. Where an Android emulator or connected device is available, verify the native client loads the plugin, exposes Search → Open workspace dashboard within a workspace, renders agents, and supports disclosure, preview, and Open. Do not report browser or compiler proof as an Android device test. If physical Android access is unavailable, record that final UI observation as pending user confirmation; native parser proof, lifecycle tests, browser proof, and required CI still gate merge.

Publish Ready after the managed local review/repair batch and hook-enabled verification. Resolve CI and reviewer policy independently: this repository requires CI and has no configured hosted automated reviewer; do not invent Genie or waive a not-required review. After required current-head evidence is clean, merge this PR only, update clean local main, update/reload only the live paseo-dashboard plugin from the merged revision, and confirm its installed source and running status. Report device confirmation separately from daemon status.
