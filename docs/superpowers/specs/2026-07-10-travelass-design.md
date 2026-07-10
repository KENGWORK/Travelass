# TravelAss — Trip Planning & Journaling App (Design)

## Context

ผู้ใช้ (ครอบครัว/แฟน, คนบันทึกหลักคนเดียว) ต้องการแอพวางแผน + จดบันทึกทริปท่องเที่ยว แบ่ง 2 โหมด: **ก่อนไป (Planning)** และ **ระหว่างเที่ยว (Traveling)** พร้อมเก็บ slip/รูปการจอง-การจ่ายเงิน และสรุปค่าใช้จ่าย. ใช้ของที่มีอยู่: Google Drive, Google Sheets, Vercel, GitHub. โฟลเดอร์ `C:\Users\Mario\Desktop\testclaude\TravelAss` ว่างเปล่า — greenfield.

การตัดสินใจที่ยืนยันแล้ว:
- ผู้ใช้: ครอบครัว — login จำกัดอีเมล, ทุกคนแก้ได้ (ไม่มี split bill ซับซ้อน แต่บันทึก "ใครจ่าย" ได้)
- Backend: **Google Sheets (ข้อมูล) + Google Drive (รูป slip/ภาพ)**
- Online-only — ไม่ต้องทำ offline/PWA sync
- อัตราแลกเปลี่ยน: ดึงอัตโนมัติจาก API (frankfurter.app ฟรี ไม่ต้องมี key) เป็นค่า default + แก้มือได้ต่อรายการ, เก็บ rate ที่ใช้จริงไว้กับรายการ
- Architecture: **แนวทาง A — Next.js บน Vercel**

## Architecture

- **Next.js 14+ (App Router) + TypeScript + Tailwind**, mobile-first, deploy Vercel, repo GitHub
- **Auth**: NextAuth (Auth.js) Google OAuth, allowlist อีเมล (env `ALLOWED_EMAILS`)
- **Google API access**: ทุก API call ใช้ **refresh token ของเจ้าของ** (เก็บใน Vercel env) — สมาชิกครอบครัว login แค่เพื่อผ่านประตู ไม่ต้องมีสิทธิ์ Drive/Sheets เอง. หลีกเลี่ยงปัญหา service account ไม่มี storage quota
- **Data**: Google Spreadsheet เดียว (master) หลาย tab, ทุก row มี `trip_id`. Drive: โฟลเดอร์ `TravelAss/<trip>/` แยก `slips/` และ `photos/`
- รูปอัพโหลดผ่าน API route (server-side ใช้ googleapis) → Drive → เก็บ file id ใน Sheets, แสดงผลผ่าน thumbnail proxy route

## Data Model (Sheets tabs)

| Tab | คอลัมน์หลัก |
|---|---|
| `trips` | id, name, destination, start_date, end_date, home_currency(THB), trip_currency, status(planning/active/done) |
| `itinerary` | id, trip_id, day_date, time, title, place, maps_link, notes, status(planned/done/skipped/moved), moved_to_date, linked_transport_id, linked_booking_id, sort_order |
| `transports` | id, trip_id, day_date, from, to, mode(รถไฟ/บัส/เครื่องบิน/เรือ/เดิน), **pickup_point, pickup_photo_ids, departure_times(รอบรถ), duration_min, alt_option(second choice: เส้นทาง+ราคา+หมายเหตุ)**, price_amount, price_currency, fx_rate, price_thb, payer, pay_timing(prepaid/จ่ายก่อน/จ่ายหลัง), paid(bool), slip_photo_ids, notes |
| `bookings` | id, trip_id, type(flight/hotel/car/activity), vendor, ref_no, date_from, date_to, detail, amount, currency, fx_rate, amount_thb, payer, pay_timing, paid, slip_photo_ids(confirmation+slip), notes |
| `expenses` | id, trip_id, datetime, category(อาหาร/เดินทาง/ที่พัก/ช้อป/ตั๋ว/อื่นๆ), description, amount, currency, fx_rate, amount_thb, payer, slip_photo_ids |
| `checklist` | id, trip_id, group(ของใช้/เอกสาร/to-do), item, done, from_template(bool) |
| `notes` | id, trip_id, date, text, photo_ids |
| `quickinfo` | id, trip_id, label(ที่อยู่โรงแรม/เบอร์ฉุกเฉิน/wifi ฯลฯ), value, photo_ids, pinned |

