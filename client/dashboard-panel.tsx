import type { PluginTheme } from "@getpaseo/plugin";
import {
  type PluginWorkspacePanelProps,
  usePaseo,
  useWorkspace,
} from "@getpaseo/plugin/client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import {
  type BackgroundAgent,
  type DashboardAgent,
  type DashboardRow,
  type DashboardState,
  type InteractiveAgent,
  buildDashboardProjection,
  countStates,
  projectionPreviewKeys,
  removeKeysWithPrefix,
  retainKeys,
  stateLabel,
  validTime,
  visibleDashboardRows,
} from "./dashboard-model";
import { DirectoryStore } from "./directory-store";
import { PreviewSession, type PreviewSessionSnapshot } from "./timeline-preview";

const INITIAL_PREVIEW: PreviewSessionSnapshot = {
  status: "loading",
  preview: null,
  error: null,
};

function timeAgo(timestamp: string, now: number): string {
  const elapsed = now - Date.parse(timestamp);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "recently";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function titleFor(agent: DashboardAgent): string {
  return agent.title?.trim() || `Agent ${agent.id.slice(0, 8)}`;
}

function stateColor(theme: PluginTheme, state: DashboardState): string {
  if (state === "failed") return theme.colors.statusDanger;
  if (state === "needs_input") return theme.colors.statusWarning;
  if (state === "working") return theme.colors.accent;
  return theme.colors.statusSuccess;
}

function Preview({
  paseo,
  agent,
  theme,
}: {
  paseo: ReturnType<typeof usePaseo>;
  agent: DashboardAgent;
  theme: PluginTheme;
}) {
  const [snapshot, setSnapshot] = useState(INITIAL_PREVIEW);
  const permission = agent.pendingPermissions.length > 0 || agent.attentionReason === "permission";

  useEffect(() => {
    const session = new PreviewSession(paseo, agent.id, agent.status === "running", setSnapshot);
    return session.start();
  }, [agent.id, agent.status, paseo]);

  if (permission) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={{ color: theme.colors.statusWarning, fontWeight: "600" }}>Permission</Text>
        <Text style={{ color: theme.colors.foreground }}>A permission response is required.</Text>
      </View>
    );
  }
  if (snapshot.status === "loading") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>Loading recent activity…</Text>;
  }
  if (snapshot.status === "error") {
    return (
      <Text style={{ color: theme.colors.statusDanger }}>
        Recent activity unavailable: {snapshot.error}
      </Text>
    );
  }
  if (!snapshot.preview) {
    return <Text style={{ color: theme.colors.foregroundMuted }}>No recent output to preview.</Text>;
  }
  return (
    <View style={{ gap: 4 }}>
      <Text
        style={{
          color:
            snapshot.preview.kind === "error"
              ? theme.colors.statusDanger
              : theme.colors.foregroundMuted,
          fontWeight: "600",
        }}
      >
        {snapshot.preview.label}
      </Text>
      <Text style={{ color: theme.colors.foreground }}>{snapshot.preview.text}</Text>
    </View>
  );
}

