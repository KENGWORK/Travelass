# LINE: ข้อมูลด่วน + โน้ต (เฟส 2 — ข้อมูล/โน้ต)

## Context

ต่อจาก spec LINE ชุด `2026-11-19-line-*-design.md`
ให้เรียกดู **ข้อมูลด่วน** (`quickinfo`: หัวข้อ → ค่า เช่น ที่อยู่ เบอร์ wifi) และ **โน้ต** (`quicknotes`: หัวข้อ + เนื้อหายาว) ผ่าน LINE

ผู้ใช้: กลุ่ม LINE 2 คน + บอท · ทริปเป้าหมาย = `status === "active"`

## ขอบเขต

- ดูอย่างเดียว — เพิ่ม/แก้/ปักหมุด/ลบ ทำในแอป
- ไม่รวมไดอารี่ (`notes`) — ไว้ทีหลัง
- reply เท่านั้น, ปุ่ม postback

## คำสั่ง

| คำหลัก | แหล่งข้อมูล |
|---|---|
| `ข้อมูลด่วน` `ข้อมูล` (match คำยาวก่อน) | `quickinfo` |
| `โน้ต` | `quicknotes` |

- ขึ้นต้นด้วยคำหลัก (ตัด `ขอดู` `ขอ` นำหน้าได้) · คำที่เหลือ = คำค้น (contains, case-insensitive)
- **ไม่ถามกลับเรื่องค่าใช้จ่าย** แม้มีตัวเลข (`ข้อมูล wifi 5G`) — คำสั่งชนะเสมอ

**ลำดับ router (อัปเดต):** session ที่รอคำตอบ → คำสั่งแพลน / ข้อมูล / โน้ต → คำสั่งการจอง / สถานที่ (ไม่มีตัวเลข) หรือถามกลับ (มีตัวเลข) → มีตัวเลข = ค่าใช้จ่าย → อื่นๆ เงียบ (กลุ่ม)

## ผลค้น (ทั้งสองคำสั่ง)

| เจอ | ตอบ |
|---|---|
| 0 มีคำค้น | "ไม่เจอ '{คำค้น}'" + quick reply หัวข้อที่มีจริง (≤ 13) |
| 0 ทั้งหมด | "ยังไม่มีข้อมูลด่วน/โน้ตในทริปนี้" + [เปิดแอป] |
| 1 | การ์ดเดี่ยว |
| ≥ 2 | การ์ดรายการ |

## ข้อมูลด่วน

**เรียง:** `pinned` ก่อน → `sort_order` (ตรงกับ `lib/quickinfo-order.ts` ในแอป)

**ค้น:** contains ใน `label` และ `value`

### ชนิดค่า (ตัดสินปุ่ม)

`classifyValue(label, value)`:
| ชนิด | เงื่อนไข | ปุ่ม |
|---|---|---|
| `phone` | value ตรง regex เบอร์ (ตัวเลข/`+`/ช่องว่าง/`-`, 3–20 หลัก) | 📞 โทร → `tel:{digits}` |
| `url` | value ขึ้นต้น `http(s)://` | 🔗 เปิดลิงก์ → uri |
| `address` | label มีคำ `ที่อยู่` `address` `โรงแรม` `hotel` หรือ value มีคำ `Road` `Rd` `St` `道` `號` `街` | 🗺 Google Maps + 高德 Amap ผ่าน `mapButtons({ query: value })` (spec การเดินทาง) |
| `text` | อื่นๆ | 📋 คัดลอก → clipboard |

### การ์ดรายการ (bubble เดียว)

```
หัว:  ℹ️ ข้อมูลด่วน · {n}  [· กรอง "{q}"]
แถว:  [📌] {label} (ตัวเล็ก)
      {value} ตัด 2 บรรทัด
      ปุ่มท้ายแถวตามชนิดค่า (phone/url → ปุ่มนั้น, address/text → 📋)
      มีรูป → ไอคอน 📷 หลัง label
      แตะตัวแถว → การ์ดเดี่ยว
```
> 15 รายการ → 15 แรก + [ดูต่อ]

### การ์ดเดี่ยว

```
label (ตัวเล็ก, 📌 ถ้า pinned)
value ตัวใหญ่ (xl), wrap เต็ม
hero/รูป: photo_ids[0] แตะขยาย (uri)
ปุ่ม: [📋 คัดลอก] + ปุ่มตามชนิด (📞 / 🔗 / 🗺) + [📷 รูป (N)] ถ้า N > 1
      [🔍 โชว์ตัวใหญ่]
```
+ **ตามด้วย text message** = value ล้วน (ไว้กดค้าง copy ใน LINE)

