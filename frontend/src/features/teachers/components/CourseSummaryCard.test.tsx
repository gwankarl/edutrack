import { render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { describe, expect, it } from "vitest";

import CourseSummaryCard from "./CourseSummaryCard.js";

describe("CourseSummaryCard", () => {
  it("shows zero as a real count", () => {
    render(
      <CourseSummaryCard icon={BookOpen} label="Draft Courses" value={0} />,
    );

    expect(
      screen.getByRole("article", { name: "Draft Courses summary" }),
    ).toHaveTextContent("0");
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("distinguishes an unsupported value from zero", () => {
    render(
      <CourseSummaryCard icon={BookOpen} label="Published" value={null} />,
    );

    expect(
      screen.getByRole("article", { name: "Published summary" }),
    ).toHaveTextContent("Unavailable");
    expect(screen.getByText("This status is not supported yet.")).toBeVisible();
  });
});