function Actions({
  agent,
  previewExpanded,
  onTogglePreview,
  onOpen,
  compact,
  theme,
}: {
  agent: DashboardAgent;
  previewExpanded: boolean;
  onTogglePreview: () => void;
  onOpen?: (agentId: string) => void;
  compact: boolean;
  theme: PluginTheme;
}) {
  const title = titleFor(agent);
  return (
    <View style={{ flexDirection: compact ? "column" : "row", gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${previewExpanded ? "Hide" : "Show"} recent activity for ${title}`}
        accessibilityState={{ expanded: previewExpanded }}
        onPress={onTogglePreview}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: 8,
          backgroundColor: theme.colors.surface2,
        }}
      >
        <Text style={{ color: theme.colors.foreground, textAlign: "center", fontWeight: "600" }}>
          {previewExpanded ? "Hide recent activity" : "Show recent activity"}
        </Text>
      </Pressable>
      {onOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
          onPress={() => onOpen(agent.id)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 8,
            backgroundColor: theme.colors.accent,
          }}
        >
          <Text
            style={{
              color: theme.colors.accentForeground,
              textAlign: "center",
              fontWeight: "700",
            }}
          >
            Open agent
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function summary(group: InteractiveAgent): string {
  const parts = (["needs_input", "failed", "working", "done"] as const)
    .filter((state) => group.counts[state] > 0)
    .map((state) => `${group.counts[state]} ${stateLabel(state).toLowerCase()}`);
  const count = group.background.length;
  return [`${count} background agent${count === 1 ? "" : "s"}`, ...parts].join(" · ");
}

function InteractiveCard({
  group,
  compact,
  theme,
  paseo,
  onOpen,
  now,
  groupExpanded,
  previewExpanded,
  onToggleGroup,
  onTogglePreview,
}: {
  group: InteractiveAgent;
  compact: boolean;
  theme: PluginTheme;
  paseo: ReturnType<typeof usePaseo>;
  onOpen?: (agentId: string) => void;
  now: number;
  groupExpanded: boolean;
  previewExpanded: boolean;
  onToggleGroup: () => void;
  onTogglePreview: () => void;
}) {
  const { agent, state } = group;
  const hasInteraction = validTime(agent.lastUserMessageAt) !== null;
  const hasCreationTime = validTime(agent.createdAt) !== null;
  return (
    <View
      style={{
        minWidth: 0,
        gap: 10,
        padding: compact ? 12 : 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 12,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View
        style={{
          flexDirection: compact ? "column" : "row",
          justifyContent: "space-between",
          alignItems: compact ? "stretch" : "flex-start",
          gap: 8,
        }}
      >
        <View style={{ minWidth: 0, flexShrink: 1, gap: 3 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "700" }}>
            {titleFor(agent)}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted }}>Your agent</Text>
        </View>
        <Text style={{ color: stateColor(theme, state), fontWeight: "700" }}>{stateLabel(state)}</Text>
      </View>

      <Text style={{ color: theme.colors.foregroundMuted }}>
        {hasInteraction
          ? `Last interaction ${timeAgo(agent.lastUserMessageAt!, now)}`
          : hasCreationTime
            ? `Created ${timeAgo(agent.createdAt, now)}`
            : "Creation time unavailable"}
      </Text>

      {group.background.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${groupExpanded ? "Hide" : "Show"} background agents for ${titleFor(agent)}`}
          accessibilityState={{ expanded: groupExpanded }}
          onPress={onToggleGroup}
          style={{ alignSelf: "flex-start", paddingVertical: 4 }}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
            {groupExpanded ? "Hide" : "Show"} · {summary(group)}
          </Text>
        </Pressable>
      ) : (
        <Text style={{ color: theme.colors.foregroundMuted }}>No background agents</Text>
      )}

      {previewExpanded ? <Preview paseo={paseo} agent={agent} theme={theme} /> : null}
      <Actions
        agent={agent}
        previewExpanded={previewExpanded}
        onTogglePreview={onTogglePreview}
        onOpen={onOpen}
        compact={compact}
        theme={theme}
      />
    </View>
  );
}

