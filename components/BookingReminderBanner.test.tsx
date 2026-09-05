import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BookingReminderBanner } from "./BookingReminderBanner";
import type { Booking } from "@/lib/models/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const booking = (over: Partial<Booking>): Booking => ({
  id: "b1", trip_id: "t1", type: "activity", vendor: "Disneyland", ref_no: "",
  date_from: "2026-09-03", date_to: "2026-09-03", time_from: "09:00", detail: "",
  amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0, payer: "", pay_timing: "prepaid",
  paid: true, slip_photo_ids: [], notes: "", ...over,
});

const NOW = new Date("2026-09-02T12:00:00").getTime();

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("BookingReminderBanner", () => {
  it("renders nothing when no booking is in its reminder window", () => {
    render(<BookingReminderBanner tripId="t1" bookings={[booking({ date_from: "2026-12-25" })]} now={NOW} />);
    expect(screen.queryByText("Disneyland")).toBeNull();
  });

  it("shows the vendor and countdown for a booking inside its reminder window", () => {
    render(<BookingReminderBanner tripId="t1" bookings={[booking({})]} now={NOW} />);
    expect(screen.getByText("Disneyland")).toBeTruthy();
    expect(screen.getByText("อีก 21 ชม.")).toBeTruthy();
  });

  it("tapping the card navigates to the bookings page", () => {
    render(<BookingReminderBanner tripId="t1" bookings={[booking({})]} now={NOW} />);
    fireEvent.click(screen.getByText("Disneyland"));
    expect(push).toHaveBeenCalledWith("/trips/t1/bookings");
  });

  it("dismissing hides the card and remembers the dismissal for today", () => {
    render(<BookingReminderBanner tripId="t1" bookings={[booking({})]} now={NOW} />);
    fireEvent.click(screen.getByLabelText("ปิดแจ้งเตือนนี้วันนี้"));
    expect(screen.queryByText("Disneyland")).toBeNull();
    expect(localStorage.getItem("travelass:dismissed-reminder:b1:2026-09-02")).toBe("1");
  });
});
