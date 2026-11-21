import { randomUUID } from "node:crypto";
import { listRows, updateRow, saveImage } from "@/lib/store";
import { buildPendingExpense } from "@/lib/pending-expense";
import { fetchLineImageContent, buildNameQuickReply, buildSkipQuickReply, buildConfirmationFlex } from "@/lib/line";
import { readFlowSession, writeFlowSession, deleteFlowSession } from "@/lib/line-session";
import { textMessage, imageUrl, type FlexNode } from "@/lib/line-flex";
import { NO_TRIP_TEXT, WIP_TEXT } from "@/lib/line-menu";
import { isViewCommand, type Route } from "@/lib/line-router";
import type { Expense, LineSession, Member } from "@/lib/models/types";
import type { HandlerCtx, PostbackData } from "./types";

// Expense capture over LINE. For now this is only the slip-photo flow that
// already runs in production (photo -> "who?" -> "note?" -> card), moved
// out of the webhook route; the typed-expense flow replaces the stubs below.

const SKIP_LABEL = "ข้าม";
const PHOTO_FLOW_STEPS = new Set(["awaiting_name", "awaiting_note"]);

// Step 1: a photo arrives. Save it as a pending expense right away (the
// photo is never lost even if the conversation goes nowhere), then ask who
// it belongs to.
export async function handleImage(ctx: HandlerCtx): Promise<void> {
  const trip = ctx.trip;
  if (!trip) {
    await ctx.reply([textMessage(NO_TRIP_TEXT)]);
    return;
  }
  const messageId = ctx.event.message?.id;
  if (!messageId) return;

  const { buf, mime } = await fetchLineImageContent(messageId, ctx.accessToken);
  const photoId = await saveImage(buf, mime, trip.name, "slips", `line-${ctx.now.getTime()}.jpg`);

  const expenseId = randomUUID();
  const exp = buildPendingExpense({ id: expenseId, tripId: trip.id, photoId, currency: trip.trip_currency, now: ctx.now.toISOString() });
  await Promise.all([
    updateRow<Expense>("expenses", expenseId, exp), // appends, since expenseId is new
    writeFlowSession({ id: ctx.userKey, trip_id: trip.id, expense_id: expenseId, step: "awaiting_name", data: {} }, ctx.now),
  ]);

  const members = await listRows<Member>("members", trip.id);
  await ctx.reply([textMessage("รับสลิปแล้ว 📸 ใครเป็นคนบันทึกรายการนี้?", buildNameQuickReply(members) as FlexNode | undefined)]);
}

// While the photo flow waits for a name or note, any text is the answer --
// except a view command (แพลน, เมนู, ข้อมูล, โน้ต, #2, ...), which goes to its
// feature while the flow stays pending. Collision words like "ร้าน" are
// still taken as the note ("ร้านนี้อร่อย").
export async function flowAnswerPredicate(ctx: HandlerCtx, session: LineSession): Promise<(text: string) => boolean> {
  void ctx;
  if (!PHOTO_FLOW_STEPS.has(session.step)) return () => false;
  return (text) => !isViewCommand(text);
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  switch (route.kind) {
    case "flow_answer":
      await handlePhotoFlowAnswer(ctx);
      return;
    case "expense_new":
    case "flow_conflict":
    case "flow_reask":
      // Typed expense capture isn't built yet. Stay silent in groups so
      // everyday chat containing numbers doesn't get a reply.
      if (ctx.isGroup) return;
      await ctx.reply([textMessage(WIP_TEXT)]);
      return;
    default:
      return;
  }
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  void data;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}

// Steps 2 and 3: the next text is the name, then the note.
async function handlePhotoFlowAnswer(ctx: HandlerCtx): Promise<void> {
  const session = await readFlowSession(ctx.userKey, ctx.now);
  if (!session) return;

  const text = (ctx.event.message?.text ?? "").trim();
  const expenses = await listRows<Expense>("expenses", session.trip_id);
  const exp = expenses.find((e) => e.id === session.expense_id);
  if (!exp) {
    await deleteFlowSession(ctx.userKey);
    return;
  }

  if (session.step === "awaiting_name") {
    await Promise.all([
      updateRow<Expense>("expenses", exp.id, { ...exp, payer: text }),
      writeFlowSession({ id: session.id, trip_id: session.trip_id, expense_id: session.expense_id, step: "awaiting_note", data: session.data }, ctx.now),
    ]);
    await ctx.reply([
      textMessage(`บันทึกคนบันทึกเป็น "${text}" แล้ว มีโน้ตอยากใส่ไหม? (พิมพ์ได้เลย หรือกดข้าม)`, buildSkipQuickReply(SKIP_LABEL) as FlexNode),
    ]);
    return;
  }

  if (session.step === "awaiting_note") {
    const note = text === SKIP_LABEL ? "" : text;
    await Promise.all([
      updateRow<Expense>("expenses", exp.id, { ...exp, description: note }),
      deleteFlowSession(ctx.userKey),
    ]);
    const flex = buildConfirmationFlex({
      photoUrl: imageUrl(ctx.origin, exp.slip_photo_ids[0]),
      payer: exp.payer,
      note,
      moneyUrl: `${ctx.origin}/trips/${exp.trip_id}/money`,
    });
    await ctx.reply([flex as FlexNode]);
  }
}
