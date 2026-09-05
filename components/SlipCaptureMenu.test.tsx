import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { SlipCaptureMenu } from "./SlipCaptureMenu";
import type { Trip } from "@/lib/models/types";

const apiCreate = vi.fn().mockResolvedValue(undefined);
const setExpenses = vi.fn();
vi.mock("@/lib/api", () => ({ apiCreate: (...args: unknown[]) => apiCreate(...args) }));
vi.mock("@/lib/use-trip-data", () => ({ useTripData: () => ({ expenses: [], setExpenses }) }));
vi.mock("@/lib/upload-photo", () => ({ uploadPhoto: vi.fn().mockResolvedValue("photo-123") }));

afterEach(() => {
  cleanup();
  apiCreate.mockClear();
  setExpenses.mockClear();
});

const trip: Trip = {
  id: "t1", name: "Osaka Trip", destination: "", start_date: "2026-09-01", end_date: "2026-09-05",
  home_currency: "THB", trip_currency: "JPY", status: "active", cover_photo_id: "", home_timezone: "", trip_timezone: "",
};

describe("SlipCaptureMenu", () => {
  it("renders a camera option and an album option as two distinct file inputs", () => {
    render(<SlipCaptureMenu trip={trip} open onClose={vi.fn()} />);

    const cameraInput = document.querySelector('input[capture="environment"]') as HTMLInputElement;
    const albumInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;

    expect(cameraInput).toBeTruthy();
    expect(albumInput).toBeTruthy();
    expect(screen.getByText("ถ่ายรูป")).toBeTruthy();
    expect(screen.getByText("เลือกจากอัลบั้ม")).toBeTruthy();
  });

  it("creates a pending expense holding the uploaded photo after picking a file", async () => {
    const onClose = vi.fn();
    render(<SlipCaptureMenu trip={trip} open onClose={onClose} />);

    const albumInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    const file = new File(["x"], "slip.jpg", { type: "image/jpeg" });
    fireEvent.change(albumInput, { target: { files: [file] } });

    await waitFor(() => expect(setExpenses).toHaveBeenCalled());

    expect(apiCreate).toHaveBeenCalledWith("expenses", expect.objectContaining({
      pending: true,
      slip_photo_ids: ["photo-123"],
      trip_id: "t1",
    }));
    expect(onClose).toHaveBeenCalled();
  });
});