หมายเหตุ: ค่าเงิน — กรอกเป็นสกุลต่างประเทศ (auto-convert เป็น THB ด้วย rate จาก API, แก้ rate ได้) **หรือ** กรอกเป็น THB ตรงๆ (currency=THB, rate=1). `price_thb`/`amount_thb` เก็บค่าคำนวณแล้วเสมอ → สรุปยอดง่าย

## Screens

**ทุกโหมด**: Trip list → Trip dashboard (สลับแท็บ Planning / Traveling)

**Planning (ก่อนไป)**
1. **Itinerary รายวัน** — แท็บวัน, ลาก/จัดลำดับกิจกรรม, ลิงก์ Google Maps ต่อจุด
2. **Transport legs** — จุดขึ้นรถ + รูปจุดขึ้นรถ, รอบรถ, ระยะเวลาเดินทาง, ตัวเลือกสำรอง (second choice), ราคา + สกุลเงิน + ใครจ่าย + จ่ายเมื่อไหร่
3. **Booking tracker** — จองแล้ว/ยัง, แนบ confirmation + slip, ยอดจ่าย
4. **Checklist** — ของใช้/เอกสาร/to-do, มี template มาตรฐานกดสร้าง แล้วติ๊ก
5. **สรุปยอดที่จ่ายล่วงหน้าแล้ว** (จาก bookings + transports ที่ paid)

**Traveling (ระหว่างเที่ยว)**
1. **Today view** — แผนวันนี้เรียงตามเวลา, ติ๊ก done/skip, เลื่อนกิจกรรมไปวันอื่น, ปุ่มลัดดูรูปจุดขึ้นรถ + รอบรถ + Maps
2. **Quick expense** — ปุ่ม + ลอย: จำนวนเงิน (สกุลไหนก็ได้), หมวด, ใครจ่าย, ถ่าย/แนบ slip — จบใน 10 วินาที
3. **Diary** — โน๊ต + รูปถ่าย ผูกวันที่
4. **สรุปค่าใช้จ่าย real-time** — วันนี้ / ทั้งทริป, แยกหมวด + แยกคนจ่าย (รวม prepaid จาก planning)
5. **Quick info** — booking confirmations, ที่อยู่โรงแรม, เบอร์ฉุกเฉิน, รูปจุดขึ้นรถ — หน้าเดียวกดถึง

## Key Logic

- **FX**: ตอนกรอก fetch rate ปัจจุบัน (frankfurter.app, cache 12 ชม.) → prefill → user แก้ได้ → เก็บ rate+THB ลง row. รายการเก่าไม่เปลี่ยนเมื่อ rate ตลาดเปลี่ยน
- **Expense summary** = expenses + bookings(paid) + transports(paid) รวมเป็น THB, group by หมวด/คนจ่าย/วัน
- **Itinerary move**: เปลี่ยน status=moved + สร้าง row ใหม่ในวันปลายทาง (เก็บประวัติ)
- **Sheets เป็น source of truth** — เปิดแก้ใน Google Sheets ตรงๆ ได้เสมอ; แอพอ่าน/เขียนผ่าน googleapis, ไม่ cache ยาว

## UI Design Spec (ละเอียด)

### Design Direction — "Sunlit Journey"
Minimal อบอุ่น + micro-interactions แบบแอพ consumer. การ์ดมน เงานุ่ม พื้นหลังสว่างสบายตา สี teal ทะเล + coral พระอาทิตย์ตก. ทุก interaction มี feedback เล็กๆ (กดแล้วยุบ, ติ๊กแล้วเด้ง, ตัวเลขนับขึ้น). รองรับ dark mode.

