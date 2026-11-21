# LINE bot: โครงกลาง (router, session, ตัวช่วยร่วม, เมนู)

## Context

Spec รายฟีเจอร์ (`2026-11-19-line-*-design.md`) เขียนแยกกัน — ไฟล์นี้คือ **สัญญากลาง** ที่ทุกฟีเจอร์ต้องใช้ร่วมกัน
ถ้าขัดกับ spec รายฟีเจอร์ **ไฟล์นี้ชนะ**

Spec ที่ครอบคลุม:
- `2026-11-19-line-expense-capture-design.md` (บันทึกค่าใช้จ่าย)
- `2026-11-19-line-plan-view-design.md` (แพลน)
- `2026-11-19-line-booking-view-design.md` (การจอง)
- `2026-11-19-line-places-view-design.md` (ร้าน/ที่เที่ยว)
- `2026-11-19-line-info-notes-view-design.md` (ข้อมูลด่วน/โน้ต)
- `2026-11-19-line-transport-view-design.md` (การเดินทาง)

นอกขอบเขต: สรุปค่าใช้จ่าย, แปลงค่าเงิน, สรุปหนี้ (ออกแบบทีหลัง), rich menu, ไดอารี่, AI อ่านสลิป

## การแก้ไขทับ spec รายฟีเจอร์

1. **กฎตัวเลขชนค่าใช้จ่าย (รวมทุกคำสั่ง):** ถามกลับ `[💸 บันทึกค่าใช้จ่าย] [{ปุ่มคำสั่ง}]` เฉพาะเมื่อข้อความเข้าข่ายคำสั่ง **การจอง / สถานที่ / การเดินทาง** และมีตัวเลข **หลังตัด token วันที่ออกแล้ว** (`21/11`, `20 พ.ย.`, `วันที่ 3` ไม่นับ) — แทนที่ข้อ "รวมวันที่" ใน spec การจอง
   - คำสั่ง แพลน / ข้อมูล / โน้ต / เมนู: ไม่ถามกลับเลย
2. **ลำดับข้อมูลด่วน:** ฝั่ง server ไม่มี `localStorage` → เรียง `pinned` ก่อน แล้ว `sort_order` (ไม่ใช้ `lib/quickinfo-order.ts`)
3. **session ระหว่างกรอกค่าใช้จ่าย + พิมพ์คำสั่งดู:** ไม่บล็อก — ดูรายละเอียดใน "Router" ข้อ 2

## ไฟล์และหน้าที่ (ทั้งระบบ)

```
lib/line.ts                      (มีอยู่) signature, reply, profile, + postback/user key
lib/line-text.ts                 ตัด prefix สุภาพ, match คำหลัก, ตัวเลข
lib/line-date.ts                 วันที่/เวลาตาม timezone, extractDate
lib/line-flex.ts                 primitives ของ Flex, postback encode/decode, อัลบั้มรูป, สี
lib/line-maps.ts                 ปุ่ม Google Maps + Amap
lib/line-router.ts               classifyText → Route (pure)
lib/line-session.ts              อ่าน/เขียน/TTL session (I/O ผ่าน store)
lib/line-menu.ts                 การ์ดเมนู/วิธีใช้
lib/line-expense-*.ts            (ฟีเจอร์ค่าใช้จ่าย)
lib/line-plan*.ts, line-booking*.ts, line-places*.ts, line-info*.ts, line-transport*.ts
lib/line-handlers/<feature>.ts   I/O ของแต่ละฟีเจอร์ (server-only)
app/api/line/webhook/route.ts    verify → แตก event → dispatch (บาง)
```

ไฟล์ `lib/line-*.ts` ที่ไม่มี I/O ต้อง **pure** (ทดสอบด้วย vitest ได้โดยไม่ mock network) · I/O ทั้งหมดอยู่ใน `lib/line-handlers/*` และ route

## สัญญา interface ร่วม

### `lib/line.ts` (เพิ่ม)

