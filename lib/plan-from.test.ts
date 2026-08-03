import { describe, it, expect } from "vitest";
import { itineraryFromTransport, itineraryFromPlace } from "./plan-from";
import type { Transport } from "./models/types";

const transport = (over: Partial<Transport> = {}): Transport => ({
  id: "t1", trip_id: "trip1", day_date: "2026-09-10", from: "สนามบิน", to: "โรงแรม",
  mode: "รถไฟ", pickup_point: "", pickup_photo_ids: [], departure_times: [],
  depart_time: "09:00", arrive_time: "10:00", duration_min: 60, alt_option: "",
  price_amount: 0, price_currency: "THB", fx_rate: 1, price_thb: 0, payer: "",
  pay_timing: "prepaid", paid: false, slip_photo_ids: [], notes: "", ...over,
});

describe("itineraryFromTransport", () => {
  it("links the transport and fills title/time from it", () => {
    const item = itineraryFromTransport(transport(), "2026-09-11", "new-id");
    expect(item).toMatchObject({
      id: "new-id",
      trip_id: "trip1",
      day_date: "2026-09-11",
      time: "09:00",
      end_time: "10:00",
      title: "สนามบิน → โรงแรม",
      linked_transport_id: "t1",
      status: "planned",
    });
  });

  it("carries the transport's notes over", () => {
    const item = itineraryFromTransport(transport({ notes: "จุดขึ้นรถอยู่ประตู 3" }), "2026-09-11", "new-id");
    expect(item.notes).toBe("จุดขึ้นรถอยู่ประตู 3");
  });
});

describe("itineraryFromPlace", () => {
  it("snapshots name/area/maps without a live link", () => {
    const item = itineraryFromPlace(
      { name: "ตลาดมยองดง", area: "มยองดง", maps_link: "https://maps.example/x", note: "" },
      "2026-09-12",
      "id2",
    );
    expect(item).toMatchObject({
      id: "id2",
      day_date: "2026-09-12",
      title: "ตลาดมยองดง",
      place: "มยองดง",
      maps_link: "https://maps.example/x",
      linked_transport_id: "",
      status: "planned",
    });
  });

  it("carries the place's note over", () => {
    const item = itineraryFromPlace(
      { name: "ตลาดมยองดง", area: "มยองดง", maps_link: "https://maps.example/x", note: "เปิด 10 โมง" },
      "2026-09-12",
      "id2",
    );
    expect(item.notes).toBe("เปิด 10 โมง");
  });
});
