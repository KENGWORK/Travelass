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

describe("PhotoPicker layout", () => {
  it("defaults to a wrapping grid", () => {
    const { container } = render(<PhotoPicker tripName="Test Trip" kind="photos" fileIds={["photo-1"]} onChange={vi.fn()} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("flex-wrap");
    expect(root.className).not.toContain("overflow-x-auto");
  });

  it("layout=\"scroll\" renders a single scrollable row with bigger thumbnails", () => {
    const { container } = render(
      <PhotoPicker tripName="Test Trip" kind="photos" fileIds={["photo-1"]} onChange={vi.fn()} layout="scroll" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("overflow-x-auto");
    expect(root.className).not.toContain("flex-wrap");

    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.className).toContain("h-24");
    expect(img.className).toContain("w-24");
  });
});
