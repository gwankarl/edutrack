import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { BookOpen, FileText, Send } from "lucide-react";
import { useSearchParams } from "react-router";

type WorkspaceTabId = "overview" | "content" | "publication";

interface CourseWorkspaceTabsProps {
  overview: ReactNode;
  courseContent: ReactNode;
  publication: ReactNode;
}

export default function CourseWorkspaceTabs({
  overview,
  courseContent,
  publication,
}: CourseWorkspaceTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabIdPrefix = useId().replace(/:/g, "");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const tabs = [
    { id: "overview", label: "Overview", icon: BookOpen, content: overview },
    {
      id: "content",
      label: "Course Content",
      icon: FileText,
      content: courseContent,
    },
    {
      id: "publication",
      label: "Publication",
      icon: Send,
      content: publication,
    },
  ] as const;

  const requestedTab = searchParams.get("tab");
  const selectedTab = tabs.find((tab) => tab.id === requestedTab) ?? tabs[0];

  useEffect(() => {
    if (requestedTab === null || tabs.some((tab) => tab.id === requestedTab)) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("tab");
    setSearchParams(nextParams, { replace: true });
  }, [requestedTab, searchParams, setSearchParams]);

  function selectTab(tabId: WorkspaceTabId) {
    const nextParams = new URLSearchParams(searchParams);

    if (tabId === "overview") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", tabId);
    }

    setSearchParams(nextParams);
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    tabRefs.current[nextIndex]?.focus();
    selectTab(nextTab.id);
  }

  const panelId = `${tabIdPrefix}-panel`;

  return (
    <section className="space-y-5">
      <div
        aria-label="Course workspace sections"
        className="flex min-w-0 gap-1 overflow-x-auto border-b border-border"
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const isSelected = tab.id === selectedTab.id;
          const tabDomId = `${tabIdPrefix}-tab-${tab.id}`;

          return (
            <button
              aria-controls={panelId}
              aria-selected={isSelected}
              className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-4 ${
                isSelected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              id={tabDomId}
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              tabIndex={isSelected ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        aria-labelledby={`${tabIdPrefix}-tab-${selectedTab.id}`}
        className="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        id={panelId}
        role="tabpanel"
        tabIndex={0}
      >
        {selectedTab.content}
      </div>
    </section>
  );
}