```ts
export interface LineEvent {
  type: string;                       // "message" | "postback" | ...
  replyToken?: string;
  source: LineSource;
  message?: { id: string; type: string; text?: string };
  postback?: { data: string };
}

// key ต่อ "คน" ในแชทนั้น — สองคนในกลุ่มเดียวกันได้ key ต่างกัน
// group → "group:{groupId}:user:{userId}", room → "room:{roomId}:user:{userId}", 1:1 → "user:{userId}"
export function userKey(source: LineSource): string;

export function isGroupChat(source: LineSource): boolean;   // group หรือ room
```
`sourceKey` เดิมคงไว้ (ไม่มีที่ใช้แล้วหลังย้าย — ลบได้ในงาน expense ถ้าไม่มีผู้ใช้)

### `lib/line-text.ts`

```ts
// ตัด "ขอดู" / "ขอ" นำหน้า (ซ้ำได้) + trim + ยุบช่องว่างซ้อน
export function stripPolitePrefix(text: string): string;

// match คำหลักที่ "ขึ้นต้น" ข้อความ (หลัง stripPolitePrefix), คำยาวก่อน, ไม่สนตัวพิมพ์
// rest = ส่วนที่เหลือ trim แล้ว
export function matchKeyword(text: string, keywords: readonly string[]): { keyword: string; rest: string } | null;

export function hasDigit(text: string): boolean;
```

### `lib/line-date.ts`

```ts
export interface TripDateCtx { start: string; end: string; today: string }   // ISO yyyy-mm-dd ทั้งหมด

export function todayInTz(tz: string, now: Date): string;     // "2026-11-20" (tz ว่าง → "Asia/Bangkok")
export function nowHHMMInTz(tz: string, now: Date): string;   // "13:18"

// ดึง token วันที่ "ตัวแรก" ออกจากข้อความ
// รองรับ: วันนี้ พรุ่งนี้ มะรืน เมื่อวาน | d/m, d/m/yyyy | d + เดือนไทยย่อ/เต็ม (พ.ย. พฤศจิกายน) | d + เดือนอังกฤษ (nov, november)
//        วันที่ N / day N (= วันที่ N ของทริป) | ชื่อวัน (จันทร์…อาทิตย์, มี/ไม่มี "วัน" นำหน้า; อังกฤษ mon…sun)
// ปีไม่ระบุ → ปีของ ctx.start (ถ้าเดือนน้อยกว่าเดือน start และทริปข้ามปี → ปี end)
// ชื่อวัน → วันแรก ≥ today ที่อยู่ในทริป; ไม่มี → วันแรกในทริปที่ตรงชื่อวัน
export function extractDate(text: string, ctx: TripDateCtx): {
  date: string | null;     // null = ไม่มี token วันที่
  rest: string;            // ข้อความที่ตัด token แล้ว (trim)
  outOfRange: boolean;     // มี token แต่วันอยู่นอก start..end
};

export function tripDayIndex(date: string, start: string): number;   // start → 1
export function addDays(date: string, n: number): string;
export function thaiDateLabel(date: string): string;                 // "พฤ 20 พ.ย."
```

### `lib/line-flex.ts`

```ts
export const CLAY = {
  cream: "#FFF3E8", card: "#FFFFFF", coral: "#F97362", peach: "#F5B78F",
  ink: "#5B4636", muted: "#8A7968", line: "#EADBCB",
  doneBg: "#E6F4EA", doneInk: "#2E7D4F", nextBg: "#E3F0FB", nextInk: "#1E5FA8", grayInk: "#A89A8C",
} as const;

export type FlexNode = Record<string, unknown>;

// text node — คืน null ถ้า text ว่าง (Flex ห้าม text "")
export function txt(text: string | null | undefined, opts?: Record<string, unknown>): FlexNode | null;
export function compact<T>(nodes: (T | null | undefined | false)[]): T[];

export function encodePostback(data: Record<string, string | number | undefined>): string;   // URLSearchParams, ข้าม undefined, ≤ 300 ตัวอักษร (ตัด q ถ้าเกิน)
export function decodePostback(data: string): Record<string, string>;

export function postbackAction(label: string, data: Record<string, string | number | undefined>, displayText?: string): FlexNode;
export function uriAction(label: string, uri: string): FlexNode;
export function clipboardAction(label: string, text: string): FlexNode;

export function imageUrl(origin: string, photoId: string): string;   // `${origin}/api/img/${encodeURIComponent(id)}`

// carousel รูป — ≤ 12 bubble; N > 12 → 11 รูป + bubble "ดูอีก {N-11} รูปในแอป" (uri moreUrl)
// ทุกรูป hero action = uri ไปรูปเต็ม
export function buildPhotoAlbum(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode;

export function flexMessage(altText: string, contents: FlexNode, quickReply?: FlexNode): FlexNode;
export function textMessage(text: string, quickReply?: FlexNode): FlexNode;
export function quickReply(items: { label: string; data?: Record<string, string | number | undefined>; text?: string }[]): FlexNode;  // ≤ 13, label ตัดที่ 20 ตัวอักษร
```

