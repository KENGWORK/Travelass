# LINE: บันทึกค่าใช้จ่ายแบบถามจนครบ (เฟส 1)

## Context

ตอนนี้ LINE bot รับได้แค่รูปสลิป → ถาม "ใครบันทึก" → ถามโน้ต → ส่งการ์ด (`app/api/line/webhook/route.ts`).
ยอด/สกุลเงิน/การหาร ยังต้องเข้าแอปไปกรอกเอง

เป้าหมาย: บันทึกรายการให้**ครบ**ได้ใน LINE เลย — พิมพ์ข้อความหรือส่งรูป แล้วบอทถามเฉพาะข้อที่ขาดจนกว่าจะครบ

ผู้ใช้จริง: กลุ่ม LINE 2 คน (เจ้าของ + แฟน) + บอท

## ข้อจำกัด

- **ตอบด้วย reply เท่านั้น** (`/v2/bot/message/reply`) — ไม่ใช้ push, ไม่กินโควต้า
- ปุ่มทั้งหมดใช้ **postback** (ได้ replyToken ใหม่ทุกครั้งที่กด, data ไม่โชว์ในแชท)
- ทริปเป้าหมาย = ทริปที่ `status === "active"` (เหมือนเดิม)

## ข้อมูลที่ต้องได้

| ข้อมูล | บังคับ | ที่มา / ถ้าขาด |
|---|---|---|
| ยอดเงิน | ✅ | parse จากข้อความ → ขาดถาม |
| สกุลเงิน | ✅ | parse จากข้อความ → ขาดถาม ปุ่ม [trip_currency][home_currency] |
| คนจ่าย | ✅ | คนส่งข้อความ (`matchMemberName(displayName)`) → ไม่ตรงสมาชิก ถาม ปุ่มชื่อสมาชิก |
| การหาร | ✅ | parse จากข้อความ → ขาดถาม ปุ่ม [ไม่หาร][หารเท่า][หารไม่เท่า] |
| ยอดฝากจ่าย | ✅ เฉพาะหารไม่เท่า | ถามต่อทันทีหลังเลือกหารไม่เท่า |
| หมวด | ไม่ถาม | เดาจาก keyword → ไม่เจอ = "อื่นๆ" |
| โน้ต | ไม่ถาม | ข้อความส่วนที่เหลือหลังตัด token ที่ parse แล้ว |
| เวลา | ไม่ถาม | เวลาที่ได้รับ event |

## การหาร (2 คน)

"อีกคน" = สมาชิกทริปที่ไม่ใช่คนจ่าย (ทริปนี้มี 2 คน)

| แบบ | `splits` ที่บันทึก |
|---|---|
| ไม่หาร | `[]` |
| หารเท่า | `[{ name: อีกคน, amount_thb: ceil2(amount_thb / 2) }]` — ปัดขึ้นทางฝั่งคนที่ต้องคืน ตาม convention เดิมใน expense-splitting spec |
| หารไม่เท่า | `[{ name: อีกคน, amount_thb: convertToTHB(x, fx_rate) }]` — x = ยอดฝากจ่ายในสกุลเงินของรายการ |

ส่วนของคนจ่ายไม่เก็บ (= `amount_thb - sum(splits)`) ตาม model เดิม → `lib/settle.ts` ใช้ต่อได้เลยไม่ต้องแก้

**ตรวจยอดฝากจ่าย (x):**
- ไม่มีตัวเลข → ถามซ้ำ
- `x = 0` → ถาม [เปลี่ยนเป็นไม่หาร][↩ ใส่ใหม่]
- `x > amount` → "เกินยอดรวม {amount} ใส่ใหม่นะ"
- `x = amount` → รับ (อีกคนคืนเต็ม = จ่ายแทนทั้งหมด)

ถ้าทริปมีสมาชิก ≠ 2 คน: หารเท่า/หารไม่เท่า ถามเพิ่มว่า "หารกับใคร?" ปุ่มสมาชิกที่ไม่ใช่คนจ่าย (เลือก 1 คน) — fallback เท่านั้น ไม่ใช่ flow หลัก

## Parse ข้อความ

ข้อความถือเป็น "เริ่มรายการ" เมื่อ **มีตัวเลขอย่างน้อย 1 ตัว** และไม่ได้อยู่กลาง flow ที่รอคำตอบ

