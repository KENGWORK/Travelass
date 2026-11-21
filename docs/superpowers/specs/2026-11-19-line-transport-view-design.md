# LINE: การเดินทาง (เฟส 2 — การเดินทาง)

## Context

ต่อจาก spec LINE ชุด `2026-11-19-line-*-design.md`
ให้ดูการเดินทาง (`transports`) ผ่าน LINE — ตอบ "ขึ้นตรงไหน / รอบถัดไปกี่โมง / ไปยังไง" ตอนกำลังจะออกเดินทาง

ผู้ใช้: กลุ่ม LINE 2 คน + บอท · ทริปเป้าหมาย = `status === "active"`
ทริปจริง: ฮ่องกง + กวางโจว (จีนแผ่นดินใหญ่) — ผู้ใช้ต่อเน็ตด้วย eSIM (ไม่ผ่าน GFW → LINE/Google ใช้ได้)

## ขอบเขต

- ดูอย่างเดียว — แก้ไขในแอป
- ไม่แสดงสถานะการจ่าย (`paid`, `pay_timing`) และไม่แสดงรูปสลิป (`slip_photo_ids`) — เหมือน spec การจอง
- reply เท่านั้น, ปุ่ม postback

## คำสั่ง

| พิมพ์ | ผล |
|---|---|
| `เดินทาง` | การเดินทางวันนี้ (การ์ดรายการ) |
| `เดินทาง พรุ่งนี้` / `เดินทาง 21/11` / `เดินทาง วันที่ 3` | วันที่ระบุ — ใช้ `parsePlanQuery` |
| `เดินทาง {คำค้น}` | ค้นทั้งทริป: contains ใน `from` `to` `mode` `notes` `pickup_point` |
| `รอบต่อไป` / `รถรอบถัดไป` | การเดินทางถัดไปของวันนี้ → การ์ดรายละเอียดทันที |

- **ไม่ใช้ `ไป` เป็นคำสั่ง** — ชนกับแชทปกติ ("ไปกินข้าวกัน")
- ตัด `ขอดู` `ขอ` นำหน้าได้
- **ชนกับค่าใช้จ่าย:** เข้าข่ายคำสั่ง + มีตัวเลขที่ **ไม่ใช่** token วันที่ (`21/11`, `วันที่ 3`) → ถามกลับ `[💸 บันทึกค่าใช้จ่าย] [🚌 ค้นการเดินทาง]` (เหมือน spec การจอง)
  - หมายเหตุ: ต่างจาก spec การจองตรงที่ยกเว้นวันที่ — `เดินทาง 21/11` ใช้บ่อยและไม่มีใครบันทึกค่าใช้จ่ายแบบนี้

**ผลค้น:** 0 → "ไม่เจอ" + ปุ่มวันในทริปที่มีการเดินทาง · 1 → การ์ดรายละเอียด · ≥ 2 → การ์ดรายการ (จัดกลุ่มตามวัน)

## เวลาเที่ยว ("รอบที่ใช้")

การเดินทางหนึ่งมีได้ทั้ง `depart_time`/`arrive_time` (เที่ยวเดียว) และ `departure_times[]` (หลายรอบ)

`effectiveDeparture(t, nowHHMM, isToday)`:
1. มี `departure_times` และเป็นวันนี้ → รอบแรกที่ `≥ now`; หมดแล้ว → รอบสุดท้าย (สถานะ "หมดรอบแล้ว")
2. มี `departure_times` ไม่ใช่วันนี้ → `depart_time` ถ้ามี ไม่งั้นรอบแรก
3. ไม่มี `departure_times` → `depart_time`

เวลาถึงที่แสดงในแถว = `arrive_time` ถ้ามี; ไม่มีแต่มี `duration_min` → `effectiveDeparture + duration_min`; ไม่มีทั้งคู่ → ไม่แสดง

"ตอนนี้" ใช้ `trip.trip_timezone`

## การ์ด 1 — รายการ (bubble เดียว)

```
หัว:   🧭 การเดินทาง · {DOW} {d} {เดือน}   (ค้น: "ค้น '{q}'")
       {n} เที่ยว
แถว:   {ไอคอน mode} | {ออก}↵–{ถึง} | {from} → {to}↵{mode}[ · รอบถัดไป {hh:mm} | · ผ่านไปแล้ว]
ท้าย:  [◀ วันก่อน] [วันถัดไป ▶]   (เฉพาะโหมดดูตามวัน; ซ่อนที่ขอบทริป)
```

- **เรียง:** `effectiveDeparture` (ว่างไว้ท้าย)
- **สีแถว (วันนี้เท่านั้น):** แถวถัดไป → พื้นฟ้า; ผ่านแล้ว (`ถึง < now`, หรือไม่มีเวลาถึงและ `ออก < now`) → เทา
- **ไอคอน mode** (match คำใน `mode`, case-insensitive): mtr/รถไฟ/train/metro → 🚇 · bus/บัส/รถเมล์ → 🚌 · ferry/เรือ → ⛴ · taxi/แท็กซี่/didi/uber/grab → 🚕 · เดิน/walk → 🚶 · flight/บิน → ✈️ · อื่นๆ → 🧭
- แตะแถว → การ์ดรายละเอียด
- > 15 → [ดูต่อ]

## การ์ด 2 — รายละเอียด

