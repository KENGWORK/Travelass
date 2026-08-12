export type TripStatus = "planning" | "active" | "done";
export type ItineraryStatus = "planned" | "done" | "skipped" | "moved";
export type PayTiming = "prepaid" | "pay_before" | "pay_after";
export type BookingType = "flight" | "hotel" | "car" | "activity";
export type Category = "อาหาร" | "เดินทาง" | "ที่พัก" | "ช้อป" | "ตั๋ว" | "อื่นๆ";

export interface Trip { id: string; name: string; destination: string; start_date: string; end_date: string; home_currency: string; trip_currency: string; status: TripStatus; cover_photo_id: string; home_timezone: string; trip_timezone: string; }
export interface ItineraryItem { id: string; trip_id: string; day_date: string; time: string; end_time: string; title: string; place: string; maps_link: string; notes: string; status: ItineraryStatus; moved_to_date: string; linked_transport_id: string; linked_booking_id: string; sort_order: number; photo_ids: string[]; plan_id: string; }
// A day with a single itinerary needs no DayPlan rows at all -- items just
// carry plan_id: "". Rows here only exist for days the user has split into
// alternates (e.g. rain plan), capped at 4 per day_date. Exactly one row per
// day_date has is_active true; that's the plan whose items render.
export interface DayPlan { id: string; trip_id: string; day_date: string; name: string; sort_order: number; is_active: boolean; }
export interface Transport { id: string; trip_id: string; day_date: string; from: string; to: string; mode: string; pickup_point: string; pickup_photo_ids: string[]; departure_times: string[]; depart_time: string; arrive_time: string; duration_min: number; alt_option: string; price_amount: number; price_currency: string; fx_rate: number; price_thb: number; payer: string; pay_timing: PayTiming; paid: boolean; slip_photo_ids: string[]; notes: string; }
export interface Booking { id: string; trip_id: string; type: BookingType; vendor: string; ref_no: string; date_from: string; date_to: string; detail: string; amount: number; currency: string; fx_rate: number; amount_thb: number; payer: string; pay_timing: PayTiming; paid: boolean; slip_photo_ids: string[]; notes: string; }
export interface ExpenseSplit { name: string; amount_thb: number; paid: boolean; paid_slip_photo_ids: string[]; }
export interface Expense { id: string; trip_id: string; datetime: string; category: Category; description: string; amount: number; currency: string; fx_rate: number; amount_thb: number; payer: string; slip_photo_ids: string[]; splits: ExpenseSplit[]; }
export interface ChecklistItem { id: string; trip_id: string; group: string; item: string; done: boolean; from_template: boolean; }
export interface Note { id: string; trip_id: string; date: string; text: string; photo_ids: string[]; }
export interface QuickInfo { id: string; trip_id: string; label: string; value: string; photo_ids: string[]; pinned: boolean; sort_order: number; }
export interface Member { id: string; trip_id: string; name: string; color: string; promptpay_id: string; }
export interface Restaurant { id: string; trip_id: string; name: string; area: string; maps_link: string; note: string; must_try: boolean; price_level: number; visited: boolean; photo_ids: string[]; }
export interface WishItem { id: string; trip_id: string; name: string; area: string; maps_link: string; note: string; star: boolean; visited: boolean; photo_ids: string[]; }
export interface TripApp { id: string; trip_id: string; name: string; purpose: string; url: string; }
export interface LinkItem { id: string; trip_id: string; title: string; url: string; note: string; }
export interface ShopItem { id: string; trip_id: string; item: string; for_whom: string; price: string; bought: boolean; photo_ids: string[]; }
export interface Phrase { id: string; trip_id: string; category: string; text: string; pronunciation: string; meaning: string; }
export interface QuickNote { id: string; trip_id: string; title: string; content: string; photo_ids: string[]; sort_order: number; }