### `lib/line-maps.ts`

```ts
// คืนปุ่ม 2 อัน [Google Maps] [高德 Amap] (เป็น Flex button nodes) หรือ [] ถ้าไม่มี query และไม่มี mapsLink
export function mapButtons(p: { query: string; mapsLink?: string; directions?: { mode: string } }): FlexNode[];
export function googleSearchUrl(query: string): string;
export function googleDirUrl(destination: string, travelmode: "transit" | "driving" | "walking"): string;   // ไม่มี origin
export function amapSearchUrl(query: string): string;   // https://uri.amap.com/search?keyword=
```

### `lib/line-session.ts` + model

`LineSession` เพิ่ม field ต่อท้าย (mapper kind `"j"`):
```ts
export interface LineSession { id: string; trip_id: string; expense_id: string; step: string; updated_at: string; data: Record<string, unknown>; }
```
mapper: `line_sessions: [..., ["updated_at","s"], ["data","j"]]` — row เก่าที่ไม่มี column → `JSON.parse("")` ไม่เกิด เพราะ mapper `"j"` คืน `[]` สำหรับช่องว่าง → **ต้อง normalize เป็น `{}`** ใน `readSession`

session 2 ประเภท (คนละ row):
| id | ใช้ทำอะไร | TTL |
|---|---|---|
| `{userKey}` | flow กรอกค่าใช้จ่าย (เฟส 1) | 30 นาที |
| `{userKey}#ctx` | context การดู เช่น `data.lastPlanDate` | ไม่หมดอายุ |

```ts
export const SESSION_TTL_MS = 30 * 60 * 1000;
export async function readFlowSession(key: string, now: Date): Promise<LineSession | null>;   // หมดอายุ → ลบ row แล้วคืน null
export async function writeFlowSession(s: Omit<LineSession, "updated_at">, now: Date): Promise<void>;
export async function deleteFlowSession(key: string): Promise<void>;
export async function readCtx(key: string): Promise<Record<string, unknown>>;
export async function writeCtx(key: string, tripId: string, patch: Record<string, unknown>, now: Date): Promise<void>;   // merge
export function isExpired(updatedAt: string, now: Date): boolean;   // pure
```

## Router (`lib/line-router.ts`, pure)

```ts
export type Route =
  | { kind: "flow_answer" }                                  // ส่งให้ flow ค่าใช้จ่ายจัดการ
  | { kind: "menu" }
  | { kind: "plan"; rest: string }
  | { kind: "info"; rest: string }
  | { kind: "notes"; rest: string }
  | { kind: "booking"; rest: string }
  | { kind: "places"; placeKind: "r" | "w"; rest: string }
  | { kind: "transport"; rest: string; next: boolean }
  | { kind: "ambiguous"; target: "booking" | "places" | "transport"; text: string }
  | { kind: "expense_new"; text: string }
  | { kind: "flow_conflict"; text: string }                  // มี flow ค้าง + เริ่มรายการใหม่
  | { kind: "flow_reask" }                                   // มี flow ค้าง + ข้อความไม่เข้าเรื่อง
  | { kind: "ignore" }
  | { kind: "hint" };                                        // 1:1 ไม่เข้าใจ

export interface RouteCtx {
  flowStep: string | null;                    // step ของ flow session ที่ยังไม่หมดอายุ (null = ไม่มี)
  isFlowAnswer: (text: string) => boolean;    // flow บอกว่าข้อความนี้เป็นคำตอบที่ใช้ได้ของ step ปัจจุบัน (รวม ยกเลิก/ย้อน/ทำต่อ)
  isGroup: boolean;
  dateCtx: TripDateCtx | null;                // null = ไม่มีทริป active
}

export function classifyText(text: string, ctx: RouteCtx): Route;
```

