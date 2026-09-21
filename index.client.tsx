import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DashboardPanel } from "./client/dashboard-panel";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addWorkspacePanel({
    id: "dashboard",
    title: "Dashboard",
    icon: "LayoutDashboard",
    context: "workspace",
    locations: ["workspace"],
    Component: DashboardPanel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-dashboard",
    title: "Open workspace dashboard",
    icon: "LayoutDashboard",
    keywords: ["agents", "status", "attention", "operations"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("dashboard", { location: "workspace" });
    },
  });

  return () => {
    removeCommand();
    removePanel();
  };
}
