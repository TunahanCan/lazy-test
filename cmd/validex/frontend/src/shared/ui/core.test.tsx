import * as Tooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToolTabs } from "./ToolPage";
import { Button, IconButton } from "./core";

describe("form-safe buttons", () => {
  it("does not submit a parent form unless submit is explicit", () => {
    const submit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <Tooltip.Provider>
        <form onSubmit={submit}>
          <Button>Helper action</Button>
          <IconButton label="Remove row">×</IconButton>
          <Button type="submit">Explicit submit</Button>
        </form>
      </Tooltip.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Helper action" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove row" }));
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Explicit submit" }));
    expect(submit).toHaveBeenCalledOnce();
  });
});

describe("tool tabs", () => {
  it("uses roving focus and arrow-key selection", () => {
    const Icon = () => null;
    const tabs = [
      { id: "first", label: "First", icon: Icon },
      { id: "second", label: "Second", icon: Icon },
    ] as const;
    function Harness() {
      const [value, setValue] = useState<(typeof tabs)[number]["id"]>("first");
      return (
        <ToolTabs
          value={value}
          tabs={tabs}
          label="Tools"
          idBase="test-tools"
          onChange={setValue}
        />
      );
    }

    render(<Harness />);
    const first = screen.getByRole("tab", { name: "First" });
    const second = screen.getByRole("tab", { name: "Second" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(second).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("id", "test-tools-tab-second");
    expect(second).toHaveAttribute(
      "aria-controls",
      "test-tools-panel-second",
    );
    expect(second).toHaveFocus();
    expect(first).toHaveAttribute("tabindex", "-1");
  });
});
