export type TripStatus = "planning" | "active" | "done";
export type ItineraryStatus = "planned" | "done" | "skipped" | "moved";
export type PayTiming = "prepaid" | "pay_before" | "pay_after";
export type BookingType = "flight" | "hotel" | "car" | "activity";
export type Category = "อาหาร" | "เดินทาง" | "ที่พัก" | "ช้อป" | "ตั๋ว" | "อื่นๆ";

export interface Trip { id: string; name: string; destination: string; start_date: string; end_date: string; home_currency: string; trip_currency: string; status: TripStatus; }
export interface ItineraryItem { id: string; trip_id: string; day_date: string; time: string; title: string; place: string; maps_link: string; notes: string; status: ItineraryStatus; moved_to_date: string; linked_transport_id: string; linked_booking_id: string; sort_order: number; }
export interface Transport { id: string; trip_id: string; day_date: string; from: string; to: string; mode: string; pickup_point: string; pickup_photo_ids: string[]; departure_times: string[]; duration_min: number; alt_option: string; price_amount: number; price_currency: string; fx_rate: number; price_thb: number; payer: string; pay_timing: PayTiming; paid: boolean; slip_photo_ids: string[]; notes: string; }
export interface Booking { id: string; trip_id: string; type: BookingType; vendor: string; ref_no: string; date_from: string; date_to: string; detail: string; amount: number; currency: string; fx_rate: number; amount_thb: number; payer: string; pay_timing: PayTiming; paid: boolean; slip_photo_ids: string[]; notes: string; }
export interface Expense { id: string; trip_id: string; datetime: string; category: Category; description: string; amount: number; currency: string; fx_rate: number; amount_thb: number; payer: string; slip_photo_ids: string[]; }
export interface ChecklistItem { id: string; trip_id: string; group: string; item: string; done: boolean; from_template: boolean; }
export interface Note { id: string; trip_id: string; date: string; text: string; photo_ids: string[]; }
export interface QuickInfo { id: string; trip_id: string; label: string; value: string; photo_ids: string[]; pinned: boolean; }
