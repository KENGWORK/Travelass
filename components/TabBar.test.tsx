import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TabBar } from "./TabBar";

vi.mock("next/navigation", () => ({ usePathname: () => "/trips/t1/itinerary" }));

afterEach(cleanup);

describe("TabBar FAB menu", () => {
  it("tapping the FAB shows a choice between snapping a slip and quick-entering an expense, without calling either yet", () => {
    const onSnapSlip = vi.fn();
    const onQuickExpense = vi.fn();
    render(<TabBar tripId="t1" onSnapSlip={onSnapSlip} onQuickExpense={onQuickExpense} />);

    fireEvent.click(screen.getByLabelText("จดค่าใช้จ่าย"));

    expect(screen.getByText("ถ่ายสลิป")).toBeTruthy();
    expect(screen.getByText("จดด่วน")).toBeTruthy();
    expect(onSnapSlip).not.toHaveBeenCalled();
    expect(onQuickExpense).not.toHaveBeenCalled();
  });

  it("picking 'ถ่ายสลิป' calls onSnapSlip and closes the menu", () => {
    const onSnapSlip = vi.fn();
    const onQuickExpense = vi.fn();
    render(<TabBar tripId="t1" onSnapSlip={onSnapSlip} onQuickExpense={onQuickExpense} />);

    fireEvent.click(screen.getByLabelText("จดค่าใช้จ่าย"));
    fireEvent.click(screen.getByText("ถ่ายสลิป"));

    expect(onSnapSlip).toHaveBeenCalledTimes(1);
    expect(onQuickExpense).not.toHaveBeenCalled();
    expect(screen.queryByText("จดด่วน")).toBeNull();
  });

  it("picking 'จดด่วน' calls onQuickExpense and closes the menu", () => {
    const onSnapSlip = vi.fn();
    const onQuickExpense = vi.fn();
    render(<TabBar tripId="t1" onSnapSlip={onSnapSlip} onQuickExpense={onQuickExpense} />);

    fireEvent.click(screen.getByLabelText("จดค่าใช้จ่าย"));
    fireEvent.click(screen.getByText("จดด่วน"));

    expect(onQuickExpense).toHaveBeenCalledTimes(1);
    expect(onSnapSlip).not.toHaveBeenCalled();
  });
});