### Color Tokens
| Token | Light | Dark | ใช้กับ |
|---|---|---|---|
| `primary` | `#0D9488` teal-600 | `#2DD4BF` teal-400 | ปุ่มหลัก, active tab, ลิงก์ |
| `primary-soft` | `#CCFBF1` teal-100 | `#134E4A`/40% | พื้น chip/badge/highlight |
| `accent` | `#F97316` orange-500 | `#FB923C` | FAB จดค่าใช้จ่าย, ตัวเลขเงิน emphasis |
| `bg` | `#F8FAFC` slate-50 | `#0F172A` slate-900 | พื้นหลังแอพ |
| `surface` | `#FFFFFF` | `#1E293B` slate-800 | การ์ด, bottom sheet |
| `text` | `#0F172A` slate-900 | `#F1F5F9` | ข้อความหลัก |
| `text-muted` | `#475569` slate-600 | `#94A3B8` | ข้อความรอง (ไม่อ่อนกว่านี้ — contrast) |
| `success` | `#16A34A` | `#4ADE80` | จ่ายแล้ว, จองแล้ว, done |
| `warning` | `#D97706` | `#FBBF24` | ยังไม่จอง, ใกล้ deadline |
| `danger` | `#DC2626` | `#F87171` | ลบ, เกินงบ |
| หมวดค่าใช้จ่าย | อาหาร `#F59E0B` / เดินทาง `#0EA5E9` / ที่พัก `#8B5CF6` / ช้อป `#EC4899` / ตั๋ว `#10B981` / อื่นๆ `#64748B` | เดียวกัน (เพิ่ม lightness) | chip + donut chart |

### Typography (รองรับไทยทั้งชุด — Google Fonts)
- **หัวข้อ**: `Prompt` (SemiBold 600 / Bold 700) — โมเดิร์น เหลี่ยมมนกำลังดี
- **เนื้อหา**: `Sarabun` (Regular 400 / Medium 500 / SemiBold 600) — อ่านง่ายสุดบนจอเล็ก
- **ตัวเลขเงิน/เวลา**: Sarabun SemiBold + `tabular-nums` (ตัวเลขกว้างเท่ากัน ยอดเงินเรียงตรง)

| ชื่อ | ขนาด/line-height | น้ำหนัก | ใช้กับ |
|---|---|---|---|
| `display` | 28/36 | Prompt 700 | ชื่อทริปบน dashboard, ยอดรวมใหญ่ |
| `h1` | 22/30 | Prompt 600 | ชื่อหน้า |
| `h2` | 18/26 | Prompt 600 | หัวข้อ section, ชื่อวัน |
| `body` | 16/24 | Sarabun 400 | เนื้อหาหลัก (ห้ามต่ำกว่า 16 บนมือถือ) |
| `body-md` | 16/24 | Sarabun 500 | ชื่อรายการในการ์ด |
| `sub` | 14/20 | Sarabun 400 | รายละเอียดรอง, เวลา, สถานที่ |
| `caption` | 12/16 | Sarabun 500 | label chip, หัวคอลัมน์ |
| `money-lg` | 24/32 tabular | Sarabun 600 | ยอดสรุป |
| `money` | 16/24 tabular | Sarabun 600 | ยอดต่อรายการ |

### Layout พื้นฐาน
- Mobile-first 375px; grid 4px; padding ข้างจอ 16px; ระยะระหว่างการ์ด 12px
- การ์ด: `rounded-2xl` (16px), `shadow-sm`, border 1px `slate-200`/dark `slate-700`
- Bottom tab bar (ในทริป): สูง 64px + safe-area, 5 ช่อง — **แผน · เดินทาง/จอง · [FAB] · เงิน · ข้อมูล** — FAB วงกลม 56px สี accent ลอยกลาง ยื่นเหนือ bar 12px
- Desktop (≥1024px): sidebar ซ้าย 240px แทน tab bar, เนื้อหา `max-w-3xl`
- Header ทุกหน้า: สูง 56px, ชื่อหน้า h1 กลาง/ซ้าย, ปุ่ม back 44×44px
- Touch target ทุกจุด ≥44×44px; ทุก element กดได้มี `cursor-pointer`
- Z-index scale: content 0 / sticky header 20 / tab bar 30 / bottom sheet 40 / toast 50

