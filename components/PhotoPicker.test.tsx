import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PhotoPicker } from "./PhotoPicker";

afterEach(cleanup);

describe("PhotoPicker delete confirmation", () => {
  it("does not remove the photo immediately when the delete button is tapped", () => {
    const onChange = vi.fn();
    render(<PhotoPicker tripName="Test Trip" kind="photos" fileIds={["photo-1"]} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("ลบรูป"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a confirm dialog with a red delete action after tapping the delete button", () => {
    const onChange = vi.fn();
    render(<PhotoPicker tripName="Test Trip" kind="photos" fileIds={["photo-1"]} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("ลบรูป"));

    expect(screen.getByText("ลบรูปนี้?")).toBeTruthy();
    const confirmButton = screen.getByRole("button", { name: "ลบ" });
    expect(confirmButton.className).toContain("bg-danger");
  });

  it("removes the photo only after the confirm button is tapped", () => {
    const onChange = vi.fn();
    render(<PhotoPicker tripName="Test Trip" kind="photos" fileIds={["photo-1", "photo-2"]} onChange={onChange} />);

    fireEvent.click(screen.getAllByLabelText("ลบรูป")[0]);
    fireEvent.click(screen.getByRole("button", { name: "ลบ" }));

    expect(onChange).toHaveBeenCalledWith(["photo-2"]);
  });

  it("cancel closes the dialog without removing the photo", () => {
    const onChange = vi.fn();
    render(<PhotoPicker tripName="Test Trip" kind="photos" fileIds={["photo-1"]} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("ลบรูป"));
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("ลบรูปนี้?")).toBeNull();
  });
});
