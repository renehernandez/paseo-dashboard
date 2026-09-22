import type { DashboardPaseo } from "./directory-store";

export type PreviewKind = "assistant" | "error" | "tool" | "activity";

export interface TimelinePreview {
  readonly kind: PreviewKind;
  readonly label: string;
  readonly text: string;
}

const PREVIEW_LIMIT = 180;

function subscriptionReady(subscription: () => void): Promise<void> | null {
  if (!("ready" in subscription)) return null;
  return subscription.ready instanceof Promise ? subscription.ready : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bounded(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > PREVIEW_LIMIT ? `${compact.slice(0, PREVIEW_LIMIT - 1)}…` : compact;
}

export function summarizeTimeline(entries: readonly unknown[]): TimelinePreview | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = record(entries[index]);
    const item = record(entry?.item);
    const type = text(item?.type);
    if (!item || !type) continue;

    if (type === "assistant_message") {
      const message = text(item.text);
      if (message) {
        const systemError = /^\[System Error\]/i.test(message);
        return {
          kind: systemError ? "error" : "assistant",
          label: systemError ? "Error" : "Assistant",
          text: bounded(message),
        };
      }
    }
    if (type === "error") {
      const message = text(item.message);
      if (message) return { kind: "error", label: "Error", text: bounded(message) };
    }
    if (type === "tool_call") {
      const name = text(item.name) ?? "Tool";
      const status = text(item.status) ?? "activity";
      return { kind: "tool", label: "Tool activity", text: bounded(`${name} · ${status}`) };
    }
    if (type === "notification") {
      const message = text(item.message);
      if (message) return { kind: "activity", label: "Activity", text: bounded(message) };
    }
  }
  return null;
}

export interface PreviewSessionSnapshot {
  readonly status: "loading" | "ready" | "error";
  readonly preview: TimelinePreview | null;
  readonly error: string | null;
}

export function createPreviewSession(
  paseo: DashboardPaseo,
  agentId: string,
  live: boolean,
  publish: (snapshot: PreviewSessionSnapshot) => void,
) {
  let active = false;
  let generation = 0;
  let refreshInFlight = false;
  let queuedGeneration: number | null = null;
  let releaseTimeline: (() => void) | null = null;

  const publishError = (error: unknown): void => {
    publish({
      status: "error",
      preview: null,
      error: error instanceof Error ? error.message : "Could not load recent activity",
    });
  };

  const refresh = async (refreshGeneration: number): Promise<void> => {
    try {
      const result = await paseo.agents.ref(agentId).timeline.refetch({
        direction: "tail",
        limit: 12,
        projection: "projected",
      });
      if (!active || refreshGeneration !== generation) return;
      if (result.error) throw new Error(result.error);
      publish({ status: "ready", preview: summarizeTimeline(result.entries), error: null });
    } catch (error) {
      if (active && refreshGeneration === generation) publishError(error);
    }
  };

  const requestRefresh = (refreshGeneration: number): void => {
    if (!active || refreshGeneration !== generation) return;
    if (refreshInFlight) {
      queuedGeneration = refreshGeneration;
      return;
    }

    refreshInFlight = true;
    void refresh(refreshGeneration).finally(() => {
      refreshInFlight = false;
      const queued = queuedGeneration;
      queuedGeneration = null;
      if (queued === generation) requestRefresh(queued);
    });
  };

  const stop = (): void => {
    active = false;
    generation += 1;
    queuedGeneration = null;
    releaseTimeline?.();
    releaseTimeline = null;
  };

  const start = (): (() => void) => {
    stop();
    active = true;
    const startGeneration = generation;
    publish({ status: "loading", preview: null, error: null });
    if (live) {
      releaseTimeline = paseo.agents.ref(agentId).timeline.subscribe(({ event }) => {
        if (event.type === "timeline" || event.type === "replacement") {
          requestRefresh(startGeneration);
        }
      });
      void subscriptionReady(releaseTimeline)?.catch((error: unknown) => {
        if (active && startGeneration === generation) publishError(error);
      });
    }
    requestRefresh(startGeneration);
    return stop;
  };

  return { start, stop };
}