### ปุ่ม + เอฟเฟค
| ประเภท | สเปค | เอฟเฟคกด |
|---|---|---|
| **Primary** | สูง 48px, `rounded-full`, พื้น primary, ตัวอักษร Sarabun 600 16px ขาว, เต็มความกว้างใน form | กด: `scale(0.97)` + สีเข้มขึ้น 150ms ease-out; loading: spinner 20px แทน label + disabled; สำเร็จ: icon ✓ เด้งเข้า 200ms |
| **Secondary** | สูง 48px, พื้น primary-soft, ตัวอักษร primary | เดียวกับ primary แต่ไม่มี shadow |
| **Ghost/text** | สูง 44px, ไม่มีพื้น, ตัว primary | พื้นจาง `primary/8%` ตอน hover/press |
| **FAB (+ ค่าใช้จ่าย)** | 56px วงกลม, accent, icon plus ขาว 24px, `shadow-lg` | กด: scale 0.92 spring กลับ; เปิด bottom sheet เด้งขึ้น |
| **Icon button** | 44×44px, icon 24px Lucide | พื้นวงกลมจางตอนกด (ripple-lite: opacity 0→8%→0, 300ms) |
| **Chip เลือกหมวด** | สูง 36px, `rounded-full`, border; เลือกแล้ว: พื้นสีหมวด/15% + ตัวเข้ม + icon ✓ | สลับสี 150ms + scale pop 1→1.05→1 |
| **Checkbox (checklist/itinerary)** | วงกลม 24px | ติ๊ก: วง fill primary + เครื่องหมายถูกวาดเส้น (stroke-dashoffset 200ms) + เด้ง spring; แถวข้อความขีดฆ่า fade เป็น muted |

### Motion (Framer Motion; ทุกอย่างปิดเมื่อ `prefers-reduced-motion`)
- เปลี่ยนหน้า: fade + เลื่อนขึ้น 8px, 200ms ease-out
- รายการ (itinerary/expense): stagger fade-up ทีละ 30ms ตอนโหลด
- Bottom sheet (quick expense, ฟอร์มทั้งหมดบนมือถือ): slide-up spring (damping 30), พื้นหลังมืด 40%, ปัดลงเพื่อปิด
- ตัวเลขยอดรวม: count-up 400ms ตอนค่าเปลี่ยน
- บันทึกสำเร็จ: toast ล่าง (เหนือ tab bar) slide-up + haptic-style pop, หายเอง 2s
- Skeleton screen ตอนรอ Sheets (การ์ดเทาวิบ 1.2s) — ไม่ใช้ spinner กลางจอ
- ลบรายการ: swipe ซ้ายเผยปุ่มแดง, ยืนยันแล้ว collapse height 200ms
- ไอคอน: Lucide ทั้งแอพ 24px stroke 2 (ห้าม emoji เป็น icon)

### สเปคหน้าจอ (มือถือ, บน→ล่าง)

**1. Trip List (หน้าแรก)**
- Header: "ทริปของเรา" display + ปุ่ม + (สร้างทริป) มุมขวา
- การ์ดทริป (เต็มกว้าง, สูง ~120px): ซ้าย = ชื่อทริป h2 + วันที่ sub + badge สถานะ (กำลังวางแผน=warning chip / กำลังเที่ยว=primary chip pulse / จบแล้ว=muted); ขวา = ยอดใช้ไป money; แถบ progress countdown "อีก 12 วัน" caption
- ทริปที่ active เด้งขึ้นเป็นการ์ดแรก + ขอบ primary
- แตะการ์ด → Trip dashboard

**2. Trip Dashboard**
- Hero: ชื่อทริป display, วันที่, toggle **วางแผน ⟷ กำลังเที่ยว** (segmented control 2 ช่อง สูง 40px, ปุ่มเลื่อน slide 200ms)
- แถวสรุป 3 การ์ดเล็ก (grid-cols-3): งบใช้ไป (money-lg accent) / จองแล้ว x/y / เหลืออีก n วัน
- โหมดวางแผน: ลิสต์ shortcut การ์ด → Itinerary, เดินทาง, จอง, Checklist
- โหมดเที่ยว: แสดง Today view ฝังเลย (ข้อ 7)

**3. Itinerary Planner**
- แถบวันแนวนอน scroll ได้ (chip "วัน 1 ศ. 10", 44px, active = พื้น primary ขาว) sticky ใต้ header
- Timeline รายวัน: จุดวงกลม + เส้นเชื่อมซ้าย, การ์ดกิจกรรม = เวลา caption + ชื่อ body-md + สถานที่ sub + icon ลิงก์ Maps (44px)
- การ์ดที่ผูก transport แสดงแถบ mode icon (🚆→icon Lucide train) + เวลาเดินทาง
- ปุ่ม + ท้าย timeline ของแต่ละวัน (ghost เต็มกว้าง เส้นประ)
- กดค้าง + ลาก จัดลำดับ (การ์ดยก scale 1.03 + shadow-lg ตามนิ้ว)

