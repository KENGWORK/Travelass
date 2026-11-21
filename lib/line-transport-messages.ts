// lib/line-transport-messages.ts
// Flex cards for the LINE "เดินทาง" feature. Deliberately never reads
// paid / pay_timing / slip_photo_ids (payment status stays in the app).
import type { ItineraryItem, Transport } from "@/lib/models/types";
import {
  CLAY,
  txt,
  compact,
  postbackAction,
  uriAction,
  imageUrl,
  flexMessage,
  textMessage,
  quickReply,
  type FlexNode,
} from "@/lib/line-flex";
import { mapButtons } from "@/lib/line-maps";
import { thaiDateLabel, addDays } from "@/lib/line-date";
import { formatDuration } from "@/lib/time";
import { PAGE_SIZE, btn, btnRow, clampPage, dm, needsReadMore, section, trunc } from "@/lib/line-plan-messages";
import {
  arrivalTime,
  countdown,
  departureTimes,
  effectiveDeparture,
  isPast,
  modeIcon,
  nextTransport,
} from "@/lib/line-transport";

export type TransportListMode =
  | { kind: "day"; date: string; start: string; end: string }
  | { kind: "search"; query: string };

export interface TransportListInput {
  mode: TransportListMode;
  transports: Transport[]; // already ordered (sortTransports for a day, searchTransports for a search)
  nowHHMM: string;
  today: string;
  page: number;            // 1-based
}

type Back = { d?: string; q?: string };

function listRow(t: Transport, nowHHMM: string, today: string, nextId: string | null, back: Back): FlexNode {
  const isToday = t.day_date === today;
  const dep = effectiveDeparture(t, nowHHMM, isToday);
  const arr = arrivalTime(t, dep.time);
  const past = isToday && isPast(t, nowHHMM);
  const isNext = t.id === nextId;
  const multi = departureTimes(t).length > 0;
  const suffix = past ? "ผ่านไปแล้ว" : isToday && multi && !dep.exhausted && dep.time ? `รอบถัดไป ${dep.time}` : "";
  const ink = past ? CLAY.grayInk : isNext ? CLAY.nextInk : CLAY.ink;
  const weight = isNext ? "bold" : "regular";
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    paddingAll: "8px",
    cornerRadius: "10px",
    ...(isNext ? { backgroundColor: CLAY.nextBg } : {}),
    action: postbackAction("เปิด", { a: "tr_detail", id: t.id, d: back.d, q: back.q }),
    contents: compact<FlexNode>([
      txt(modeIcon(t.mode), { size: "sm", flex: 0 }),
      {
        type: "box",
        layout: "vertical",
        flex: 0,
        width: "52px",
        contents: compact<FlexNode>([
          txt(dep.time || "—", { size: "sm", color: ink, weight }),
          txt(arr ? `–${arr}` : null, { size: "xs", color: CLAY.muted }),
        ]),
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact<FlexNode>([
          txt(`${t.from || "?"} → ${t.to || "?"}`, { size: "sm", color: ink, weight, wrap: true }),
          txt([t.mode, suffix].filter(Boolean).join(" · "), { size: "xs", color: past ? CLAY.grayInk : CLAY.muted, wrap: true }),
        ]),
      },
    ]),
  };
}