function BackgroundRow({
  item,
  compact,
  theme,
  paseo,
  onOpen,
  now,
  previewExpanded,
  onTogglePreview,
}: {
  item: BackgroundAgent;
  compact: boolean;
  theme: PluginTheme;
  paseo: ReturnType<typeof usePaseo>;
  onOpen?: (agentId: string) => void;
  now: number;
  previewExpanded: boolean;
  onTogglePreview: () => void;
}) {
  const { agent, state } = item;
  return (
    <View
      style={{
        minWidth: 0,
        gap: 8,
        padding: compact ? 10 : 12,
        marginLeft: compact ? 8 : 18,
        borderLeftWidth: 3,
        borderLeftColor: stateColor(theme, state),
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View
        style={{
          flexDirection: compact ? "column" : "row",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{titleFor(agent)}</Text>
          <Text style={{ color: theme.colors.foregroundMuted }}>Background</Text>
        </View>
        <Text style={{ color: stateColor(theme, state), fontWeight: "700" }}>{stateLabel(state)}</Text>
      </View>
      <Text style={{ color: theme.colors.foregroundMuted }}>Updated {timeAgo(agent.updatedAt, now)}</Text>
      {item.parentTitle ? (
        <Text style={{ color: theme.colors.foregroundMuted }} numberOfLines={2}>
          Parent: {item.parentTitle}
        </Text>
      ) : null}
      {previewExpanded ? <Preview paseo={paseo} agent={agent} theme={theme} /> : null}
      <Actions
        agent={agent}
        previewExpanded={previewExpanded}
        onTogglePreview={onTogglePreview}
        onOpen={onOpen}
        compact={compact}
        theme={theme}
      />
    </View>
  );
}

export function DashboardPanel({ theme, layout, workspaceId, navigation }: PluginWorkspacePanelProps) {
  const paseo = usePaseo();
  const workspace = useWorkspace(workspaceId, ({ name }) => ({ name }));
  const store = useMemo(() => new DirectoryStore(paseo, workspaceId), [paseo, workspaceId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => store.start(), [store]);

  const [now, setNow] = useState(() => Date.now());
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [otherExpanded, setOtherExpanded] = useState(false);
  const [previewKeys, setPreviewKeys] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const projection = useMemo(() => buildDashboardProjection(snapshot.agents), [snapshot.agents]);
  useEffect(() => {
    const groups = new Set(
      projection.interactive
        .filter(({ background }) => background.length)
        .map(({ agent }) => agent.id),
    );
    const validPreviewKeys = projectionPreviewKeys(projection);
    setExpandedGroups((current) => retainKeys(current, groups));
    setPreviewKeys((current) => retainKeys(current, validPreviewKeys));
    if (projection.otherBackground.length === 0) setOtherExpanded(false);
  }, [projection]);

  const rows = useMemo(
    () => visibleDashboardRows(projection, expandedGroups, otherExpanded),
    [expandedGroups, otherExpanded, projection],
  );
  const counts = useMemo(() => countStates(snapshot.agents), [snapshot.agents]);
  const openAgent = navigation ? (agentId: string) => navigation.openAgent({ agentId }) : undefined;

  const togglePreview = (key: string) => {
    setPreviewKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleGroup = (group: InteractiveAgent) => {
    const closing = expandedGroups.has(group.agent.id);
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (closing) next.delete(group.agent.id);
      else next.add(group.agent.id);
      return next;
    });
    if (closing) {
      const prefix = `background:${group.agent.id}:`;
      setPreviewKeys((previews) => removeKeysWithPrefix(previews, prefix));
    }
  };
  const toggleOther = () => {
    if (otherExpanded) {
      setPreviewKeys((previews) => removeKeysWithPrefix(previews, "other:"));
    }
    setOtherExpanded(!otherExpanded);
  };

  const renderRow = ({ item }: { item: DashboardRow }) => {
    if (item.kind === "interactive") {
      const previewKey = `interactive:${item.group.agent.id}`;
      return (
        <InteractiveCard
          group={item.group}
          compact={layout.compact}
          theme={theme}
          paseo={paseo}
          onOpen={openAgent}
          now={now}
          groupExpanded={expandedGroups.has(item.group.agent.id)}
          previewExpanded={previewKeys.has(previewKey)}
          onToggleGroup={() => toggleGroup(item.group)}
          onTogglePreview={() => togglePreview(previewKey)}
        />
      );
    }
    if (item.kind === "other_header") {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${otherExpanded ? "Hide" : "Show"} other background agents`}
          accessibilityState={{ expanded: otherExpanded }}
          onPress={toggleOther}
          style={{ padding: 12, borderRadius: 10, backgroundColor: theme.colors.surface2 }}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: "700" }}>
            {otherExpanded ? "Hide" : "Show"} other background agents · {item.count}
          </Text>
        </Pressable>
      );
    }
    const previewKey =
      item.kind === "background"
        ? `background:${item.ownerId}:${item.item.agent.id}`
        : `other:${item.item.agent.id}`;
    return (
      <BackgroundRow
        item={item.item}
        compact={layout.compact}
        theme={theme}
        paseo={paseo}
        onOpen={openAgent}
        now={now}
        previewExpanded={previewKeys.has(previewKey)}
        onTogglePreview={() => togglePreview(previewKey)}
      />
    );
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 12 : 24 }}
      data={rows}
      keyExtractor={(item) =>
        item.kind === "interactive"
          ? `interactive:${item.group.agent.id}`
          : item.kind === "other_header"
            ? "other-header"
            : `${item.kind}:${item.item.agent.id}`
      }
      initialNumToRender={12}
      windowSize={7}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={
        <View style={{ gap: layout.compact ? 14 : 20, marginBottom: rows.length ? 12 : 0 }}>
          <View style={{ gap: 5 }}>
            <Text
              style={{
                color: theme.colors.foreground,
                fontSize: layout.compact ? 22 : 28,
                fontWeight: "800",
              }}
            >
              {workspace?.name || "Workspace"} dashboard
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted }}>
              {snapshot.agents.length} agents · {counts.working} working · {counts.needs_input}{" "}
              need input · {counts.failed} failed
            </Text>
          </View>

          {snapshot.status === "error" ? (
            <View
              style={{
                gap: 10,
                padding: 14,
                borderRadius: 10,
                backgroundColor: theme.colors.surface1,
                borderWidth: 1,
                borderColor: theme.colors.statusDanger,
              }}
            >
              <Text style={{ color: theme.colors.statusDanger, fontWeight: "700" }}>
                {snapshot.agents.length ? "Live updates are disconnected" : "Dashboard disconnected"}
              </Text>
              <Text style={{ color: theme.colors.foreground }}>{snapshot.error}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading workspace agents"
                onPress={() => store.reload()}
                style={{ alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12 }}
              >
                <Text style={{ color: theme.colors.accent, fontWeight: "700" }}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {snapshot.status === "loading" && snapshot.agents.length === 0 ? (
            <Text style={{ color: theme.colors.foregroundMuted }}>Loading workspace agents…</Text>
          ) : null}

          {snapshot.status === "ready" && snapshot.agents.length === 0 ? (
            <View style={{ padding: 20, gap: 6, borderRadius: 12, backgroundColor: theme.colors.surface1 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: "700" }}>
                No agents in this workspace
              </Text>
              <Text style={{ color: theme.colors.foregroundMuted }}>
                Agents appear here as soon as Paseo creates them.
              </Text>
            </View>
          ) : null}
        </View>
      }
      renderItem={renderRow}
      ListFooterComponent={
        snapshot.agents.length > 0 && !navigation ? (
          <Text style={{ color: theme.colors.foregroundMuted, marginTop: 12 }}>
            This Paseo client does not support opening agents from plugins.
          </Text>
        ) : null
      }
    />
  );
}
