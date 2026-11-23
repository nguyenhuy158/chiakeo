import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { GameSettingsPanel } from "../components/GameSettingsPanel";
import { McpTokenPanel } from "../components/McpTokenPanel";
import { ProfileNamePanel } from "../components/ProfileNamePanel";
import { TagPanel } from "../components/TagPanel";

import { Tabs } from "../ui/Tabs";

const SETTINGS_TAB = {
  profile: "profile",
  display: "display",
  tags: "tags",
  mcp: "mcp",
} as const;

type SettingsTab = (typeof SETTINGS_TAB)[keyof typeof SETTINGS_TAB];

const SETTINGS_TABS = [
  { id: SETTINGS_TAB.profile, label: "Tài khoản" },
  { id: SETTINGS_TAB.display, label: "Hiển thị" },
  { id: SETTINGS_TAB.tags, label: "Nhãn" },
  { id: SETTINGS_TAB.mcp, label: "MCP" },
];
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(SETTINGS_TAB.profile);

  return (
    <div data-one-screen className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/"
          aria-label="Về trang chính"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 active:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          <ArrowLeft size={14} />
          Trang chính
        </Link>
        <h1 className="text-sm font-semibold text-stone-950 dark:text-stone-50">
          Cài đặt
        </h1>
      </div>

      <Tabs
        items={SETTINGS_TABS}
        active={activeTab}
        onChange={setActiveTab}
        className="shrink-0"
      />
      <div
        role="tabpanel"
        aria-label="Tài khoản"
        hidden={activeTab !== SETTINGS_TAB.profile}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <ProfileNamePanel />
      </div>
      <div
        role="tabpanel"
        aria-label="Hiển thị"
        hidden={activeTab !== SETTINGS_TAB.display}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-950 dark:text-stone-50">
            Tùy chọn hiển thị
          </h2>
          <div className="mt-3">
            <GameSettingsPanel />
          </div>
        </section>
      </div>
      <div
        role="tabpanel"
        aria-label="Nhãn"
        hidden={activeTab !== SETTINGS_TAB.tags}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <TagPanel />
      </div>
      <div
        role="tabpanel"
        aria-label="MCP"
        hidden={activeTab !== SETTINGS_TAB.mcp}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <McpTokenPanel />
      </div>
    </div>
  );
}