| Token | กฎ |
|---|---|
| ยอด | ตัวเลข (รับ `1,200`, `12.5`) ไม่นับตัวเลขที่ตามหลัง `ฝาก` |
| สกุลเงิน | alias table: `HKD hk ดอลฮ่องกง เหรียญฮ่องกง` → HKD, `บาท ฿ THB thb` → THB, และรหัส 3 ตัวอักษรใน `SUPPORTED_CURRENCIES` |
| หารไม่เท่า | `ฝาก <ตัวเลข>` |
| หารเท่า | `หาร` หรือ `หารเท่า` |
| ไม่หาร | `ไม่หาร` (เช็คก่อน `หาร`) |
| หมวด | keyword table (ด้านล่าง) จับจากข้อความทั้งหมด |
| โน้ต | ข้อความที่เหลือ trim แล้ว |

**มีตัวเลข (นอก `ฝาก`) มากกว่า 1 ตัว** → ถาม "ยอดคือ?" ปุ่มตัวเลขแต่ละตัว (สูงสุด 4) — ตัวที่ไม่ได้เลือกคงอยู่ในโน้ต

**Keyword หมวด (เริ่มต้น, เพิ่มได้):**
- อาหาร: ข้าว กิน กาแฟ ชา น้ำ ขนม ติ่มซำ บะหมี่ อาหาร ร้าน dim sum cafe
- เดินทาง: แท็กซี่ taxi mtr รถ บัส เรือ ferry octopus ค่ารถ grab uber
- ที่พัก: โรงแรม hotel ที่พัก airbnb
- ช้อป: ซื้อ ช้อป เซเว่น 7-11 ของฝาก shop
- ตั๋ว: ตั๋ว บัตร ticket เข้าชม
- อื่นๆ: default

pure function: `parseExpenseText(text, { members, tripCurrency, homeCurrency }) → { amount?, amountCandidates[], currency?, split?: {mode, owedAmount?}, category, note }`

## Flow

```
start (text มีตัวเลข | image)
  → สร้าง Expense pending=true ทันที (draft-first; รูปแนบถ้ามี)
  → เติมทุกอย่างที่ parse ได้ + payer จาก displayName
  → nextStep()
nextStep(): ถามข้อแรกที่ยังขาด ตามลำดับ
  1 payer → 2 amount (+ เลือก candidate) → 3 currency → 4 split → 4b owedAmount
  ครบ → การ์ดสรุป
การ์ดสรุป: [✅ ยืนยัน] [✏️ แก้] [🗑 ยกเลิก]
  ยืนยัน → pending=false, ลบ session, ตอบการ์ด "บันทึกแล้ว" (ไม่มีปุ่มยืนยันแล้ว มีปุ่มเปิดแอป)
  แก้    → ปุ่ม [ยอด][สกุลเงิน][คนจ่าย][หาร][หมวด][โน้ต] → ถามข้อนั้น → กลับการ์ดสรุป
  ยกเลิก → ลบ expense + session
```

- เมื่อรู้ทั้งยอดและสกุลเงิน: `fx_rate = fetchRate(currency)`, `amount_thb = convertToTHB(amount, fx_rate)` (ล้มเหลว → fx_rate 1 + เตือนในการ์ด "ดึงเรตไม่ได้ แก้ในแอป")
- ทุกคำถามขึ้นต้นด้วยชื่อคนบันทึก ("@เก่ง ...") และมีปุ่ม [↩ ย้อน] ยกเว้นคำถามแรก
- คำตอบแบบพิมพ์ในขั้นที่มีปุ่ม: ถ้าตรงตัวเลือก (case-insensitive / alias) รับเลย ไม่ตรง → ถามซ้ำพร้อมปุ่มเดิม
- รูปที่ส่งมาตอนอยู่กลาง flow ที่ยังไม่มีรูป → แนบเข้ารายการที่ค้าง

## การ์ดสรุป (Flex)

ใช้สไตล์ clay เดิมจาก `buildConfirmationFlex`

```
[รูปสลิป ถ้ามี]
120 HKD (~540฿)
🍜 อาหาร · 📝 ข้าวมันไก่
👤 เก่ง จ่าย
⚖️ หารเท่า: โอคืน 270฿     | ไม่หาร | หารไม่เท่า: เก่ง 480 · โอ 20 → โอคืน 20฿
[✅ ยืนยัน] [✏️ แก้] [🗑 ยกเลิก]
```

## คำสั่งเสริม (text)

| คำสั่ง | ผล |
|---|---|
| `ยกเลิก` (กลาง flow) | ถาม [ลบทิ้ง][เก็บไว้กรอกทีหลัง] — เก็บ = ลบ session, expense ค้าง pending |
| `ทำต่อ` | หา session ของคนนี้ → ถามข้อที่ค้าง; ไม่มี session แต่มี pending ของคนนี้ → เปิดอันล่าสุดต่อ; ไม่มีเลย → "ไม่มีรายการค้าง" |
| `แก้ล่าสุด` | เปิดการ์ดสรุปของ expense ล่าสุดที่ payer = คนนี้ (สร้าง session ใหม่ step `summary`) |

