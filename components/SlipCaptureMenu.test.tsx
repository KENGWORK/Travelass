import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { SlipCaptureMenu } from "./SlipCaptureMenu";
import type { Trip } from "@/lib/models/types";

const apiCreate = vi.fn().mockResolvedValue(undefined);
const setExpenses = vi.fn();
const members = [
  { id: "m1", trip_id: "t1", name: "เก่ง", color: "#ff0000", promptpay_id: "" },
  { id: "m2", trip_id: "t1", name: "OMO", color: "#00ff00", promptpay_id: "" },
];
vi.mock("@/lib/api", () => ({
  apiCreate: (...args: unknown[]) => apiCreate(...args),
  apiList: () => Promise.resolve(members),
}));
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

const pickAFile = () => {
  const albumInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
  const file = new File(["x"], "slip.jpg", { type: "image/jpeg" });
  fireEvent.change(albumInput, { target: { files: [file] } });
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

  it("does not save anything right after picking a file -- shows a review step instead", async () => {
    render(<SlipCaptureMenu trip={trip} open onClose={vi.fn()} />);

    pickAFile();

    await screen.findByPlaceholderText("โน้ตสั้นๆ (ไม่บังคับ)");
    expect(apiCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "บันทึก" })).toBeTruthy();
  });

  it("saves the pending expense with the typed note once confirmed", async () => {
    const onClose = vi.fn();
    render(<SlipCaptureMenu trip={trip} open onClose={onClose} />);

    pickAFile();
    const noteInput = await screen.findByPlaceholderText("โน้ตสั้นๆ (ไม่บังคับ)");
    fireEvent.change(noteInput, { target: { value: "ค่าแท็กซี่สนามบิน" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));

    await waitFor(() => expect(setExpenses).toHaveBeenCalled());

    expect(apiCreate).toHaveBeenCalledWith("expenses", expect.objectContaining({
      pending: true,
      slip_photo_ids: ["photo-123"],
      trip_id: "t1",
      description: "ค่าแท็กซี่สนามบิน",
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it("lets you pick who's adding the slip, and saves that as the payer", async () => {
    render(<SlipCaptureMenu trip={trip} open onClose={vi.fn()} />);

    pickAFile();
    await screen.findByPlaceholderText("โน้ตสั้นๆ (ไม่บังคับ)");
    fireEvent.click(await screen.findByText("เก่ง"));
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));

    await waitFor(() => expect(setExpenses).toHaveBeenCalled());
    expect(apiCreate).toHaveBeenCalledWith("expenses", expect.objectContaining({ payer: "เก่ง" }));
  });

  it("saving without picking anyone leaves payer unassigned", async () => {
    render(<SlipCaptureMenu trip={trip} open onClose={vi.fn()} />);

    pickAFile();
    await screen.findByPlaceholderText("โน้ตสั้นๆ (ไม่บังคับ)");
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));

    await waitFor(() => expect(setExpenses).toHaveBeenCalled());
    expect(apiCreate).toHaveBeenCalledWith("expenses", expect.objectContaining({ payer: "" }));
  });

  it("opens a full-screen preview when the review thumbnail is tapped", async () => {
    render(<SlipCaptureMenu trip={trip} open onClose={vi.fn()} />);

    pickAFile();
    const thumb = await screen.findByLabelText("ดูรูป");
    fireEvent.click(thumb);

    expect(document.querySelector('img[src="/api/img/photo-123"]')).toBeTruthy();
  });
});
