// LINE booking view -- I/O only; all decisions live in lib/line-booking*.ts.
import { listRows } from "@/lib/store";
import type { Booking, ItineraryItem, Trip } from "@/lib/models/types";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { parseBookingRest, filterFromPostback, linkedPlanItems, bookingTitle, type BookingFilter } from "@/lib/line-booking";
import { buildBookingReply, buildBookingDetail, buildPlanPicker } from "@/lib/line-booking-messages";
import { tripDateCtx } from "@/lib/line-date";
import { NO_TRIP_TEXT, GONE_TEXT, tripNowHHMM, albumMessage, appUrl, outOfRangeText, longTextMessages } from "@/lib/line-view-kit";

async function load(tripId: string): Promise<{ bookings: Booking[]; itinerary: ItineraryItem[] }> {
  const [bookings, itinerary] = await Promise.all([
    listRows<Booking>("bookings", tripId),
    listRows<ItineraryItem>("itinerary", tripId),
  ]);
  return { bookings, itinerary };
}

async function replyView(ctx: HandlerCtx, trip: Trip, filter: BookingFilter, page: number, autoDetail: boolean): Promise<void> {
  const { bookings, itinerary } = await load(trip.id);
  await ctx.reply(
    buildBookingReply({
      trip, origin: ctx.origin, bookings, itinerary, filter, page, autoDetail,
      today: tripDateCtx(trip, ctx.now).today, nowHHMM: tripNowHHMM(trip, ctx.now),
    }),
  );
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "booking") return;
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const parsed = parseBookingRest(route.rest, tripDateCtx(trip, ctx.now));
  if (parsed.outOfRange) return ctx.reply([textMessage(outOfRangeText(trip))]);
  await replyView(ctx, trip, parsed.filter, 1, true);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);

  if (data.a === "bk_list") return replyView(ctx, trip, filterFromPostback(data), Number(data.n) || 1, false);

  const { bookings, itinerary } = await load(trip.id);
  const booking = bookings.find((b) => b.id === data.b);
  if (!booking) return ctx.reply([textMessage(GONE_TEXT)]);

  switch (data.a) {
    case "bk_detail":
      return ctx.reply([
        buildBookingDetail({
          origin: ctx.origin, booking, filter: filterFromPostback(data), linked: linkedPlanItems(itinerary, booking.id),
          today: tripDateCtx(trip, ctx.now).today, nowHHMM: tripNowHHMM(trip, ctx.now),
        }),
      ]);
    case "bk_photos":
      if (!booking.slip_photo_ids.length) return ctx.reply([textMessage("การจองนี้ไม่มีรูป")]);
      return ctx.reply([
        albumMessage({ origin: ctx.origin, photoIds: booking.slip_photo_ids, title: bookingTitle(booking), moreUrl: appUrl(ctx.origin, trip.id, "bookings") }),
      ]);
    case "bk_note":
      return ctx.reply(longTextMessages(booking.notes, appUrl(ctx.origin, trip.id, "bookings"), "ไม่มีโน้ต"));
    case "bk_plan": {
      const linked = linkedPlanItems(itinerary, booking.id);
      if (!linked.length) return ctx.reply([textMessage("การจองนี้ยังไม่ได้อยู่ในแพลน")]);
      return ctx.reply([buildPlanPicker(linked)]);
    }
    default:
      return;
  }
}
