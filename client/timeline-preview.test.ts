import { describe, expect, it, vi } from "vitest";
import type { DashboardPaseo } from "./directory-store";
import { PreviewSession, summarizeTimeline } from "./timeline-preview";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("timeline previews", () => {
  it("summarizes assistant, error, and tool activity", () => {
    expect(summarizeTimeline([{ item: { type: "assistant_message", text: "  Ready to ship  " } }])).toEqual({
      kind: "assistant",
      label: "Assistant",
      text: "Ready to ship",
    });
    expect(summarizeTimeline([{ item: { type: "error", message: "Build failed" } }])?.kind).toBe(
      "error",
    );
    expect(
      summarizeTimeline([{ item: { type: "assistant_message", text: "[System Error] unavailable" } }]),
    ).toMatchObject({ kind: "error", label: "Error" });
    expect(
      summarizeTimeline([{ item: { type: "tool_call", name: "Read", status: "running" } }]),
    ).toEqual({ kind: "tool", label: "Tool activity", text: "Read · running" });
  });

  it("bounds preview text", () => {
    const preview = summarizeTimeline([
      { item: { type: "assistant_message", text: "x".repeat(300) } },
    ]);
    expect(preview?.text).toHaveLength(180);
    expect(preview?.text.endsWith("…")).toBe(true);
  });

  it("reports a live observation readiness failure", async () => {
    const ready = deferred<void>();
    const release = Object.assign(vi.fn(), { ready: ready.promise });
    const paseo = {
      agents: {
        ref: () => ({
          timeline: {
            refetch: vi.fn(() => new Promise(() => undefined)),
            subscribe: () => release,
          },
        }),
      },
    } as unknown as DashboardPaseo;
    const publish = vi.fn();
    const session = new PreviewSession(paseo, "agent", true, publish);
    session.start();

    ready.reject(new Error("subscription failed"));
    await ready.promise.catch(() => undefined);
    await vi.waitFor(() =>
      expect(publish).toHaveBeenCalledWith({
        status: "error",
        preview: null,
        error: "subscription failed",
      }),
    );
    session.stop();
  });

  it("coalesces relevant event bursts behind one in-flight refresh", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const release = vi.fn();
    let onTimeline: ((update: { event: { type: string } }) => void) | undefined;
    const refetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const paseo = {
      agents: {
        ref: () => ({
          timeline: {
            refetch,
            subscribe: (handler: typeof onTimeline) => {
              onTimeline = handler;
              return release;
            },
          },
        }),
      },
    } as unknown as DashboardPaseo;
    const session = new PreviewSession(paseo, "agent", true, vi.fn());
    session.start();

    onTimeline?.({ event: { type: "usage_updated" } });
    onTimeline?.({ event: { type: "timeline" } });
    onTimeline?.({ event: { type: "timeline" } });
    onTimeline?.({ event: { type: "replacement" } });
    expect(refetch).toHaveBeenCalledTimes(1);

    first.resolve({ entries: [], error: null });
    await first.promise;
    await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
    second.resolve({ entries: [], error: null });
    await second.promise;
    session.stop();
  });

  it("releases live observation and ignores a replacement fetch after teardown", async () => {
    const first = deferred<unknown>();
    const replacement = deferred<unknown>();
    const release = vi.fn();
    let onTimeline: ((update: { event: { type: string } }) => void) | undefined;
    const refetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(replacement.promise);
    const paseo = {
      agents: {
        ref: () => ({
          timeline: {
            refetch,
            subscribe: (handler: typeof onTimeline) => {
              onTimeline = handler;
              return release;
            },
          },
        }),
      },
    } as unknown as DashboardPaseo;
    const publish = vi.fn();
    const session = new PreviewSession(paseo, "agent", true, publish);
    const stop = session.start();

    first.resolve({ entries: [], error: null });
    await first.promise;
    await Promise.resolve();
    onTimeline?.({ event: { type: "timeline" } });
    stop();
    replacement.resolve({
      entries: [{ item: { type: "assistant_message", text: "stale" } }],
      error: null,
    });
    await replacement.promise;
    await Promise.resolve();

    expect(release).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ preview: expect.objectContaining({ text: "stale" }) }),
    );
  });
});
