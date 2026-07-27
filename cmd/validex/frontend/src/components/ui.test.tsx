import * as Tooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "./ui";

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
