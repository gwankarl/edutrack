import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router";
import { describe, expect, it } from "vitest";

import CourseWorkspaceTabs from "./CourseWorkspaceTabs.js";

function SearchParamsOutput() {
  const [searchParams] = useSearchParams();

  return (
    <output aria-label="Current URL query">{searchParams.toString()}</output>
  );
}

function renderTabs(initialEntry = "/teacher/courses/course-id") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CourseWorkspaceTabs
        courseContent={<p>Course content placeholder</p>}
        overview={<p>Overview content</p>}
        publication={<p>Publication placeholder</p>}
      />
      <SearchParamsOutput />
    </MemoryRouter>,
  );
}

describe("CourseWorkspaceTabs", () => {
  it("selects Overview by default and leaves the URL without a tab parameter", () => {
    renderTabs();

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Overview content");
    expect(screen.getByLabelText("Current URL query")).toBeEmptyDOMElement();
  });

  it("updates the URL when selecting a tab and preserves other query parameters", async () => {
    const user = userEvent.setup();
    renderTabs("/teacher/courses/course-id?page=2");

    await user.click(screen.getByRole("tab", { name: "Course Content" }));

    expect(screen.getByRole("tab", { name: "Course Content" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent(
      "Course content placeholder",
    );

    const query = new URLSearchParams(
      screen.getByLabelText("Current URL query").textContent ?? "",
    );
    expect(query.get("tab")).toBe("content");
    expect(query.get("page")).toBe("2");
  });

  it("restores the selected tab from the URL", () => {
    renderTabs("/teacher/courses/course-id?tab=publication");

    expect(screen.getByRole("tab", { name: "Publication" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent(
      "Publication placeholder",
    );
  });

  it("supports Arrow, Home, and End keyboard navigation", async () => {
    const user = userEvent.setup();
    renderTabs();

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    overviewTab.focus();
    await user.keyboard("{ArrowRight}");

    const contentTab = screen.getByRole("tab", { name: "Course Content" });
    expect(contentTab).toHaveFocus();
    expect(contentTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    const publicationTab = screen.getByRole("tab", { name: "Publication" });
    expect(publicationTab).toHaveFocus();
    expect(publicationTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    expect(publicationTab).toHaveFocus();

    await user.keyboard("{Home}");
    expect(overviewTab).toHaveFocus();
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
  });

  it("falls back to Overview and removes an invalid tab value", async () => {
    renderTabs("/teacher/courses/course-id?tab=unknown&filter=draft");

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await waitFor(() => {
      const query = new URLSearchParams(
        screen.getByLabelText("Current URL query").textContent ?? "",
      );
      expect(query.has("tab")).toBe(false);
      expect(query.get("filter")).toBe("draft");
    });
  });
});