**4. Transport Legs**
- ลิสต์การ์ดต่อ leg: หัว = "สนามบิน NRT → โรงแรม" body-md + mode icon; รูปจุดขึ้นรถ thumbnail 64×64 มุมขวา (แตะ → เปิดเต็มจอ pinch zoom ได้)
- แถวข้อมูลในการ์ด: จุดขึ้นรถ + icon map-pin / รอบรถ (chips เวลา: 09:15 · 10:40 · 12:00) / ระยะเวลา ~52 นาที / ราคา money + "¥3,200 ≈ ฿736" sub
- แถบ payer: avatar วงกลม 24px + "แฟนจ่าย · จ่ายล่วงหน้าแล้ว" + badge success
- **Second choice**: พับอยู่ใต้การ์ด — แตะ "ตัวเลือกสำรอง ▾" expand 200ms พื้น slate-100 จาง
- ฟอร์มเพิ่ม/แก้: bottom sheet เต็มจอ, field ตามลำดับ: จาก/ถึง → mode (chip แถว) → จุดขึ้นรถ + ปุ่มถ่าย/แนบรูป → รอบรถ (เพิ่มทีละเวลา) → ระยะเวลา → ราคา (ดู FX ข้างล่าง) → ผู้จ่าย → ตัวเลือกสำรอง

**5. Booking Tracker**
- แบ่ง section ตาม type (เที่ยวบิน/ที่พัก/รถ/กิจกรรม) หัว h2 + จำนวน "2/3 จองแล้ว"
- การ์ด: ชื่อ vendor body-md + ref no. caption mono + วันที่ + ยอด money; badge มุมขวา: จองแล้ว success / ยังไม่จอง warning (จุด pulse)
- แถว thumbnail slip/confirmation 56×56 (สูงสุด 4 + "+2") แตะดูเต็มจอ swipe ได้
- Progress bar บนสุด: จองครบกี่ % (แถบ primary, animate width ตอนเข้า)

**6. Checklist**
- 3 กลุ่ม (ของใช้/เอกสาร/to-do) — accordion หัว h2 + counter "6/10"
- แถว: checkbox 24px + ข้อความ body สูงแถว 48px; ติ๊กแล้วขีดฆ่า + เลื่อนลงท้ายกลุ่ม (layout animation 250ms)
- ปุ่ม "ใช้ template มาตรฐาน" ตอนลิสต์ว่าง (สร้างชุดพื้นฐาน: passport, ประกัน, ยา, ที่ชาร์จ…)

**7. Today View (โหมดเที่ยว)**
- บนสุด: "วันที่ 3 · อาทิตย์ 12 ก.ค." h1 + สภาพยอดวันนี้ (ใช้ไปวันนี้ money accent)
- Timeline เหมือน Itinerary แต่: รายการถัดไป = การ์ดขยาย (ขอบ primary, ปุ่มลัด: รูปจุดขึ้นรถ / รอบรถ / นำทาง Maps — แถวปุ่ม secondary 40px)
- แต่ละการ์ด: ปุ่มติ๊ก done (checkbox) + ปุ่ม ⋯ → เมนู: ข้าม / เลื่อนไปวันอื่น (เปิด date picker sheet)
- รายการ done หด opacity 60% เลื่อนความสำคัญลง

**8. Quick Expense (bottom sheet จาก FAB)**
- เปิดเร็ว focus แป้นตัวเลขทันที: ช่องจำนวนเงิน money-lg กลางจอ + toggle สกุลเงิน (chip THB ⟷ JPY สลับได้, แสดง "≈ ฿736" ใต้ทันที พร้อม rate caption "rate 0.23 ✎" แตะแก้)
- แถว chip หมวด 6 สี (scroll แนวนอน) → แถว payer (avatar 2 คน + "จ่ายร่วม") → ช่องโน๊ตสั้น (optional) → ปุ่มกล้อง/แนบ slip (thumbnail โผล่ inline)
- ปุ่ม "บันทึก" primary เต็มกว้างล่างสุด → toast "บันทึกแล้ว ฿736" + ยอดวันนี้ count-up
- ทั้ง flow ≤10 วินาที