export function buildTransportList(input: TransportListInput): FlexNode {
  const p = { ...input, page: clampPage(input.page, input.transports.length) };
  const pageStart = (p.page - 1) * PAGE_SIZE;
  const shown = p.transports.slice(pageStart, pageStart + PAGE_SIZE);
  const remaining = p.transports.length - pageStart - shown.length;
  const nextId = nextTransport(p.transports.filter((t) => t.day_date === p.today), p.nowHHMM)?.id ?? null;
  const back: Back = p.mode.kind === "day" ? { d: p.mode.date } : { q: p.mode.query };

  const rows: (FlexNode | null)[] = [];
  let lastDay: string | null = null;
  for (const t of shown) {
    if (p.mode.kind === "search" && t.day_date !== lastDay) {
      rows.push(txt(t.day_date ? thaiDateLabel(t.day_date) : "ไม่ระบุวัน", { size: "xs", weight: "bold", color: CLAY.coral, margin: "md" }));
      lastDay = t.day_date;
    }
    rows.push(listRow(t, p.nowHHMM, p.today, nextId, back));
  }

  const title = p.mode.kind === "day" ? `🧭 การเดินทาง · ${thaiDateLabel(p.mode.date)}` : `🧭 ค้น "${p.mode.query}"`;
  const body = compact<FlexNode>([
    txt(title, { weight: "bold", size: "md", color: CLAY.coral, wrap: true }),
    txt(`${p.transports.length} เที่ยว`, { size: "xs", color: CLAY.muted }),
    { type: "separator", margin: "md", color: CLAY.line },
    ...(rows.length > 0 ? rows : [txt("ยังไม่มีการเดินทาง", { size: "sm", color: CLAY.muted, margin: "md" })]),
    remaining > 0 ? txt(`อีก ${remaining} เที่ยว`, { size: "xs", color: CLAY.muted, margin: "md" }) : null,
  ]);

  const nav =
    p.mode.kind === "day"
      ? compact<FlexNode>([
          p.mode.date > p.mode.start ? btn(postbackAction("◀ วันก่อน", { a: "tr_list", d: addDays(p.mode.date, -1) })) : null,
          p.mode.date < p.mode.end ? btn(postbackAction("วันถัดไป ▶", { a: "tr_list", d: addDays(p.mode.date, 1) })) : null,
        ])
      : [];
  const footer = compact<FlexNode>([
    remaining > 0 ? btn(postbackAction("ดูต่อ", { a: "tr_list", d: back.d, q: back.q, n: p.page + 1 }), "primary") : null,
    btnRow(nav),
  ]);

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", backgroundColor: CLAY.card, contents: body },
    ...(footer.length > 0
      ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", backgroundColor: CLAY.cream, contents: footer } }
      : {}),
  };
  return flexMessage(trunc(title, 400), bubble);
}

export interface TransportDetailInput {
  origin: string;
  t: Transport;
  nowHHMM: string;
  today: string;
  planItems: ItineraryItem[]; // itinerary rows whose linked_transport_id === t.id
  back: Back;                 // where "กลับรายการ" goes
}

function chipsSection(t: Transport, nowHHMM: string, isToday: boolean): FlexNode | null {
  const times = departureTimes(t);
  if (times.length === 0) return null;
  const dep = effectiveDeparture(t, nowHHMM, isToday);
  const chips = times.map((tm): FlexNode => {
    const past = isToday && tm < nowHHMM;
    const next = isToday && !dep.exhausted && tm === dep.time;
    return {
      type: "box",
      layout: "vertical",
      flex: 1,
      paddingAll: "4px",
      cornerRadius: "8px",
      backgroundColor: next ? CLAY.nextBg : CLAY.card,
      contents: [
        {
          type: "text",
          text: tm,
          size: "xs",
          align: "center",
          color: past ? CLAY.grayInk : next ? CLAY.nextInk : CLAY.ink,
          weight: next ? "bold" : "regular",
          ...(past ? { decoration: "line-through" } : {}),
        },
      ],
    };
  });
  // Flex boxes don't wrap, so lay chips out 4 per row (filler keeps widths even).
  const rows: FlexNode[] = [];
  for (let i = 0; i < chips.length; i += 4) {
    const slice = chips.slice(i, i + 4);
    while (slice.length < 4) slice.push({ type: "filler" });
    rows.push({ type: "box", layout: "horizontal", spacing: "xs", contents: slice });
  }
  const left = isToday && !dep.exhausted ? countdown(nowHHMM, dep.time) : "";
  return section(
    compact<FlexNode>([
      txt("🕒 รอบออก", { size: "xs", color: CLAY.muted }),
      ...rows,
      isToday && dep.exhausted ? txt("หมดรอบวันนี้แล้ว", { size: "sm", weight: "bold", color: CLAY.coral }) : null,
      left ? txt(`รอบถัดไป ${dep.time} · ${left}`, { size: "sm", weight: "bold", color: CLAY.nextInk }) : null,
    ]),
  );
}