**โชว์ตัวใหญ่:** bubble ขนาด `giga`, พื้นขาว, value ขนาด `3xl`–`5xl` ตามความยาว (≤ 20 ตัว → 5xl, ≤ 60 → 4xl, อื่นๆ → 3xl), ไม่มีปุ่ม/ไม่มี label — ไว้ยื่นจอให้คนขับ/พนักงาน

## โน้ต

**เรียง:** `sort_order`

**ค้น:** contains ใน `title` และ `content`

### การ์ดรายการ (bubble เดียว)

```
หัว:  📒 โน้ต · {n}
แถว:  {title}
      {content บรรทัดแรกที่ไม่ว่าง} ตัด 1 บรรทัด
      ไอคอนท้าย: 📷 ถ้ามีรูป, ไม่งั้น ›
      แตะ → การ์ดเนื้อหา
```
> 15 → [ดูต่อ]

### การ์ดเนื้อหา

```
หัว:   {title}
เนื้อหา: content ตัด 12 บรรทัด (maxLines) — ไม่ตัด → ไม่มีปุ่มอ่านเต็ม
รูป:   photo_ids[0] แตะขยาย
ปุ่ม:  [📄 อ่านเต็ม] (เฉพาะเมื่อยาวเกิน) [📷 รูป (N)] [กลับรายการ]
```
- **title ว่าง** → ใช้บรรทัดแรกของ content แทน
- **อ่านเต็ม:** ส่ง content เป็น text message, แบ่งที่ 4,900 ตัวอักษร (ตัดที่ขึ้นบรรทัดใหม่ใกล้สุด), ≤ 5 ข้อความต่อ reply — เกิน → ข้อความที่ 5 ต่อท้าย "…ยังมีต่อ อ่านในแอป" + ลิงก์หน้าข้อมูล
- ไม่มี "อัปเดตเมื่อ" (`QuickNote` ไม่มี timestamp) — ตัดออกจาก mockup

## รูป

ใช้ `buildPhotoAlbum` จาก spec แพลน — ทุกรูปแตะขยายได้

## Postback data

`a=<action>&id=<row_id>&q=<query>&n=<page>`
actions: `qi_list qi_detail qi_big qi_photos qn_list qn_detail qn_full qn_photos`

## Units

| Unit | หน้าที่ |
|---|---|
| `lib/line-info-parse.ts` | `parseInfoQuery(text) → { kind: "quickinfo" \| "quicknotes", query } \| null` — pure |
| `lib/line-info.ts` | `classifyValue`, `telUri`, `sortQuickInfo` (ใช้ `quickinfo-order.ts`), `searchQuickInfo`, `searchNotes`, `splitLongText(text, 4900, 5)` — pure |
| `lib/line-info-messages.ts` | `buildQuickInfoList`, `buildQuickInfoDetail`, `buildBigText`, `buildNoteList`, `buildNoteDetail` — pure |
| `app/api/line/webhook/route.ts` | router + I/O |

## Testing

- parse: `ข้อมูล`, `ข้อมูลด่วน` (ไม่ถูกตีเป็น `ข้อมูล` + คำค้น `ด่วน`), `ข้อมูล wifi`, `ขอดูโน้ต วีซ่า`, `ข้อมูล wifi 5G` (ไม่ถามกลับ), ข้อความทั่วไป → null
- classifyValue: เบอร์ไทย/ฮ่องกง/999, url, ที่อยู่จีน/อังกฤษ, ข้อความธรรมดา, รหัส `POL-2291-TH` ไม่ใช่ phone
- sort: pinned ก่อน แล้ว sort_order
- splitLongText: สั้น, ยาวพอดี, ยาวเกิน 5 ชิ้น, ตัดที่ขึ้นบรรทัดใหม่
- builders: ไม่มี text node ว่าง, ปุ่มตามชนิด, การ์ดเนื้อหาไม่มีปุ่มอ่านเต็มเมื่อสั้น, big text เลือกขนาดตามความยาว

## Out of scope

- ไดอารี่ (`notes`)
- เพิ่ม/แก้ ข้อมูลด่วนหรือโน้ตผ่าน LINE