**9. Expense Summary**
- Segmented: วันนี้ / รายวัน / ทั้งทริป
- ยอดรวมใหญ่ display + เทียบ "จ่ายล่วงหน้า ฿12,400 · หน้างาน ฿8,120" sub
- Donut chart หมวด (สีตามตาราง token, มี legend + ยอด, แตะ slice → filter ลิสต์ล่าง)
- แถบ "ใครจ่าย": bar 2 สี + ยอดต่อคน
- ลิสต์รายการ (group ตามวัน): icon หมวดวงกลมสี + ชื่อ + เวลา + ยอด money + thumbnail slip; แตะ → รายละเอียด/แก้ไข
- ปุ่ม export: "เปิดใน Google Sheets" ghost ล่างสุด

**10. Diary + Quick Info**
- Diary: การ์ดต่อวัน — วันที่ h2 + textarea โปร่ง + แถวรูป (grid 3 คอลัมน์ rounded-xl, แตะดูเต็มจอ), autosave (แสดง "บันทึกแล้ว ✓" caption จางๆ)
- Quick Info: ลิสต์การ์ดแตะแล้ว copy ได้ (ที่อยู่โรงแรม, wifi, เบอร์ฉุกเฉิน) — แตะ = copy + toast; รายการ pinned ขึ้นก่อน; รูป (จุดขึ้นรถ, confirmation) แถว thumbnail ใหญ่ 96px scroll แนวนอน

### FX Input Pattern (ใช้ซ้ำทุกฟอร์มเงิน)
ช่องจำนวน + dropdown สกุล (default = trip_currency) → แสดงบรรทัดแปลง "≈ ฿736 · rate 0.2300 ✎" อัตโนมัติ (debounce 300ms) → แตะ ✎ แก้ rate เอง (field เล็ก inline) → ถ้าเลือก THB ซ่อนบรรทัดแปลง. เก็บ `amount, currency, fx_rate, amount_thb` ทุกครั้ง

## Implementation Order (phases)

1. **Scaffold + Auth + Google plumbing** — Next.js, NextAuth allowlist, Sheets/Drive client (owner refresh token), สร้าง spreadsheet + ensure tabs อัตโนมัติ, script setup OAuth ครั้งแรก (ได้ refresh token)
2. **Trips + Itinerary CRUD** (planning core)
3. **Transports + Bookings** + upload รูปขึ้น Drive + FX conversion
4. **Checklist + templates**
5. **Traveling mode**: Today view, quick expense, สรุปค่าใช้จ่าย
6. **Diary + Quick info + polish** (thumbnail proxy, mobile UX)

TDD ตาม preference ผู้ใช้: เขียน test ก่อนสำหรับ logic ล้วน (FX conversion, sheet row ↔ object mapping, expense aggregation) — mock googleapis; UI ตรวจด้วย preview

## Files (โครง)

- `app/` — routes: `trips/[id]/(plan|travel)/...`, `api/` (sheets CRUD, drive upload, fx, image proxy)
- `lib/google/` — sheets client, drive client, auth
- `lib/fx.ts`, `lib/models/` — types + row mappers (+ tests)
- `docs/superpowers/specs/2026-07-10-travelass-design.md` — บันทึก spec นี้ลง repo (ตาม brainstorming flow) แล้วต่อด้วย writing-plans สร้าง implementation plan ละเอียดก่อนเริ่มโค้ด

## Verification

- Unit tests ผ่าน (FX, mappers, aggregation)
- Manual E2E: สร้างทริป → เพิ่ม itinerary/transport พร้อมรูปจุดขึ้นรถ → จอง + แนบ slip → เปิด Google Sheets เห็นข้อมูล, เปิด Drive เห็นรูป → โหมด travel: ติ๊ก done, จด expense JPY เห็นแปลง THB → หน้าสรุปยอดตรงกับที่กรอก
- Deploy Vercel + login ด้วยอีเมลใน allowlist ได้, อีเมลนอก list ถูกปฏิเสธ