```
หัว:    {ไอคอน} {mode}
        {from} → {to}
        {ออก}–{ถึง} · {formatDuration(duration_min)}
รอบออก: (มี departure_times) chip ทุกรอบ
        วันนี้: ผ่านแล้ว = ขีดฆ่าเทา · รอบถัดไป = ไฮไลต์ + "อีก {x} นาที" (≥ 60 → "อีก {h} ชม. {m} นาที")
        หมดรอบ → แถบ "หมดรอบวันนี้แล้ว"
        ไม่ใช่วันนี้: chip ปกติทั้งหมด ไม่นับถอยหลัง
จุดขึ้นรถ: pickup_point + รูป pickup_photo_ids[0] (แตะขยาย)
ทางเลือกสำรอง: alt_option
ค่าเดินทาง: {price_amount} {price_currency}[ (~{price_thb}฿)] · {payer}จ่าย   (price 0 → ซ่อน)
โน้ต:   notes ตัด 3 บรรทัด + "อ่านต่อ"
ปุ่ม:   [🗺 Google Maps] [高德 Amap]
        [📷 รูปจุดขึ้นรถ ({N})]   (N ≥ 2)
        [📅 ดูในแพลน] [กลับรายการ]
```

- ทุกส่วนที่ว่าง → ซ่อน
- **ดูในแพลน:** itinerary ที่ `linked_transport_id === t.id` → 1: การ์ดรายละเอียดแพลน; หลายอัน: quick reply; ไม่มี → ซ่อน
- รูปจุดขึ้นรถ: อัลบั้ม `buildPhotoAlbum` (แตะขยายได้ทุกรูป)

## ปุ่มแผนที่ (ใช้ร่วมทุก spec LINE)

**มี 2 ปุ่มเสมอ** — Google เป็นหลัก, Amap สำรองสำหรับจีนแผ่นดินใหญ่

`mapButtons({ query, mapsLink?, mode? })`:

| ปุ่ม | URL |
|---|---|
| Google Maps (นำทาง — เฉพาะการเดินทาง) | `https://www.google.com/maps/dir/?api=1&destination={to}&travelmode={transit\|driving\|walking}` — ไม่ส่ง origin (เริ่มจากตำแหน่งปัจจุบัน) |
| Google Maps (สถานที่ — spec อื่น) | `maps_link` ถ้ามี ไม่งั้น `https://www.google.com/maps/search/?api=1&query={query}` |
| 高德 Amap | `https://uri.amap.com/search?keyword={query}` — เปิดแอป Amap ถ้าติดตั้ง ไม่งั้นเว็บ; ผู้ใช้กดนำทางเองในแอป |

- `travelmode`: mode ตรงกลุ่ม 🚕 → `driving`, 🚶 → `walking`, อื่นๆ → `transit`
- Amap ค้นด้วยชื่อ — ได้ผลดีกับชื่อจีน (เช่น 广州塔); ชื่ออังกฤษอาจไม่เจอ → แนะนำให้กรอกชื่อจีนในแอปสำหรับที่ในจีน (เอกสาร how-to)
- **ใช้แทนปุ่ม Maps เดี่ยว** ใน spec แพลน, สถานที่, ข้อมูลด่วน (ชนิด address)

## Postback data

`a=<action>&id=<transport_id>&d=<date>&q=<query>&n=<page>`
actions: `tr_list tr_detail tr_photos tr_note tr_plan amb_expense amb_transport`

## Units

| Unit | หน้าที่ |
|---|---|
| `lib/line-transport-parse.ts` | `parseTransportQuery(text, ctx) → { date?, query?, next?: true, hasNonDateDigit } \| null` — pure |
| `lib/line-transport.ts` | `effectiveDeparture`, `arrivalTime`, `nextTransport(list, now)`, `modeIcon(mode)`, `travelMode(mode)`, `countdown(now, hhmm)` — pure |
| `lib/line-maps.ts` | `mapButtons(...)`, `googleDirUrl`, `googleSearchUrl`, `amapSearchUrl` — pure, ใช้ทุก spec |
| `lib/line-transport-messages.ts` | `buildTransportList`, `buildTransportDetail` — pure |
| `app/api/line/webhook/route.ts` | router + I/O |

## Testing

- parse: `เดินทาง`, `เดินทาง พรุ่งนี้`, `เดินทาง 21/11` (ไม่ถามกลับ), `เดินทาง ดิสนีย์`, `รอบต่อไป`, `เดินทาง 50` (ถามกลับ), `ไปกินข้าวกัน` → null
- effectiveDeparture: มีรอบ+วันนี้ ก่อน/ระหว่าง/หลังรอบสุดท้าย, มีรอบไม่ใช่วันนี้, เที่ยวเดียว
- arrivalTime: arrive_time, จาก duration, ไม่มี
- nextTransport, countdown (< 60 นาที, ≥ 60, ข้ามเที่ยงคืนไม่นับ)
- modeIcon / travelMode ทุกกลุ่ม
- mapButtons: Google dir ไม่มี origin, travelmode ถูก, Amap encode ภาษาจีน, maps_link มาก่อน search
- builders: ไม่มี paid/pay_timing/slip ใน JSON, ซ่อนส่วนว่าง, chip รอบออกสถานะถูก

## Out of scope

- เลือกแผนที่อัตโนมัติตามประเทศ (ต้องเพิ่มข้อมูลในแอป)
- นำทางใน Amap ด้วยพิกัด (ไม่มีพิกัดในข้อมูล)
- แก้ไขการเดินทางผ่าน LINE