## กรณีพิเศษ

| สถานการณ์ | ผล |
|---|---|
| เริ่มรายการใหม่ (ตัวเลข/รูป) ขณะมี session ค้าง ที่**ไม่ใช่**ขั้นรอตัวเลข | ถาม [ทำต่ออันเก่า][เก็บไว้ก่อน แล้วเริ่มใหม่][ทิ้งอันเก่า] |
| ขั้นรอตัวเลข (amount / owedAmount) ได้ข้อความมีตัวเลข | ถือเป็นคำตอบ ไม่ใช่รายการใหม่ |
| session เก่ากว่า 30 นาที | ถือว่าหมดอายุ: ลบ session, expense ค้าง pending; ข้อความถัดไปเริ่มใหม่ |
| postback ที่ step ไม่ตรง session ปัจจุบัน (ปุ่มเก่า) | ไม่ทำอะไร ถามข้อปัจจุบันซ้ำ |
| postback อ้าง expense ที่ถูกลบแล้ว | "รายการนี้ถูกลบไปแล้ว" |
| ไม่มีทริป active | ข้อความเดิม: ให้เปลี่ยนสถานะทริปก่อน |
| ข้อความไม่มีตัวเลขและไม่มี session/คำสั่ง | **กลุ่ม:** เงียบ · **1:1:** "ลองพิมพ์ เช่น `120 บาท ข้าว`" |

## Session (เปลี่ยนจากเดิม)

- **key แยกต่อคน**: `group:{groupId}:user:{userId}` / `room:{roomId}:user:{userId}` / `user:{userId}` — สองคนบันทึกพร้อมกันไม่ปนกัน (เดิม key ต่อกลุ่ม)
- `LineSession` เพิ่ม column ต่อท้าย (ไม่ทำให้ row เก่าเพี้ยน):
  - `data` (json) — state ระหว่างทางที่ยังไม่ลง expense: `amountCandidates`, `currencyConfirmed`, `splitMode`, `prevSteps[]` (สำหรับ ↩ ย้อน), `editing` (มาจากปุ่มแก้หรือไม่)
- `step`: `payer | amount | currency | split | owed | summary | confirm_cancel | conflict`
- `updated_at` ใช้ตัด TTL 30 นาที

**ทำไม `currencyConfirmed`:** `buildPendingExpense` ใส่ `trip_currency` ให้เป็น default เสมอ → แยกไม่ออกว่าผู้ใช้เลือกแล้วหรือยัง

## Postback data

query-string: `a=<action>&e=<expenseId>&s=<step>&v=<value>`
- actions: `payer amount currency split owed_zero back confirm edit cancel cancel_delete cancel_keep conflict_resume conflict_park conflict_drop editfield`
- ทุก postback ตรวจ `e` และ `s` ตรงกับ session ปัจจุบันก่อนทำ

## Units (แยกไฟล์ทดสอบได้)

| Unit | หน้าที่ |
|---|---|
| `lib/line-expense-parse.ts` | `parseExpenseText`, alias สกุลเงิน, keyword หมวด — pure |
| `lib/line-expense-flow.ts` | `nextMissingStep(expense, sessionData, members)`, `buildSplits(mode, amount_thb, owed_thb, payer, members)` — pure |
| `lib/line-expense-messages.ts` | builder ข้อความคำถาม + quick reply/postback + การ์ดสรุป — pure (JSON out) |
| `lib/line.ts` | เพิ่ม `sourceKey` แบบต่อคน, postback type ใน `LineEvent` |
| `app/api/line/webhook/route.ts` | router: text / image / postback → flow; I/O (store, fx, reply) อยู่ที่นี่เท่านั้น |

## Testing

- `parseExpenseText`: ตัวเลขเดี่ยว/หลายตัว/มี comma, alias สกุลเงินทุกตัว, `ฝาก 20`, `ไม่หาร` vs `หาร`, หมวดจาก keyword, โน้ตเหลือถูกต้อง
- `nextMissingStep`: ลำดับข้อ, ข้ามข้อที่มีแล้ว, หารไม่เท่าต้องมี owed
- `buildSplits`: ไม่หาร `[]`, หารเท่าปัดขึ้น, หารไม่เท่า x=amount / x<amount, ทริป ≠ 2 คน
- ตรวจ owed: 0 / เกิน / เท่า
- sourceKey ต่อคนในกลุ่ม
- message builders: postback data ถูก, ไม่มี text node ว่าง

## Out of scope (เฟสถัดไป)

- AI อ่านยอดจากสลิป
- ดูยอด/สรุป/หนี้, แพลน, การจอง ฯลฯ ผ่าน LINE (ออกแบบแยก)
- Rich menu
