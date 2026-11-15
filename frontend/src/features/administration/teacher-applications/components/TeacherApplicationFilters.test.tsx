import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import TeacherApplicationFilters from "./TeacherApplicationFilters.js";

describe("TeacherApplicationFilters", () => {
  it("provides all status options and reports a changed selection", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    render(
      <TeacherApplicationFilters
        onStatusChange={onStatusChange}
        status="all"
      />,
    );

    const select = screen.getByRole("combobox", {
      name: "Filter by status",
    });

    expect(select).toHaveValue("all");
    await user.selectOptions(select, "rejected");
    expect(onStatusChange).toHaveBeenCalledWith("rejected");
  });
});
