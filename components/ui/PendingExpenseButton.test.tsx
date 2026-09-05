import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PendingExpenseButton } from "./PendingExpenseButton";
import type { Expense } from "@/lib/models/types";

let mockExpenses: Expense[] = [];
vi.mock("@/lib/use-trip-data", () => ({ useTripData: () => ({ expenses: mockExpenses }) }));

afterEach(() => {
  cleanup();
  mockExpenses = [];
});

const expense = (over: Partial<Expense>): Expense => ({
  id: "e", trip_id: "t1", datetime: "2026-09-01T00:00:00.000Z", category: "อื่นๆ",
  description: "", amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0,
  payer: "", slip_photo_ids: [], splits: [], pending: false, ...over,
});

describe("PendingExpenseButton", () => {
  it("shows no badge when nothing is pending", () => {
    mockExpenses = [expense({ id: "a", pending: false })];
    render(<PendingExpenseButton tripId="t1" />);
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });

  it("shows the pending count as a badge", () => {
    mockExpenses = [expense({ id: "a", pending: true }), expense({ id: "b", pending: true }), expense({ id: "c", pending: false })];
    render(<PendingExpenseButton tripId="t1" />);
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("links to the trip's money page", () => {
    mockExpenses = [expense({ id: "a", pending: true })];
    render(<PendingExpenseButton tripId="t1" />);
    const link = screen.getByLabelText("รายการรอกรอกข้อมูล");
    expect(link.getAttribute("href")).toBe("/trips/t1/money");
  });

  it("caps the displayed badge at 9+", () => {
    mockExpenses = Array.from({ length: 12 }, (_, i) => expense({ id: `p${i}`, pending: true }));
    render(<PendingExpenseButton tripId="t1" />);
    expect(screen.getByText("9+")).toBeTruthy();
  });
});