export function buildTransportDetail(p: TransportDetailInput): FlexNode {
  const { t } = p;
  const isToday = t.day_date === p.today;
  const dep = effectiveDeparture(t, p.nowHHMM, isToday);
  const arr = arrivalTime(t, dep.time);
  const timeLine = [dep.time ? (arr ? `${dep.time}–${arr}` : dep.time) : "", formatDuration(t.duration_min)]
    .filter(Boolean)
    .join(" · ");

  const pickupPhoto = t.pickup_photo_ids[0];
  const pickupUrl = pickupPhoto ? imageUrl(p.origin, pickupPhoto) : "";
  const pickup =
    t.pickup_point || pickupPhoto
      ? section(
          compact<FlexNode>([
            txt(t.pickup_point ? `📍 จุดขึ้นรถ: ${t.pickup_point}` : "📍 จุดขึ้นรถ", { size: "sm", color: CLAY.ink, wrap: true }),
            pickupPhoto
              ? {
                  type: "image",
                  url: pickupUrl,
                  size: "full",
                  aspectRatio: "4:3",
                  aspectMode: "cover",
                  margin: "sm",
                  action: uriAction("ดูรูปเต็ม", pickupUrl),
                }
              : null,
            pickupPhoto ? txt("แตะรูปเพื่อขยาย", { size: "xxs", color: CLAY.muted }) : null,
          ]),
        )
      : null;

  const priceText =
    t.price_amount > 0
      ? `💰 ${t.price_amount} ${t.price_currency}` +
        (t.price_thb > 0 && t.price_currency !== "THB" ? ` (~${Math.round(t.price_thb)}฿)` : "") +
        (t.payer ? ` · ${t.payer}จ่าย` : "")
      : null;

  const body = compact<FlexNode>([
    txt(`${modeIcon(t.mode)} ${t.mode || "การเดินทาง"}`, { weight: "bold", size: "md", color: CLAY.coral, wrap: true }),
    txt(`${t.from || "?"} → ${t.to || "?"}`, { weight: "bold", size: "lg", color: CLAY.ink, wrap: true }),
    txt(timeLine, { size: "sm", color: CLAY.muted }),
    chipsSection(t, p.nowHHMM, isToday),
    pickup,
    txt(t.alt_option ? `🔀 ทางเลือกสำรอง: ${t.alt_option}` : null, { size: "sm", color: CLAY.ink, wrap: true, margin: "md" }),
    txt(priceText, { size: "sm", color: CLAY.ink, wrap: true, margin: "md" }),
    txt(t.notes, { size: "sm", color: CLAY.ink, wrap: true, maxLines: 3, margin: "md" }),
    t.notes && needsReadMore(t.notes) ? btn(postbackAction("อ่านต่อ", { a: "tr_note", id: t.id }), "link") : null,
  ]);

  const maps = t.to ? mapButtons({ query: t.to, directions: { mode: t.mode } }) : [];
  const planBtn =
    p.planItems.length === 1
      ? btn(postbackAction("📅 ดูในแพลน", { a: "plan_detail", i: p.planItems[0].id, d: p.planItems[0].day_date }))
      : p.planItems.length > 1
        ? btn(postbackAction("📅 ดูในแพลน", { a: "tr_plan", id: t.id }))
        : null;
  const backData = p.back.q ? { a: "tr_list", q: p.back.q } : { a: "tr_list", d: p.back.d || t.day_date || undefined };
  const footer = compact<FlexNode>([
    btnRow(maps),
    t.pickup_photo_ids.length >= 2
      ? btn(postbackAction(`📷 รูปจุดขึ้นรถ (${t.pickup_photo_ids.length})`, { a: "tr_photos", id: t.id }))
      : null,
    btnRow(compact<FlexNode>([planBtn, btn(postbackAction("กลับรายการ", backData))])),
  ]);

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", backgroundColor: CLAY.card, contents: body },
    footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", backgroundColor: CLAY.cream, contents: footer },
  };
  return flexMessage(trunc(`${t.from || "?"} → ${t.to || "?"}`, 400), bubble);
}

export function buildPlanPicker(items: ItineraryItem[]): FlexNode {
  return textMessage(
    "เลือกรายการในแพลน",
    quickReply(
      items.slice(0, 13).map((it) => ({
        label: `${dm(it.day_date)} ${it.title || "รายการ"}`,
        data: { a: "plan_detail", i: it.id, d: it.day_date },
      })),
    ),
  );
}
