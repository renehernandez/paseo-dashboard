import type { PluginTheme } from "@getpaseo/plugin";
import {
  type PluginWorkspacePanelProps,
  usePaseo,
  useWorkspace,
} from "@getpaseo/plugin/client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  type AgentNode,
  type DashboardAgent,
  agentState,
  buildAgentHierarchy,
  countStates,
  orderByAttention,
  stateLabel,
} from "./dashboard-model";
import { DirectoryStore } from "./directory-store";
import { PreviewSession, type PreviewSessionSnapshot } from "./timeline-preview";

const INITIAL_PREVIEW: PreviewSessionSnapshot = {
  status: "loading",
  preview: null,
  error: null,
};

function timeAgo(timestamp: string): string {
  const elapsed = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "recently";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function stateColor(theme: PluginTheme, state: ReturnType<typeof agentState>): string {
  if (state === "failed") return theme.colors.statusDanger;
  if (state === "needs_input" || state === "attention") return theme.colors.statusWarning;
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
              : snapshot.preview.kind === "permission"
                ? theme.colors.statusWarning
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

function AgentCard({
  node,
  depth,
  compact,
  theme,
  paseo,
  onOpen,
}: {
  node: AgentNode;
  depth: number;
  compact: boolean;
  theme: PluginTheme;
  paseo: ReturnType<typeof usePaseo>;
  onOpen?: (agentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { agent, aggregateState, children, state } = node;
  const title = agent.title?.trim() || `Agent ${agent.id.slice(0, 8)}`;
  const provider = agent.model ? `${agent.provider} / ${agent.model}` : agent.provider;
  const nestedInset = compact ? Math.min(depth, 2) * 10 : Math.min(depth, 4) * 18;

  return (
    <View style={{ marginLeft: nestedInset, gap: 8 }}>
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
              {title}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted }} numberOfLines={1}>
              {provider}
            </Text>
          </View>
          <View style={{ gap: 2, alignItems: compact ? "flex-start" : "flex-end" }}>
            <Text style={{ color: stateColor(theme, state), fontWeight: "700" }}>
              {stateLabel(state)}
            </Text>
            {aggregateState !== state ? (
              <Text style={{ color: theme.colors.foregroundMuted }}>
                Group: {stateLabel(aggregateState)}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={{ color: theme.colors.foregroundMuted }}>
          {node.parentAgentId ? "Subagent" : "Root agent"} · Active {timeAgo(agent.updatedAt)}
        </Text>

        {expanded ? <Preview paseo={paseo} agent={agent} theme={theme} /> : null}

        <View style={{ flexDirection: compact ? "column" : "row", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? "Hide" : "Show"} recent activity for ${title}`}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: 8,
              backgroundColor: theme.colors.surface2,
            }}
          >
            <Text style={{ color: theme.colors.foreground, textAlign: "center", fontWeight: "600" }}>
              {expanded ? "Hide recent activity" : "Show recent activity"}
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
      </View>

      {children.map((child) => (
        <AgentCard
          key={child.agent.id}
          node={child}
          depth={depth + 1}
          compact={compact}
          theme={theme}
          paseo={paseo}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

export function DashboardPanel({
  theme,
  layout,
  workspaceId,
  navigation,
}: PluginWorkspacePanelProps) {
  const paseo = usePaseo();
  const workspace = useWorkspace(workspaceId, ({ name }) => ({ name }));
  const store = useMemo(() => new DirectoryStore(paseo, workspaceId), [paseo, workspaceId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => store.start(), [store]);

  const hierarchy = useMemo(() => buildAgentHierarchy(snapshot.agents), [snapshot.agents]);
  const attention = useMemo(() => orderByAttention(snapshot.agents).slice(0, 5), [snapshot.agents]);
  const counts = useMemo(() => countStates(snapshot.agents), [snapshot.agents]);
  const openAgent = navigation
    ? (agentId: string) => navigation.openAgent({ agentId })
    : undefined;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{
        padding: layout.compact ? 12 : 24,
        gap: layout.compact ? 14 : 20,
      }}
    >
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
          {snapshot.agents.length} agents · {counts.working} working · {counts.needs_input} need input ·{" "}
          {counts.failed} failed
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

      {snapshot.agents.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "700" }}>
            Attention order
          </Text>
          <View style={{ flexDirection: layout.compact ? "column" : "row", flexWrap: "wrap", gap: 8 }}>
            {attention.map(({ agent, state }) => (
              <View
                key={agent.id}
                style={{
                  minWidth: 0,
                  flexGrow: layout.compact ? 0 : 1,
                  flexBasis: layout.compact ? "auto" : 180,
                  padding: 10,
                  gap: 3,
                  borderRadius: 9,
                  backgroundColor: theme.colors.surface2,
                }}
              >
                <Text style={{ color: stateColor(theme, state), fontWeight: "700" }}>
                  {stateLabel(state)}
                </Text>
                <Text style={{ color: theme.colors.foreground }} numberOfLines={1}>
                  {agent.title?.trim() || `Agent ${agent.id.slice(0, 8)}`}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {snapshot.agents.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "700" }}>
            Agent hierarchy
          </Text>
          {hierarchy.map((node) => (
            <AgentCard
              key={node.agent.id}
              node={node}
              depth={0}
              compact={layout.compact}
              theme={theme}
              paseo={paseo}
              onOpen={openAgent}
            />
          ))}
          {!navigation ? (
            <Text style={{ color: theme.colors.foregroundMuted }}>
              This Paseo client does not support opening agents from plugins.
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