**ลำดับตัดสิน (ข้อแรกที่ตรงชนะ):**

1. `ctx.flowStep && ctx.isFlowAnswer(text)` → `flow_answer`
2. คำสั่งดู (ไม่ถามกลับเลย): `เมนู` `?` → `menu` · `แพลน` `plan` · `ต่อไป` `next` `ตอนนี้` `now` `#<n>` → `plan` (rest = ข้อความเต็มหลังคำหลัก; `#n`/`ต่อไป`/`ตอนนี้` ส่ง rest เป็น token ให้ plan parse) · `ข้อมูลด่วน` `ข้อมูล` → `info` · `โน้ต` → `notes`
   - **flow ค้างอยู่ไม่บล็อก** — session คงอยู่ ผู้ใช้กลับมาตอบต่อได้
3. คำสั่งที่อาจชนค่าใช้จ่าย: การจอง (`จอง` `ตั๋ว` `เอกสาร` หลังตัด `การ` `ของ` ด้วย), สถานที่ (`ร้านอาหาร` `ร้าน` `กิน` → r; `ที่เที่ยว` `อยากไป` `สถานที่` → w), การเดินทาง (`เดินทาง` → next=false; `รอบต่อไป` `รถรอบถัดไป` → next=true)
   - rest หลัง `extractDate` ยังมีตัวเลข → `ambiguous`
   - ไม่มี → route ของคำสั่งนั้น
4. `hasDigit(text)` → ถ้ามี flow ค้าง → `flow_conflict`; ไม่มี → `expense_new`
5. มี flow ค้าง → `flow_reask`
6. `isGroup` → `ignore`; 1:1 → `hint`

ทุกคำหลักผ่าน `stripPolitePrefix` + `matchKeyword` · `ctx.dateCtx === null` (ไม่มีทริป active) ไม่เปลี่ยน route — handler ตอบเรื่องทริปเอง

## Postback dispatch

`decodePostback(data).a` prefix → handler:
| prefix | handler |
|---|---|
| `x_` | expense |
| `plan_` | plan |
| `bk_` | booking |
| `pl_` | places |
| `qi_` `qn_` | info |
| `tr_` | transport |
| `amb_` | ambiguity: `amb_expense` → expense_new ด้วย `q`; `amb_go` → route ตาม `t` (booking/places/transport) ด้วย `q` |
| `menu` | เมนู |

ชื่อ action ใน spec รายฟีเจอร์ที่ขัดกับ prefix นี้ → ใช้ prefix นี้ (เช่น expense spec ใช้ `a=payer` → `x_payer`)

## Webhook (`app/api/line/webhook/route.ts`)

- คงของเดิม: verify signature, parse, `ensureTabs`, `Promise.all` + catch ต่อ event, คืน 200 เสมอ
- รับ event: `message` (text / image) และ `postback`
- สร้าง `HandlerCtx` แล้ว dispatch:
```ts
export interface HandlerCtx {
  event: LineEvent;
  replyToken: string;
  accessToken: string;
  origin: string;            // req.nextUrl.origin
  now: Date;
  userKey: string;
  isGroup: boolean;
  trip: Trip | null;         // ทริป status === "active" ตัวแรก
  reply: (messages: FlexNode[]) => Promise<void>;   // ≤ 5 ข้อความ
}
```
- ไม่มี replyToken → ข้าม event
- `trip === null` และ route ต้องใช้ทริป → ตอบ `'ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ'` (`menu`/`ignore`/`hint` ไม่ต้องใช้ทริป)

## สัญญา handler (ให้ plan แต่ละฟีเจอร์ต่อเข้ามาได้โดยไม่ชนกัน)

`lib/line-handlers/types.ts` — `HandlerCtx` (ด้านบน) + `PostbackData = Record<string, string>`

แต่ละไฟล์ `lib/line-handlers/<feature>.ts` export ตามนี้ (feature = `expense` `plan` `booking` `places` `info` `transport`):
```ts
export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void>;          // route ของฟีเจอร์นี้เท่านั้น
export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void>;
```
`expense.ts` export เพิ่ม:
```ts
export async function handleImage(ctx: HandlerCtx): Promise<void>;
// สร้าง predicate ให้ router (อ่าน members ของทริปเองได้) — session = flow session ที่ยังไม่หมดอายุ
export async function flowAnswerPredicate(ctx: HandlerCtx, session: LineSession): Promise<(text: string) => boolean>;
```
`expense.ts` route ที่รับ: `flow_answer` `expense_new` `flow_conflict` `flow_reask`

