// LINE quick info (ข้อมูลด่วน) + quick notes (โน้ต) -- I/O only; logic in lib/line-info*.ts.
import { listRows } from "@/lib/store";
import type { QuickInfo, QuickNote } from "@/lib/models/types";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { noteTitle } from "@/lib/line-info";
import { buildQuickInfoReply, buildQuickInfoDetail, buildBigText, buildNotesReply, buildNoteDetail, buildNoteFullText } from "@/lib/line-info-messages";
import { NO_TRIP_TEXT, GONE_TEXT, albumMessage, appUrl, norm } from "@/lib/line-view-kit";

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "info" && route.kind !== "notes") return;
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const query = norm(route.rest);
  if (route.kind === "info") {
    const rows = await listRows<QuickInfo>("quickinfo", trip.id);
    return ctx.reply(buildQuickInfoReply({ trip, origin: ctx.origin, rows, query, page: 1, autoDetail: true }));
  }
  const rows = await listRows<QuickNote>("quicknotes", trip.id);
  return ctx.reply(buildNotesReply({ trip, origin: ctx.origin, rows, query, page: 1, autoDetail: true }));
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const page = Number(data.n) || 1;
  const query = data.q ?? "";
  const action = data.a ?? "";

  if (action.startsWith("qi_")) {
    const rows = await listRows<QuickInfo>("quickinfo", trip.id);
    if (data.a === "qi_list") return ctx.reply(buildQuickInfoReply({ trip, origin: ctx.origin, rows, query, page, autoDetail: false }));
    const row = rows.find((r) => r.id === data.id);
    if (!row) return ctx.reply([textMessage(GONE_TEXT)]);
    if (data.a === "qi_detail") return ctx.reply(buildQuickInfoDetail({ origin: ctx.origin, row }));
    if (data.a === "qi_big") return ctx.reply([row.value ? buildBigText(row.value) : textMessage("ไม่มีข้อความ")]);
    if (data.a === "qi_photos") {
      if (!row.photo_ids.length) return ctx.reply([textMessage("รายการนี้ไม่มีรูป")]);
      return ctx.reply([albumMessage({ origin: ctx.origin, photoIds: row.photo_ids, title: row.label, moreUrl: appUrl(ctx.origin, trip.id, "info?tab=quickinfo") })]);
    }
    return;
  }

  if (action.startsWith("qn_")) {
    const rows = await listRows<QuickNote>("quicknotes", trip.id);
    if (data.a === "qn_list") return ctx.reply(buildNotesReply({ trip, origin: ctx.origin, rows, query, page, autoDetail: false }));
    const note = rows.find((n) => n.id === data.id);
    if (!note) return ctx.reply([textMessage(GONE_TEXT)]);
    const notesUrl = appUrl(ctx.origin, trip.id, "info?tab=quicknotes");
    if (data.a === "qn_detail") return ctx.reply([buildNoteDetail({ origin: ctx.origin, note, query })]);
    if (data.a === "qn_full") return ctx.reply(buildNoteFullText(note, notesUrl));
    if (data.a === "qn_photos") {
      if (!note.photo_ids.length) return ctx.reply([textMessage("โน้ตนี้ไม่มีรูป")]);
      return ctx.reply([albumMessage({ origin: ctx.origin, photoIds: note.photo_ids, title: noteTitle(note), moreUrl: notesUrl })]);
    }
  }
}