`lib/line-dispatch.ts` (foundation) — `dispatchEvent(ctx: HandlerCtx): Promise<void>`:
1. postback → ตาราง prefix → `handlePostback` ของฟีเจอร์ (`amb_*` / `menu*` จัดการใน dispatch)
2. image → `expense.handleImage`
3. text → `readFlowSession(ctx.userKey)` → predicate (`expense.flowAnswerPredicate` หรือ `() => false`) → `classifyText` → ฟีเจอร์ตาม `route.kind` (`menu` / `hint` / `ignore` จัดการใน dispatch)

**Foundation plan สร้างทุกไฟล์ handler เป็น stub** (ตอบ `"ฟีเจอร์นี้กำลังพัฒนา"`) ยกเว้น `expense.ts` ที่ย้าย flow รูปสลิปเดิม (awaiting_name → awaiting_note → การ์ด) เข้าไปให้ทำงานเหมือนเดิม — plan ฟีเจอร์แต่ละอัน **แทนที่ไฟล์ handler ของตัวเองทั้งไฟล์** และไม่แตะ dispatch/router

## เมนู (`lib/line-menu.ts`)

`เมนู` / `?` → carousel 2 bubble:
1. **บันทึกค่าใช้จ่าย** — ตัวอย่าง `120 บาท ข้าว หาร`, `500 บาท เซเว่น ฝาก 20`, ส่งรูปสลิป, คำสั่ง `ทำต่อ` `แก้ล่าสุด` `ยกเลิก`
2. **ดูข้อมูล** — ปุ่ม postback ต่อคำสั่ง: แพลนวันนี้ · ต่อไป · การจอง · ร้าน · ที่เที่ยว · ข้อมูลด่วน · โน้ต · การเดินทาง (postback `a=menu_go&t=<route kind>`)

ข้อความ `hint` (1:1 ไม่เข้าใจ): `"ไม่เข้าใจ ลองพิมพ์ เช่น 120 บาท ข้าว หรือพิมพ์ เมนู"`

## ข้อจำกัดร่วม

- reply เท่านั้น (`/v2/bot/message/reply`), ≤ 5 messages ต่อ reply
- Flex: carousel ≤ 12 bubble · ไม่มี text node ว่าง · altText ≤ 400 ตัวอักษร
- postback data ≤ 300 ตัวอักษร
- quick reply ≤ 13 items, label ≤ 20 ตัวอักษร
- รูป: `/api/img/{id}` (สาธารณะ, ใช้อยู่แล้วในการ์ดยืนยันสลิป)

## Testing ร่วม

- `line-text`: prefix ซ้อน (`ขอดูขอ`), คำยาวก่อน (`ข้อมูลด่วน` vs `ข้อมูล`, `ร้านอาหาร` vs `ร้าน`), ไม่สนตัวพิมพ์ (`PLAN`)
- `line-date`: ทุกรูปแบบ token, ปีข้าม, ชื่อวัน, out of range, ไม่มี token, timezone (`Asia/Hong_Kong` 23:30 UTC = วันถัดไป)
- `line-flex`: `txt("")` → null, postback round-trip, ตัด data > 300, album ≤ 12 / > 12
- `line-maps`: encode ภาษาจีน, Google dir ไม่มี origin, mapsLink มาก่อน
- `line-router`: ทุกข้อของลำดับ + ตัวอย่างชนกัน: `ตั๋วรถ 50` → ambiguous, `จอง 21/11` → booking, `แพลน 20/11` → plan, `ข้อมูล wifi 5G` → info, `กินข้าว 120` → ambiguous, `120 ข้าว` → expense_new, มี flow + `แพลน` → plan, มี flow + `50 ข้าว` (ไม่ใช่คำตอบ) → flow_conflict, กลุ่ม + `สวัสดี` → ignore
- `line-session`: `isExpired`, normalize `data` จาก `[]` → `{}`
