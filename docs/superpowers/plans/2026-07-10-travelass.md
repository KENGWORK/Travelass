# TravelAss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trip planning + journaling web app (Planning / Traveling modes) with slip photo capture and expense summary, backed by Google Sheets + Drive.

**Architecture:** Next.js App Router on Vercel. All Google API calls run server-side as the owner (refresh token in env). One master spreadsheet, one tab per entity, `trip_id` column links rows. Drive folder per trip for slips/photos, images served through a proxy route. Family members sign in with Google; an email allowlist gates access.

**Tech Stack:** Next.js 15 (App Router) + TypeScript + Tailwind, NextAuth (Auth.js v5), googleapis, Vitest, Framer Motion, Lucide icons, frankfurter.app for FX rates.

**Spec:** `docs/superpowers/specs/2026-07-10-travelass-design.md` — data model, screen specs, color tokens, typography, motion. UI tasks reference spec sections; the spec is the source of truth for visual details.

## Global Constraints

- Language of UI copy: ไทย (Thai). Fonts: Prompt (headings), Sarabun (body) via `next/font/google`.
- Money stored as: `amount` (original), `currency` (ISO code), `fx_rate` (rate→THB used), `amount_thb` (computed, 2dp). THB entries: `currency="THB"`, `fx_rate=1`.
- All Sheets/Drive calls server-side only (API routes / server components). Never expose Google tokens to client.
- Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `SPREADSHEET_ID`, `DRIVE_ROOT_FOLDER_ID`, `ALLOWED_EMAILS` (comma-separated), `AUTH_SECRET`, `AUTH_URL`.
- Tests: Vitest, colocated under `lib/**/*.test.ts`. TDD for all pure logic (per user preference).
- Icons: Lucide only, no emoji icons. Touch targets ≥44px. `prefers-reduced-motion` respected.
- Dates in sheets: `YYYY-MM-DD` strings; datetimes ISO 8601. IDs: `crypto.randomUUID()`.
- Commit after every task (at minimum).

## File Structure

```
app/
  layout.tsx, globals.css, page.tsx            # trip list
  login/page.tsx
  trips/[id]/layout.tsx                        # tab bar shell
  trips/[id]/page.tsx                          # dashboard (mode toggle)
  trips/[id]/itinerary/page.tsx
  trips/[id]/transport/page.tsx
  trips/[id]/bookings/page.tsx
  trips/[id]/checklist/page.tsx
  trips/[id]/money/page.tsx                    # expense summary
  trips/[id]/info/page.tsx                     # quick info + diary
  api/auth/[...nextauth]/route.ts
  api/resource/[entity]/route.ts               # generic CRUD (GET/POST/PATCH/DELETE)
  api/upload/route.ts                          # multipart → Drive
  api/img/[fileId]/route.ts                    # image proxy
  api/fx/route.ts                              # rate lookup
auth.ts                                        # NextAuth config
lib/
  models/types.ts                              # all entity types + column orders
  models/mappers.ts (+ mappers.test.ts)        # row ↔ object
  fx.ts (+ fx.test.ts)                         # convert + fetchRate (cached)
  summary.ts (+ summary.test.ts)               # expense aggregation
  google/client.ts                             # OAuth2 client from env
  google/sheets.ts                             # SheetRepo generic CRUD + ensureTabs
  google/drive.ts                              # folders + upload + thumbnail fetch
  api.ts                                       # client-side fetch helpers
components/
  ui/{Button,Chip,BottomSheet,Checkbox,MoneyInput,Toast,Skeleton}.tsx
  TabBar.tsx, Fab.tsx, QuickExpenseSheet.tsx, PhotoPicker.tsx, PhotoViewer.tsx
scripts/get-refresh-token.mjs                  # one-time OAuth bootstrap
```

---

### Task 1: Scaffold project + fonts + design tokens + Vitest

**Files:**
- Create: entire Next.js scaffold, `vitest.config.ts`, `app/globals.css`, `app/layout.tsx`, `.env.example`

**Interfaces:**
- Produces: working `npm run dev`, `npm test`; Tailwind theme tokens `primary/accent/surface/...`; fonts as CSS vars `--font-prompt`, `--font-sarabun`.

- [ ] **Step 1: Scaffold**

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --yes
npm i googleapis next-auth@beta framer-motion lucide-react
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react
```

- [ ] **Step 2: Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", include: ["lib/**/*.test.ts", "components/**/*.test.tsx"] },
});
```
Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.

- [ ] **Step 3: Fonts + tokens**

`app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Prompt, Sarabun } from "next/font/google";
import "./globals.css";

const prompt = Prompt({ subsets: ["thai", "latin"], weight: ["600", "700"], variable: "--font-prompt" });
const sarabun = Sarabun({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--font-sarabun" });

export const metadata: Metadata = { title: "TravelAss", description: "วางแผนและบันทึกทริปท่องเที่ยว" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${prompt.variable} ${sarabun.variable}`}>
      <body className="bg-bg text-text font-body min-h-dvh">{children}</body>
    </html>
  );
}
```

`app/globals.css` (Tailwind v4 theme — exact hex from spec "Color Tokens"):
```css
@import "tailwindcss";

@theme {
  --color-primary: #0d9488;
  --color-primary-soft: #ccfbf1;
  --color-accent: #f97316;
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-text: #0f172a;
  --color-muted: #475569;
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  --color-cat-food: #f59e0b;
  --color-cat-transport: #0ea5e9;
  --color-cat-lodging: #8b5cf6;
  --color-cat-shopping: #ec4899;
  --color-cat-tickets: #10b981;
  --color-cat-other: #64748b;
  --font-heading: var(--font-prompt);
  --font-body: var(--font-sarabun);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #2dd4bf;
    --color-primary-soft: rgb(19 78 74 / 0.4);
    --color-accent: #fb923c;
    --color-bg: #0f172a;
    --color-surface: #1e293b;
    --color-text: #f1f5f9;
    --color-muted: #94a3b8;
    --color-success: #4ade80;
    --color-warning: #fbbf24;
    --color-danger: #f87171;
  }
}

.money { font-weight: 600; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: `.env.example`**

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
SPREADSHEET_ID=
DRIVE_ROOT_FOLDER_ID=
ALLOWED_EMAILS=you@gmail.com,partner@gmail.com
AUTH_SECRET=
AUTH_URL=http://localhost:3000
```

- [ ] **Step 5: Verify + commit**

Run: `npm run dev` → page loads at :3000. `npm test` → "no test files found" is OK (exit 0 with `--passWithNoTests`; add that flag to the script).
```bash
git add -A && git commit -m "chore: scaffold Next.js app with fonts, design tokens, vitest"
```

---

### Task 2: Entity types + row mappers (TDD)

**Files:**
- Create: `lib/models/types.ts`, `lib/models/mappers.ts`, `lib/models/mappers.test.ts`

**Interfaces:**
- Produces: types `Trip, ItineraryItem, Transport, Booking, Expense, ChecklistItem, Note, QuickInfo`; `ENTITIES` registry `{ [tab]: { columns: string[], fromRow(row: string[]): T, toRow(obj: T): string[] } }`; `EntityName` union = `"trips" | "itinerary" | "transports" | "bookings" | "expenses" | "checklist" | "notes" | "quickinfo"`.

Conventions inside mappers: numbers ↔ string via `String()`/`Number()` (empty → 0); booleans ↔ `"TRUE"/"FALSE"`; string arrays (photo ids, departure times) ↔ comma-joined; missing cells → `""`.

- [ ] **Step 1: Write failing tests**

`lib/models/mappers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ENTITIES } from "./mappers";
import type { Expense, Transport } from "./types";

const expense: Expense = {
  id: "e1", trip_id: "t1", datetime: "2026-07-12T09:30:00.000Z",
  category: "อาหาร", description: "ราเมง", amount: 3200, currency: "JPY",
  fx_rate: 0.23, amount_thb: 736, payer: "เรา", slip_photo_ids: ["f1", "f2"],
};

const transport: Transport = {
  id: "tr1", trip_id: "t1", day_date: "2026-07-12", from: "NRT", to: "โรงแรม",
  mode: "รถไฟ", pickup_point: "ชานชาลา 2", pickup_photo_ids: [],
  departure_times: ["09:15", "10:40"], duration_min: 52,
  alt_option: "บัส airport limousine ¥3600", price_amount: 3200, price_currency: "JPY",
  fx_rate: 0.23, price_thb: 736, payer: "แฟน", pay_timing: "prepaid",
  paid: true, slip_photo_ids: ["f9"], notes: "",
};

describe("mappers", () => {
  it("expense roundtrips through row", () => {
    const { toRow, fromRow } = ENTITIES.expenses;
    expect(fromRow(toRow(expense))).toEqual(expense);
  });
  it("transport roundtrips (arrays, bool, numbers)", () => {
    const { toRow, fromRow } = ENTITIES.transports;
    expect(fromRow(toRow(transport))).toEqual(transport);
  });
  it("fromRow tolerates short row (missing trailing cells)", () => {
    const { fromRow } = ENTITIES.expenses;
    const e = fromRow(["e2", "t1", "2026-07-12T00:00:00.000Z", "อื่นๆ", "", "100", "THB", "1", "100", "เรา"]);
    expect(e.slip_photo_ids).toEqual([]);
    expect(e.amount_thb).toBe(100);
  });
  it("columns match toRow length for every entity", () => {
    for (const [name, def] of Object.entries(ENTITIES)) {
      expect(def.columns.length, name).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run** `npm test` → FAIL (module not found).

- [ ] **Step 3: Implement**

`lib/models/types.ts` (columns follow spec Data Model table exactly):
```ts
export type TripStatus = "planning" | "active" | "done";
export type ItineraryStatus = "planned" | "done" | "skipped" | "moved";
export type PayTiming = "prepaid" | "pay_before" | "pay_after";
export type BookingType = "flight" | "hotel" | "car" | "activity";
export type Category = "อาหาร" | "เดินทาง" | "ที่พัก" | "ช้อป" | "ตั๋ว" | "อื่นๆ";

export interface Trip { id: string; name: string; destination: string; start_date: string; end_date: string; home_currency: string; trip_currency: string; status: TripStatus; }
export interface ItineraryItem { id: string; trip_id: string; day_date: string; time: string; title: string; place: string; maps_link: string; notes: string; status: ItineraryStatus; moved_to_date: string; linked_transport_id: string; linked_booking_id: string; sort_order: number; }
export interface Transport { id: string; trip_id: string; day_date: string; from: string; to: string; mode: string; pickup_point: string; pickup_photo_ids: string[]; departure_times: string[]; duration_min: number; alt_option: string; price_amount: number; price_currency: string; fx_rate: number; price_thb: number; payer: string; pay_timing: PayTiming; paid: boolean; slip_photo_ids: string[]; notes: string; }
export interface Booking { id: string; trip_id: string; type: BookingType; vendor: string; ref_no: string; date_from: string; date_to: string; detail: string; amount: number; currency: string; fx_rate: number; amount_thb: number; payer: string; pay_timing: PayTiming; paid: boolean; slip_photo_ids: string[]; notes: string; }
export interface Expense { id: string; trip_id: string; datetime: string; category: Category; description: string; amount: number; currency: string; fx_rate: number; amount_thb: number; payer: string; slip_photo_ids: string[]; }
export interface ChecklistItem { id: string; trip_id: string; group: string; item: string; done: boolean; from_template: boolean; }
export interface Note { id: string; trip_id: string; date: string; text: string; photo_ids: string[]; }
export interface QuickInfo { id: string; trip_id: string; label: string; value: string; photo_ids: string[]; pinned: boolean; }
```

`lib/models/mappers.ts` — declarative field specs, one generic engine:
```ts
import type { Trip, ItineraryItem, Transport, Booking, Expense, ChecklistItem, Note, QuickInfo } from "./types";

type Kind = "s" | "n" | "b" | "a"; // string, number, bool, string-array

function makeMapper<T>(fields: [keyof T & string, Kind][]) {
  return {
    columns: fields.map(([k]) => k),
    toRow(obj: T): string[] {
      return fields.map(([k, kind]) => {
        const v = obj[k] as unknown;
        if (kind === "n") return String(v ?? 0);
        if (kind === "b") return v ? "TRUE" : "FALSE";
        if (kind === "a") return (v as string[]).join(",");
        return String(v ?? "");
      });
    },
    fromRow(row: string[]): T {
      const obj: Record<string, unknown> = {};
      fields.forEach(([k, kind], i) => {
        const cell = row[i] ?? "";
        if (kind === "n") obj[k] = cell === "" ? 0 : Number(cell);
        else if (kind === "b") obj[k] = cell === "TRUE";
        else if (kind === "a") obj[k] = cell === "" ? [] : cell.split(",");
        else obj[k] = cell;
      });
      return obj as T;
    },
  };
}

export const ENTITIES = {
  trips: makeMapper<Trip>([["id","s"],["name","s"],["destination","s"],["start_date","s"],["end_date","s"],["home_currency","s"],["trip_currency","s"],["status","s"]]),
  itinerary: makeMapper<ItineraryItem>([["id","s"],["trip_id","s"],["day_date","s"],["time","s"],["title","s"],["place","s"],["maps_link","s"],["notes","s"],["status","s"],["moved_to_date","s"],["linked_transport_id","s"],["linked_booking_id","s"],["sort_order","n"]]),
  transports: makeMapper<Transport>([["id","s"],["trip_id","s"],["day_date","s"],["from","s"],["to","s"],["mode","s"],["pickup_point","s"],["pickup_photo_ids","a"],["departure_times","a"],["duration_min","n"],["alt_option","s"],["price_amount","n"],["price_currency","s"],["fx_rate","n"],["price_thb","n"],["payer","s"],["pay_timing","s"],["paid","b"],["slip_photo_ids","a"],["notes","s"]]),
  bookings: makeMapper<Booking>([["id","s"],["trip_id","s"],["type","s"],["vendor","s"],["ref_no","s"],["date_from","s"],["date_to","s"],["detail","s"],["amount","n"],["currency","s"],["fx_rate","n"],["amount_thb","n"],["payer","s"],["pay_timing","s"],["paid","b"],["slip_photo_ids","a"],["notes","s"]]),
  expenses: makeMapper<Expense>([["id","s"],["trip_id","s"],["datetime","s"],["category","s"],["description","s"],["amount","n"],["currency","s"],["fx_rate","n"],["amount_thb","n"],["payer","s"],["slip_photo_ids","a"]]),
  checklist: makeMapper<ChecklistItem>([["id","s"],["trip_id","s"],["group","s"],["item","s"],["done","b"],["from_template","b"]]),
  notes: makeMapper<Note>([["id","s"],["trip_id","s"],["date","s"],["text","s"],["photo_ids","a"]]),
  quickinfo: makeMapper<QuickInfo>([["id","s"],["trip_id","s"],["label","s"],["value","s"],["photo_ids","a"],["pinned","b"]]),
} as const;

export type EntityName = keyof typeof ENTITIES;
```

- [ ] **Step 4: Run** `npm test` → PASS (4 tests).

- [ ] **Step 5: Commit** `git add lib && git commit -m "feat: entity types and sheet row mappers"`

---

### Task 3: FX module (TDD)

**Files:**
- Create: `lib/fx.ts`, `lib/fx.test.ts`

**Interfaces:**
- Produces: `convertToTHB(amount: number, rate: number): number` (round 2dp); `fetchRate(from: string): Promise<number>` (rate from→THB, frankfurter.app, in-memory cache 12h, THB→1); `SUPPORTED_CURRENCIES: string[]`.

- [ ] **Step 1: Failing tests** — `lib/fx.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { convertToTHB, fetchRate, _clearCache } from "./fx";

describe("convertToTHB", () => {
  it("multiplies and rounds to 2dp", () => expect(convertToTHB(3200, 0.2299)).toBe(735.68));
  it("handles rate 1 (THB)", () => expect(convertToTHB(150.5, 1)).toBe(150.5));
});

describe("fetchRate", () => {
  beforeEach(() => { _clearCache(); vi.restoreAllMocks(); });
  it("returns 1 for THB without fetching", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await fetchRate("THB")).toBe(1);
    expect(spy).not.toHaveBeenCalled();
  });
  it("fetches frankfurter and caches", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rates: { THB: 0.2312 } })));
    expect(await fetchRate("JPY")).toBe(0.2312);
    expect(await fetchRate("JPY")).toBe(0.2312);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("api.frankfurter.dev/v1/latest?base=JPY&symbols=THB");
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — `lib/fx.ts`:
```ts
export const SUPPORTED_CURRENCIES = ["THB", "JPY", "USD", "EUR", "KRW", "CNY", "SGD", "GBP", "AUD", "TWD", "HKD", "VND", "MYR"];

export function convertToTHB(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

const TTL = 12 * 60 * 60 * 1000;
const cache = new Map<string, { rate: number; at: number }>();
export function _clearCache() { cache.clear(); }

export async function fetchRate(from: string): Promise<number> {
  if (from === "THB") return 1;
  const hit = cache.get(from);
  if (hit && Date.now() - hit.at < TTL) return hit.rate;
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=THB`);
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
  const data = (await res.json()) as { rates: { THB: number } };
  cache.set(from, { rate: data.rates.THB, at: Date.now() });
  return data.rates.THB;
}
```

- [ ] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `git add lib/fx* && git commit -m "feat: FX conversion with cached frankfurter rates"`

---

### Task 4: Expense aggregation (TDD)

**Files:**
- Create: `lib/summary.ts`, `lib/summary.test.ts`

**Interfaces:**
- Consumes: types from `lib/models/types`.
- Produces:
```ts
interface TripSummary {
  totalTHB: number; prepaidTHB: number; onsiteTHB: number;
  byCategory: Record<string, number>;   // category -> THB (expenses only)
  byPayer: Record<string, number>;      // payer -> THB (all sources)
  byDay: Record<string, number>;        // YYYY-MM-DD -> THB (expenses only)
}
summarize(expenses: Expense[], bookings: Booking[], transports: Transport[]): TripSummary
```
Rules (from spec Key Logic): bookings/transports count only when `paid=true` and go to `prepaidTHB` when `pay_timing="prepaid"`, else `onsiteTHB`. Expenses always count as onsite. Day key of expense = local date part of `datetime` (first 10 chars).

- [ ] **Step 1: Failing tests** — `lib/summary.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { summarize } from "./summary";
import type { Expense, Booking, Transport } from "./models/types";

const e = (over: Partial<Expense>): Expense => ({ id: "e", trip_id: "t", datetime: "2026-07-12T09:00:00.000Z", category: "อาหาร", description: "", amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0, payer: "เรา", slip_photo_ids: [], ...over });
const b = (over: Partial<Booking>): Booking => ({ id: "b", trip_id: "t", type: "hotel", vendor: "", ref_no: "", date_from: "", date_to: "", detail: "", amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0, payer: "เรา", pay_timing: "prepaid", paid: true, slip_photo_ids: [], notes: "", ...over });
const tr = (over: Partial<Transport>): Transport => ({ id: "tr", trip_id: "t", day_date: "", from: "", to: "", mode: "", pickup_point: "", pickup_photo_ids: [], departure_times: [], duration_min: 0, alt_option: "", price_amount: 0, price_currency: "THB", fx_rate: 1, price_thb: 0, payer: "เรา", pay_timing: "prepaid", paid: true, slip_photo_ids: [], notes: "", ...over });

describe("summarize", () => {
  it("sums totals and splits prepaid vs onsite", () => {
    const s = summarize(
      [e({ amount_thb: 100 }), e({ amount_thb: 50, payer: "แฟน", datetime: "2026-07-13T10:00:00.000Z" })],
      [b({ amount_thb: 5000 }), b({ amount_thb: 999, paid: false })],
      [tr({ price_thb: 736, pay_timing: "pay_after" })],
    );
    expect(s.totalTHB).toBe(100 + 50 + 5000 + 736);
    expect(s.prepaidTHB).toBe(5000);
    expect(s.onsiteTHB).toBe(100 + 50 + 736);
    expect(s.byPayer).toEqual({ "เรา": 100 + 5000 + 736, "แฟน": 50 });
    expect(s.byDay).toEqual({ "2026-07-12": 100, "2026-07-13": 50 });
    expect(s.byCategory).toEqual({ "อาหาร": 150 });
  });
  it("empty inputs give zeros", () => {
    const s = summarize([], [], []);
    expect(s.totalTHB).toBe(0);
    expect(s.byCategory).toEqual({});
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — `lib/summary.ts`:
```ts
import type { Expense, Booking, Transport } from "./models/types";

export interface TripSummary {
  totalTHB: number; prepaidTHB: number; onsiteTHB: number;
  byCategory: Record<string, number>;
  byPayer: Record<string, number>;
  byDay: Record<string, number>;
}

const add = (rec: Record<string, number>, key: string, v: number) => { rec[key] = (rec[key] ?? 0) + v; };
const r2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(expenses: Expense[], bookings: Booking[], transports: Transport[]): TripSummary {
  const s: TripSummary = { totalTHB: 0, prepaidTHB: 0, onsiteTHB: 0, byCategory: {}, byPayer: {}, byDay: {} };
  for (const x of expenses) {
    s.totalTHB += x.amount_thb; s.onsiteTHB += x.amount_thb;
    add(s.byCategory, x.category, x.amount_thb);
    add(s.byPayer, x.payer, x.amount_thb);
    add(s.byDay, x.datetime.slice(0, 10), x.amount_thb);
  }
  for (const x of bookings) {
    if (!x.paid) continue;
    s.totalTHB += x.amount_thb;
    x.pay_timing === "prepaid" ? (s.prepaidTHB += x.amount_thb) : (s.onsiteTHB += x.amount_thb);
    add(s.byPayer, x.payer, x.amount_thb);
  }
  for (const x of transports) {
    if (!x.paid) continue;
    s.totalTHB += x.price_thb;
    x.pay_timing === "prepaid" ? (s.prepaidTHB += x.price_thb) : (s.onsiteTHB += x.price_thb);
    add(s.byPayer, x.payer, x.price_thb);
  }
  s.totalTHB = r2(s.totalTHB); s.prepaidTHB = r2(s.prepaidTHB); s.onsiteTHB = r2(s.onsiteTHB);
  return s;
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `git add lib/summary* && git commit -m "feat: trip expense aggregation"`

---

### Task 5: Google client + refresh-token bootstrap script

**Files:**
- Create: `lib/google/client.ts`, `scripts/get-refresh-token.mjs`, `README.md` (setup section)

**Interfaces:**
- Produces: `getAuth(): OAuth2Client` (singleton, env creds); `getSheets()`, `getDrive()` returning googleapis clients.

- [ ] **Step 1: Implement client** — `lib/google/client.ts`:
```ts
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

let auth: OAuth2Client | null = null;

export function getAuth(): OAuth2Client {
  if (!auth) {
    auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return auth;
}

export const getSheets = () => google.sheets({ version: "v4", auth: getAuth() });
export const getDrive = () => google.drive({ version: "v3", auth: getAuth() });
```

- [ ] **Step 2: Bootstrap script** — `scripts/get-refresh-token.mjs` (run once locally; prints refresh token to paste into env):
```js
import { google } from "googleapis";
import http from "node:http";

const [clientId, clientSecret] = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET];
if (!clientId || !clientSecret) { console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first"); process.exit(1); }

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "http://localhost:8123/callback");
const url = oauth2.generateAuthUrl({
  access_type: "offline", prompt: "consent",
  scope: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"],
});
console.log("\nOpen this URL in your browser:\n\n" + url + "\n");

http.createServer(async (req, res) => {
  const code = new URL(req.url, "http://localhost:8123").searchParams.get("code");
  if (!code) return res.end("no code");
  const { tokens } = await oauth2.getToken(code);
  res.end("Done. Check your terminal.");
  console.log("\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
  process.exit(0);
}).listen(8123);
```

- [ ] **Step 3: README setup section** — document one-time Google Cloud setup:
```markdown
## Setup (ครั้งเดียว)
1. Google Cloud Console → สร้าง project → enable **Google Sheets API** + **Google Drive API**
2. OAuth consent screen → External → เพิ่มอีเมลตัวเองเป็น test user
3. Credentials → Create OAuth client ID → **Web application** → redirect URIs:
   `http://localhost:8123/callback` และ `http://localhost:3000/api/auth/callback/google` และ `https://<app>.vercel.app/api/auth/callback/google`
4. `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-refresh-token.mjs` → login ด้วยบัญชีเจ้าของ → copy `GOOGLE_REFRESH_TOKEN`
5. สร้าง Google Spreadsheet เปล่า 1 ไฟล์ + โฟลเดอร์ Drive 1 โฟลเดอร์ → เอา id จาก URL ใส่ `SPREADSHEET_ID`, `DRIVE_ROOT_FOLDER_ID`
6. เติม `.env.local` ตาม `.env.example` (`AUTH_SECRET`: `npx auth secret`)
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
`git add lib/google scripts README.md && git commit -m "feat: google API client and refresh-token bootstrap"`

---

### Task 6: SheetRepo generic CRUD + ensureTabs

**Files:**
- Create: `lib/google/sheets.ts`

**Interfaces:**
- Consumes: `getSheets()` (Task 5), `ENTITIES`, `EntityName` (Task 2).
- Produces:
```ts
listRows<T>(entity: EntityName, tripId?: string): Promise<T[]>
appendRow<T>(entity: EntityName, obj: T): Promise<void>
updateRow<T>(entity: EntityName, id: string, obj: T): Promise<void>
deleteRow(entity: EntityName, id: string): Promise<void>
ensureTabs(): Promise<void>   // creates missing tabs + header row
```
Implementation notes: row 1 = header (column names). `id` is always column A. Find row index by reading column A. Delete uses `batchUpdate` `deleteDimension`. `ensureTabs` compares `spreadsheets.get` sheet titles against `Object.keys(ENTITIES)`, adds missing tabs and writes header row. Google API calls not unit-tested (integration-verified in Task 9).

- [ ] **Step 1: Implement** — `lib/google/sheets.ts`:
```ts
import { getSheets } from "./client";
import { ENTITIES, type EntityName } from "@/lib/models/mappers";

const SSID = () => process.env.SPREADSHEET_ID!;

export async function ensureTabs(): Promise<void> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SSID() });
  const existing = new Set(meta.data.sheets?.map((s) => s.properties?.title) ?? []);
  const missing = Object.keys(ENTITIES).filter((t) => !existing.has(t));
  if (missing.length === 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SSID(),
    requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  for (const title of missing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SSID(), range: `${title}!A1`, valueInputOption: "RAW",
      requestBody: { values: [ENTITIES[title as EntityName].columns] },
    });
  }
}

export async function listRows<T>(entity: EntityName, tripId?: string): Promise<T[]> {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SSID(), range: `${entity}!A2:Z` });
  const rows = (res.data.values ?? []) as string[][];
  const items = rows.filter((r) => r[0]).map((r) => ENTITIES[entity].fromRow(r) as T);
  return tripId ? items.filter((i) => (i as { trip_id?: string }).trip_id === tripId) : items;
}

async function findRowIndex(entity: EntityName, id: string): Promise<number> {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SSID(), range: `${entity}!A2:A` });
  const idx = (res.data.values ?? []).findIndex((r) => r[0] === id);
  if (idx === -1) throw new Error(`${entity}/${id} not found`);
  return idx + 2; // 1-based + header
}

export async function appendRow<T>(entity: EntityName, obj: T): Promise<void> {
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SSID(), range: `${entity}!A1`, valueInputOption: "RAW",
    requestBody: { values: [ENTITIES[entity].toRow(obj as never)] },
  });
}

export async function updateRow<T>(entity: EntityName, id: string, obj: T): Promise<void> {
  const row = await findRowIndex(entity, id);
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SSID(), range: `${entity}!A${row}`, valueInputOption: "RAW",
    requestBody: { values: [ENTITIES[entity].toRow(obj as never)] },
  });
}

export async function deleteRow(entity: EntityName, id: string): Promise<void> {
  const row = await findRowIndex(entity, id);
  const meta = await getSheets().spreadsheets.get({ spreadsheetId: SSID() });
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === entity)?.properties?.sheetId;
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: SSID(),
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] },
  });
}
```

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` → clean. **Step 3: Commit** `git add lib/google/sheets.ts && git commit -m "feat: generic sheet repository with ensureTabs"`

---

### Task 7: Drive upload + folders + image proxy helper

**Files:**
- Create: `lib/google/drive.ts`

**Interfaces:**
- Consumes: `getDrive()` (Task 5).
- Produces:
```ts
uploadImage(buf: Buffer, mime: string, tripName: string, kind: "slips" | "photos", filename: string): Promise<string> // returns Drive fileId
getImageStream(fileId: string): Promise<{ stream: NodeJS.ReadableStream; mime: string }>
```
Folder layout: `DRIVE_ROOT_FOLDER_ID / <tripName> / (slips|photos)`. Folder ids cached in-memory per process.

- [ ] **Step 1: Implement** — `lib/google/drive.ts`:
```ts
import { Readable } from "node:stream";
import { getDrive } from "./client";

const folderCache = new Map<string, string>();

async function ensureFolder(name: string, parentId: string): Promise<string> {
  const key = `${parentId}/${name}`;
  const hit = folderCache.get(key);
  if (hit) return hit;
  const drive = getDrive();
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await drive.files.list({ q, fields: "files(id)" });
  let id = found.data.files?.[0]?.id;
  if (!id) {
    const created = await drive.files.create({
      requestBody: { name, parents: [parentId], mimeType: "application/vnd.google-apps.folder" },
      fields: "id",
    });
    id = created.data.id!;
  }
  folderCache.set(key, id);
  return id;
}

export async function uploadImage(buf: Buffer, mime: string, tripName: string, kind: "slips" | "photos", filename: string): Promise<string> {
  const tripFolder = await ensureFolder(tripName, process.env.DRIVE_ROOT_FOLDER_ID!);
  const kindFolder = await ensureFolder(kind, tripFolder);
  const res = await getDrive().files.create({
    requestBody: { name: filename, parents: [kindFolder] },
    media: { mimeType: mime, body: Readable.from(buf) },
    fields: "id",
  });
  return res.data.id!;
}

export async function getImageStream(fileId: string): Promise<{ stream: NodeJS.ReadableStream; mime: string }> {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: "mimeType" });
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  return { stream: res.data as unknown as NodeJS.ReadableStream, mime: meta.data.mimeType ?? "image/jpeg" };
}
```

- [ ] **Step 2: Typecheck + commit** `npx tsc --noEmit` → clean. `git add lib/google/drive.ts && git commit -m "feat: drive folder management and image upload/stream"`

---

### Task 8: NextAuth with email allowlist

**Files:**
- Create: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts`, `app/login/page.tsx`

**Interfaces:**
- Produces: `auth()` session helper for server components/routes; unauthenticated users redirected to `/login`; non-allowlisted emails rejected.

- [ ] **Step 1: Implement** — `auth.ts`:
```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowed = () => (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ user }) { return !!user.email && allowed().includes(user.email.toLowerCase()); },
    authorized({ auth }) { return !!auth?.user; },
  },
  pages: { signIn: "/login" },
});
```

`app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

`middleware.ts`:
```ts
export { auth as middleware } from "@/auth";
export const config = { matcher: ["/((?!login|api/auth|_next|favicon.ico).*)"] };
```

`app/login/page.tsx`:
```tsx
import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 p-4">
      <h1 className="font-heading text-[28px] leading-9 font-bold">TravelAss</h1>
      <p className="text-muted">วางแผนและบันทึกทริปของเรา</p>
      <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
        <button className="h-12 px-8 rounded-full bg-primary text-white font-semibold cursor-pointer transition-transform active:scale-[0.97]">
          เข้าสู่ระบบด้วย Google
        </button>
      </form>
    </main>
  );
}
```
Env note: NextAuth v5 reads `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` by default — set `Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })` to reuse the same OAuth client.

- [ ] **Step 2: Manual verify** — `npm run dev`, open `/` → redirects to `/login`; login with allowlisted email → lands on `/`; login with other account → access denied page.

- [ ] **Step 3: Commit** `git add auth.ts app middleware.ts && git commit -m "feat: google sign-in with email allowlist"`

---

### Task 9: Generic resource API + FX API

**Files:**
- Create: `app/api/resource/[entity]/route.ts`, `app/api/fx/route.ts`, `lib/api.ts`

**Interfaces:**
- Consumes: `listRows/appendRow/updateRow/deleteRow/ensureTabs` (Task 6), `ENTITIES` (Task 2), `fetchRate` (Task 3), `auth` (Task 8).
- Produces HTTP API used by all screens:
  - `GET  /api/resource/{entity}?trip_id=` → `T[]`
  - `POST /api/resource/{entity}` body `T` → 201
  - `PATCH /api/resource/{entity}?id=` body `T` (full object) → 200
  - `DELETE /api/resource/{entity}?id=` → 200
  - `GET /api/fx?from=JPY` → `{ rate: number }`
- Client helpers: `apiList<T>(entity, tripId?)`, `apiCreate(entity, obj)`, `apiUpdate(entity, id, obj)`, `apiDelete(entity, id)`, `apiRate(from)`.

- [ ] **Step 1: Implement route** — `app/api/resource/[entity]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ENTITIES, type EntityName } from "@/lib/models/mappers";
import { listRows, appendRow, updateRow, deleteRow, ensureTabs } from "@/lib/google/sheets";

let tabsReady: Promise<void> | null = null;
const ready = () => (tabsReady ??= ensureTabs());

async function guard(entity: string) {
  if (!(await auth())?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(entity in ENTITIES)) return NextResponse.json({ error: "unknown entity" }, { status: 404 });
  await ready();
  return null;
}

type Ctx = { params: Promise<{ entity: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  const tripId = req.nextUrl.searchParams.get("trip_id") ?? undefined;
  return NextResponse.json(await listRows(entity as EntityName, tripId));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  await appendRow(entity as EntityName, await req.json());
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await updateRow(entity as EntityName, id, await req.json());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteRow(entity as EntityName, id);
  return NextResponse.json({ ok: true });
}
```

`app/api/fx/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { fetchRate } from "@/lib/fx";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "THB";
  try { return NextResponse.json({ rate: await fetchRate(from) }); }
  catch { return NextResponse.json({ rate: 0 }, { status: 502 }); }
}
```

`lib/api.ts` (client-side):
```ts
import type { EntityName } from "@/lib/models/mappers";

async function handle<T>(p: Promise<Response>): Promise<T> {
  const res = await p;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
export const apiList = <T,>(entity: EntityName, tripId?: string): Promise<T[]> =>
  handle(fetch(`/api/resource/${entity}${tripId ? `?trip_id=${encodeURIComponent(tripId)}` : ""}`));
export const apiCreate = <T,>(entity: EntityName, obj: T) =>
  handle<{ ok: true }>(fetch(`/api/resource/${entity}`, { method: "POST", body: JSON.stringify(obj) }));
export const apiUpdate = <T,>(entity: EntityName, id: string, obj: T) =>
  handle<{ ok: true }>(fetch(`/api/resource/${entity}?id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(obj) }));
export const apiDelete = (entity: EntityName, id: string) =>
  handle<{ ok: true }>(fetch(`/api/resource/${entity}?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
export const apiRate = (from: string) => handle<{ rate: number }>(fetch(`/api/fx?from=${from}`));
```

- [ ] **Step 2: Integration verify (real Google APIs, .env.local filled)**

Run `npm run dev`, sign in, then in browser devtools:
```js
await fetch("/api/resource/trips", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), name: "ทดสอบ", destination: "Tokyo", start_date: "2026-08-01", end_date: "2026-08-05", home_currency: "THB", trip_currency: "JPY", status: "planning" }) });
await (await fetch("/api/resource/trips")).json();
```
Expected: spreadsheet gains all 8 tabs with headers; `trips` tab has the row; GET returns the object. Delete the test row via `DELETE`.

- [ ] **Step 3: Commit** `git add app/api lib/api.ts && git commit -m "feat: generic resource API over sheets + fx endpoint"`

---

### Task 10: Upload route + image proxy

**Files:**
- Create: `app/api/upload/route.ts`, `app/api/img/[fileId]/route.ts`

**Interfaces:**
- Consumes: `uploadImage`, `getImageStream` (Task 7), `auth` (Task 8).
- Produces:
  - `POST /api/upload` multipart form: `file`, `tripName`, `kind`("slips"|"photos") → `{ fileId }`
  - `GET /api/img/{fileId}` → image bytes (cache 1 day)

- [ ] **Step 1: Implement** — `app/api/upload/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadImage } from "@/lib/google/drive";

export async function POST(req: NextRequest) {
  if (!(await auth())?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const tripName = String(form.get("tripName") ?? "trip");
  const kind = form.get("kind") === "photos" ? "photos" : "slips";
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const fileId = await uploadImage(buf, file.type || "image/jpeg", tripName, kind, `${Date.now()}-${file.name}`);
  return NextResponse.json({ fileId });
}
```

`app/api/img/[fileId]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getImageStream } from "@/lib/google/drive";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!(await auth())?.user) return new NextResponse("unauthorized", { status: 401 });
  const { fileId } = await params;
  const { stream, mime } = await getImageStream(fileId);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" },
  });
}
```

- [ ] **Step 2: Integration verify** — devtools:
```js
const fd = new FormData();
fd.append("file", new File([new Blob(["x"])], "t.jpg", { type: "image/jpeg" }));
fd.append("tripName", "ทดสอบ"); fd.append("kind", "slips");
const { fileId } = await (await fetch("/api/upload", { method: "POST", body: fd })).json();
location.href = `/api/img/${fileId}`;
```
Expected: Drive shows `<root>/ทดสอบ/slips/…t.jpg`; proxy URL serves it.

- [ ] **Step 3: Commit** `git add app/api/upload app/api/img && git commit -m "feat: drive upload endpoint and image proxy"`

---

### Task 11: UI primitives

**Files:**
- Create: `components/ui/Button.tsx`, `components/ui/Chip.tsx`, `components/ui/Checkbox.tsx`, `components/ui/BottomSheet.tsx`, `components/ui/Toast.tsx`, `components/ui/Skeleton.tsx`, `components/ui/MoneyInput.tsx`, `components/PhotoPicker.tsx`, `components/PhotoViewer.tsx`

**Interfaces (spec sections "ปุ่ม + เอฟเฟค" + "FX Input Pattern" govern visuals):**
```tsx
<Button variant="primary"|"secondary"|"ghost" loading? full? />      // h-12 rounded-full, active:scale-97
<Chip selected onClick color?>label</Chip>                           // h-9 rounded-full pop animation
<Checkbox checked onChange />                                        // 24px circle, animated tick
<BottomSheet open onClose title>{children}</BottomSheet>             // slide-up spring, drag-down close
toast(msg: string) + <Toaster />                                     // slide-up above tab bar, 2s
<Skeleton className? />                                              // pulse block
<MoneyInput value onChange tripCurrency />                           // FX pattern; MoneyValue = {amount,currency,fx_rate,amount_thb}
<PhotoPicker tripName kind fileIds onChange />                       // capture/select → POST /api/upload → thumbnails
<PhotoViewer fileIds initialIndex onClose />                         // fullscreen swipe
```
`MoneyInput` behavior: currency defaults to `tripCurrency`; on currency change fetches `apiRate` to prefill editable rate; THB hides rate line and forces rate 1; always emits `amount_thb = convertToTHB(amount, rate)`.

- [ ] **Step 1:** Implement. Full code for the two nontrivial components. `components/ui/BottomSheet.tsx`:
```tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";

export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-40 bg-surface rounded-t-3xl p-4 pb-8 max-h-[92dvh] overflow-y-auto"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y" dragConstraints={{ top: 0 }} dragElastic={0.2}
            onDragEnd={(_, i) => { if (i.offset.y > 120) onClose(); }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted/30" />
            {title && <h2 className="font-heading text-lg font-semibold mb-3">{title}</h2>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```
`components/ui/MoneyInput.tsx`:
```tsx
"use client";
import { useState } from "react";
import { convertToTHB, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { apiRate } from "@/lib/api";

export interface MoneyValue { amount: number; currency: string; fx_rate: number; amount_thb: number; }

export function MoneyInput({ value, onChange, tripCurrency }: { value: MoneyValue; onChange: (v: MoneyValue) => void; tripCurrency: string }) {
  const [editingRate, setEditingRate] = useState(false);

  const emit = (patch: Partial<MoneyValue>) => {
    const next = { ...value, ...patch };
    next.amount_thb = convertToTHB(next.amount, next.fx_rate);
    onChange(next);
  };

  const setCurrency = async (currency: string) => {
    if (currency === "THB") return emit({ currency, fx_rate: 1 });
    emit({ currency });
    try { const { rate } = await apiRate(currency); emit({ currency, fx_rate: rate }); } catch {}
  };

  return (
    <div>
      <div className="flex gap-2 items-center">
        <input inputMode="decimal" autoFocus className="money text-2xl flex-1 h-12 rounded-2xl border border-muted/30 bg-surface px-4"
          value={value.amount || ""} placeholder="0"
          onChange={(e) => emit({ amount: Number(e.target.value) || 0 })} />
        <select className="h-12 rounded-2xl border border-muted/30 bg-surface px-2 cursor-pointer"
          value={value.currency} onChange={(e) => setCurrency(e.target.value)}>
          {[...new Set([tripCurrency, "THB", ...SUPPORTED_CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {value.currency !== "THB" && (
        <p className="text-sm text-muted mt-1">
          ≈ <span className="money">฿{value.amount_thb.toLocaleString()}</span> · rate{" "}
          {editingRate ? (
            <input autoFocus inputMode="decimal" className="w-20 border-b border-primary bg-transparent"
              defaultValue={value.fx_rate}
              onBlur={(e) => { emit({ fx_rate: Number(e.target.value) || value.fx_rate }); setEditingRate(false); }} />
          ) : (
            <button className="underline cursor-pointer" onClick={() => setEditingRate(true)}>{value.fx_rate} ✎</button>
          )}
        </p>
      )}
    </div>
  );
}
```
Remaining primitives, each per spec table — concrete requirements:
- `Button`: variant classes `bg-primary text-white` / `bg-primary-soft text-primary` / `bg-transparent text-primary`; base `h-12 rounded-full font-semibold px-6 cursor-pointer transition active:scale-[0.97] disabled:opacity-50`; `full` → `w-full`; `loading` replaces children with 20px border spinner and sets `disabled`.
- `Chip`: `h-9 px-4 rounded-full border border-muted/30 text-sm cursor-pointer transition inline-flex items-center gap-1`; selected: `border-transparent font-medium` + inline style `backgroundColor: color+"26"` (15%) when `color` given else `bg-primary-soft text-primary`; wrap in `motion.button` with `whileTap={{ scale: 1.05 }}`.
- `Checkbox`: `<button>` 24px round border; when checked: `bg-primary border-primary` + `<motion.svg>` check path `initial={{pathLength:0}} animate={{pathLength:1}} transition={{duration:0.2}}`.
- `Toast`/`Toaster`: module holds `let listeners: ((m:string)=>void)[]`; `toast(msg)` notifies; `Toaster` (client, mounted in trip layout + root layout) keeps message state, renders `AnimatePresence` fixed `bottom-20 inset-x-4 z-50` card, auto-clears after 2000ms.
- `Skeleton`: `<div className={"animate-pulse rounded-2xl bg-muted/15 " + className} />`.
- `PhotoPicker`: hidden `<input type="file" accept="image/*" capture="environment" multiple>` triggered by 56px dashed button (Lucide `Camera`); for each file POST `/api/upload` FormData, show Skeleton square while uploading, then thumbnail `<img src={"/api/img/"+id} className="w-14 h-14 rounded-xl object-cover">`; tap thumbnail → PhotoViewer; long-press not needed — small ✕ badge removes id from list.
- `PhotoViewer`: `fixed inset-0 z-50 bg-black` portal; current `<img className="max-h-full max-w-full m-auto" style={{touchAction:"pinch-zoom"}}>`; `motion.div drag="x"` — offset > 80 → prev/next; ✕ button 44px top-right closes.

- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit** `git add components && git commit -m "feat: UI primitives (button, sheet, money input, photo picker)"`

---

### Task 12: Trip list + create trip

**Files:**
- Create: `app/page.tsx` (replace scaffold), `components/TripCard.tsx`, `components/TripFormSheet.tsx`

**Interfaces:**
- Consumes: `apiList/apiCreate`, `Trip`, UI primitives.
- Produces: `/` per spec screen 1.

- [ ] **Step 1:** Implement. `app/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { apiList } from "@/lib/api";
import type { Trip } from "@/lib/models/types";
import { TripCard } from "@/components/TripCard";
import { TripFormSheet } from "@/components/TripFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";

export default function TripListPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => apiList<Trip>("trips").then((t) => setTrips(
    [...t].sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : b.start_date.localeCompare(a.start_date)))));
  useEffect(() => { load(); }, []);

  return (
    <main className="p-4 max-w-3xl mx-auto">
      <header className="flex items-center justify-between h-14">
        <h1 className="font-heading text-[28px] font-bold">ทริปของเรา</h1>
        <button aria-label="สร้างทริป" onClick={() => setOpen(true)}
          className="w-11 h-11 rounded-full bg-primary text-white grid place-items-center cursor-pointer active:scale-[0.92] transition">
          <Plus size={24} />
        </button>
      </header>
      <div className="flex flex-col gap-3 mt-2">
        {trips === null && [1, 2].map((i) => <Skeleton key={i} className="h-[120px]" />)}
        {trips?.map((t) => <TripCard key={t.id} trip={t} />)}
        {trips?.length === 0 && <p className="text-muted text-center py-16">ยังไม่มีทริป — กด + เพื่อเริ่มวางแผน</p>}
      </div>
      <TripFormSheet open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />
    </main>
  );
}
```
`TripCard`: `<Link href={"/trips/"+trip.id}>` card `rounded-2xl bg-surface border border-muted/20 shadow-sm p-4` (+ `ring-2 ring-primary` when active); left column: name (font-heading text-lg font-semibold), dates sub, status badge (planning → `bg-warning/15 text-warning` "กำลังวางแผน"; active → `bg-primary-soft text-primary` "กำลังเที่ยว" with 6px pulsing dot; done → `bg-muted/15 text-muted` "จบแล้ว"); right: spent THB `money` class (pass total via props later — show "—" for now, wired in Task 19 refactor is NOT needed: compute in page via `apiList("expenses")` skipped for list perf; leave "—" permanently on list, dashboard shows real totals). Countdown caption: future → `อีก ${Math.ceil((Date.parse(start)-Date.now())/864e5)} วัน`; active → `วันที่ ${day} ของทริป`; done → date range only.
`TripFormSheet`: BottomSheet with inputs name/destination/start/end (`<input type="date">`)/trip_currency (select from `SUPPORTED_CURRENCIES`), Button primary full "สร้างทริป" → `apiCreate("trips", { id: crypto.randomUUID(), home_currency: "THB", status: "planning", ...fields })`.

- [ ] **Step 2: Verify** — create trip "ญี่ปุ่น 2026"; card renders; row in spreadsheet.
- [ ] **Step 3: Commit** `git add app components && git commit -m "feat: trip list and trip creation"`

---

### Task 13: Trip shell (tab bar + FAB) + dashboard

**Files:**
- Create: `app/trips/[id]/layout.tsx`, `components/TabBar.tsx`, `lib/trip-context.tsx`, `lib/use-trip-data.ts`, `app/trips/[id]/page.tsx`

**Interfaces:**
- Produces:
  - `TripProvider`/`useTrip()` — client context `{ trip: Trip; refresh(): Promise<void> }`; layout fetches trip by id (`apiList<Trip>("trips")` → find), shows Skeleton while loading.
  - `useTripData(tripId)` — `Promise.all` fetch of expenses/bookings/transports/itinerary → `{ expenses, bookings, transports, itinerary, summary: summarize(...), reload() }`.
  - `TabBar` per spec Layout: 5 slots แผน/เดินทาง/[FAB]/เงิน/ข้อมูล; FAB opens `QuickExpenseSheet` (state lives in layout; until Task 18 the FAB shows `toast("เร็วๆ นี้")`).
  - Dashboard per spec screen 2: hero (trip name display, dates), segmented mode toggle (PATCH `status` planning⟷active, `motion.div layoutId="mode"` slider), 3 stat cards (ใช้ไป `summary.totalTHB` count-up / จองแล้ว paid-or-ref count "x/y" / อีก n วัน), then: planning mode → shortcut cards to itinerary/transport/bookings/checklist (bookings + checklist reachable only here and via segmented header on transport page — tab bar has 4 link slots); active mode → `<TodayView/>` (Task 17; render "โหมดเที่ยว พร้อมใช้หลัง Task 17" placeholder note NOT allowed — instead render itinerary link card until Task 17 replaces it, tracked there).
- `TabBar` code:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, TrainFront, Wallet, Info, Plus } from "lucide-react";

export function TabBar({ tripId, onFab }: { tripId: string; onFab: () => void }) {
  const path = usePathname();
  const tabs = [
    { href: `/trips/${tripId}/itinerary`, icon: CalendarDays, label: "แผน" },
    { href: `/trips/${tripId}/transport`, icon: TrainFront, label: "เดินทาง" },
    null,
    { href: `/trips/${tripId}/money`, icon: Wallet, label: "เงิน" },
    { href: `/trips/${tripId}/info`, icon: Info, label: "ข้อมูล" },
  ] as const;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 h-16 bg-surface border-t border-muted/20 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t, i) => t === null ? (
        <div key={i} className="relative">
          <button aria-label="จดค่าใช้จ่าย" onClick={onFab}
            className="absolute left-1/2 -translate-x-1/2 -top-3 w-14 h-14 rounded-full bg-accent text-white shadow-lg grid place-items-center cursor-pointer active:scale-[0.92] transition">
            <Plus size={24} />
          </button>
        </div>
      ) : (
        <Link key={t.href} href={t.href}
          className={`flex flex-col items-center justify-center gap-0.5 text-xs ${path.startsWith(t.href) ? "text-primary font-medium" : "text-muted"}`}>
          <t.icon size={24} /><span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
```
Layout wraps children: `<TripProvider>...<main className="pb-24">{children}</main><TabBar/><Toaster/></TripProvider>`.

- [ ] **Step 1:** Implement all four files.
- [ ] **Step 2: Verify** — enter trip → dashboard stats render from real data; toggle mode → sheet `trips` row status flips; tabs navigate (create the four child pages as minimal `<h1>` stubs now so routes exist; Tasks 14-20 fill them).
- [ ] **Step 3: Commit** `git add app components lib && git commit -m "feat: trip shell with tab bar, FAB slot, dashboard"`

---

### Task 14: Itinerary planner

**Files:**
- Create: `lib/days.ts`, `lib/days.test.ts`, `components/DayChips.tsx`, `components/ItineraryFormSheet.tsx`
- Modify: `app/trips/[id]/itinerary/page.tsx`

**Interfaces:**
- Produces: `tripDays(start: string, end: string): { date: string; label: string }[]`; screen per spec 3.
- Consumes: `useTrip`, `apiList/apiCreate/apiUpdate`, framer-motion `Reorder`.

- [ ] **Step 1: TDD `tripDays`** — `lib/days.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tripDays } from "./days";

describe("tripDays", () => {
  it("lists inclusive dates with thai labels", () => {
    const d = tripDays("2026-07-10", "2026-07-12");
    expect(d).toHaveLength(3);
    expect(d[0]).toEqual({ date: "2026-07-10", label: "วัน 1 ศ. 10" });
    expect(d[2].date).toBe("2026-07-12");
    expect(d[2].label).toMatch(/^วัน 3/);
  });
  it("single-day trip", () => expect(tripDays("2026-07-10", "2026-07-10")).toHaveLength(1));
});
```
Run → FAIL. Implement `lib/days.ts`:
```ts
const THAI_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export function tripDays(start: string, end: string): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  for (let i = 1; d <= last; i++, d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ date: iso, label: `วัน ${i} ${THAI_DOW[d.getDay()]} ${d.getDate()}` });
  }
  return out;
}
```
Run `npm test` → PASS.

- [ ] **Step 2: Build screen** — `DayChips` (horizontal scroll chips from `tripDays`, sticky `top-0 z-20 bg-bg py-2`, active chip `bg-primary text-white`); page state `selectedDate` (today if within trip range, else start_date); items = itinerary rows where `day_date === selectedDate && status !== "moved"` sorted by `sort_order`; render `Reorder.Group axis="y" values={items} onReorder={setItems}` with `Reorder.Item` cards (timeline dot + connector line via `before:` pseudo, time caption, title body-md, place sub + `MapPin` link icon when `maps_link`); on drag end PATCH every item whose index changed (`sort_order = index`). Linked transport chip: when `linked_transport_id`, find transport in `useTripData`, show mode icon + `${duration_min} นาที`. Ghost dashed add button → `ItineraryFormSheet` (time `<input type="time">`, title, place, maps_link, notes) → `apiCreate("itinerary", { id: uuid, trip_id, day_date: selectedDate, status: "planned", moved_to_date: "", linked_transport_id: "", linked_booking_id: "", sort_order: items.length, ...fields })`. Edit: tap card opens same sheet prefilled → PATCH; delete button in sheet → DELETE.

- [ ] **Step 3: Verify** — 3 activities day 1, drag-reorder, reload → order persists; rows in `itinerary` tab.
- [ ] **Step 4: Commit** `git add app components lib && git commit -m "feat: itinerary planner with day chips and drag reorder"`

---

### Task 15: Transport legs

**Files:**
- Create: `components/TransportCard.tsx`, `components/TransportFormSheet.tsx`, `components/PlanBookSegment.tsx`
- Modify: `app/trips/[id]/transport/page.tsx`

**Interfaces:**
- Consumes: `MoneyInput`/`MoneyValue`, `PhotoPicker`, `PhotoViewer`, api helpers, `useTrip`.
- Produces screen per spec 4. `PlanBookSegment` = segmented header **เดินทาง ⟷ จอง** linking `/transport` and `/bookings` (reused by Task 16).
- Mode icon map: `{ "รถไฟ": TrainFront, "บัส": Bus, "เครื่องบิน": Plane, "เรือ": Ship, "เดิน": Footprints }` (Lucide).

- [ ] **Step 1:** Implement:
  - `TransportCard`: header row `from → to` (body-md) + mode icon; pickup photo thumbnail 64px top-right (tap → PhotoViewer of `pickup_photo_ids`); info rows with 16px Lucide icons: `MapPin` pickup_point / `Clock` departure_times as small chips / `Timer` `~${duration_min} นาที` / price `money` + sub `${amount} ${cur} ≈ ฿${thb}` (hidden when THB); payer row: 24px initial-avatar + `${payer}จ่าย · ${timing label}` + paid badge success "จ่ายแล้ว" or warning "ยังไม่จ่าย"; collapsible footer button "ตัวเลือกสำรอง" chevron rotate + `AnimatePresence` height-animated `alt_option` text on `bg-muted/10` panel.
  - `TransportFormSheet` fields in spec order: from, to → mode Chip row → pickup_point + `PhotoPicker(kind="photos")` → departure times (time input + "เพิ่มเวลา" button appends chip; tap chip removes) → duration_min (number) → `MoneyInput` → payer Chips ("เรา"/"แฟน" + free text) → pay_timing Chips (จ่ายล่วงหน้า=prepaid/จ่ายก่อน=pay_before/จ่ายหลัง=pay_after) → paid Checkbox + `PhotoPicker(kind="slips")` → alt_option textarea → notes. Save maps `MoneyValue` → `price_amount/price_currency/fx_rate/price_thb`. Edit prefills; delete button (danger ghost) in sheet.
  - Page: list cards grouped by `day_date` (h2 from `tripDays` label), add button, `PlanBookSegment` at top.
- [ ] **Step 2: Verify** — leg NRT→โรงแรม JPY 3200 → card shows ≈฿; pickup photo persists after reload; sheet row arrays comma-joined.
- [ ] **Step 3: Commit** `git add app components && git commit -m "feat: transport legs with pickup photos, FX price, second choice"`

---

### Task 16: Booking tracker

**Files:**
- Create: `app/trips/[id]/bookings/page.tsx`, `components/BookingCard.tsx`, `components/BookingFormSheet.tsx`

**Interfaces:**
- Consumes: `PlanBookSegment` (Task 15), MoneyInput, PhotoPicker/Viewer, api helpers.
- Produces screen per spec 5. "จองแล้ว" = `paid || ref_no !== ""`.

- [ ] **Step 1:** Implement:
  - Top: `PlanBookSegment` (จอง active) + progress bar (`motion.div` width `booked/total*100%`, `bg-primary h-2 rounded-full`, animate on mount) + caption "จองแล้ว x/y".
  - Sections by type with Thai headers เที่ยวบิน/ที่พัก/รถ/กิจกรรม (icons Plane/BedDouble/Car/Ticket), each `h2 + count`.
  - `BookingCard`: vendor body-md + ref_no `font-mono text-xs text-muted` + dates sub + THB `money`; badge top-right: booked → success "จองแล้ว", else warning "ยังไม่จอง" + 6px `animate-pulse` dot; slip thumbnails 56px row (first 4 + "+n" overlay) → PhotoViewer.
  - `BookingFormSheet`: type Chips, vendor, ref_no, date_from/date_to, detail textarea, MoneyInput, payer Chips, pay_timing Chips, paid Checkbox, PhotoPicker(slips), notes. Create/edit/delete like Task 15.
- [ ] **Step 2: Verify** — hotel booking + 2 slips; progress updates; Drive files under trip folder.
- [ ] **Step 3: Commit** `git commit -am "feat: booking tracker with slips and progress"`

---

### Task 17: Checklist + Today view

**Files:**
- Create: `app/trips/[id]/checklist/page.tsx`, `components/TodayView.tsx`, `lib/checklist-template.ts`
- Modify: `app/trips/[id]/page.tsx` (active mode renders `<TodayView/>`)

**Interfaces:**
- `CHECKLIST_TEMPLATE: { group: "ของใช้" | "เอกสาร" | "to-do"; item: string }[]`:
```ts
export const CHECKLIST_TEMPLATE = [
  { group: "เอกสาร", item: "พาสปอร์ต (อายุเหลือ >6 เดือน)" }, { group: "เอกสาร", item: "วีซ่า / เอกสารเข้าเมือง" },
  { group: "เอกสาร", item: "ประกันเดินทาง" }, { group: "เอกสาร", item: "สำเนาพาสปอร์ต + รูปถ่าย" },
  { group: "ของใช้", item: "ยาประจำตัว + ยาสามัญ" }, { group: "ของใช้", item: "ที่ชาร์จ + สายชาร์จ" },
  { group: "ของใช้", item: "ปลั๊กแปลง" }, { group: "ของใช้", item: "เสื้อผ้าตามจำนวนวัน" },
  { group: "ของใช้", item: "power bank" }, { group: "ของใช้", item: "ร่ม/เสื้อกันฝน" },
  { group: "to-do", item: "แลกเงิน" }, { group: "to-do", item: "แจ้งธนาคารใช้บัตรต่างประเทศ" },
  { group: "to-do", item: "ซื้อซิม/eSIM" }, { group: "to-do", item: "เช็คอินออนไลน์" },
  { group: "to-do", item: "โหลดแผนที่ offline" },
] as const;
```
- Checklist screen per spec 6: 3 accordions (chevron rotate, `AnimatePresence` height) with "n/m" counters; row 48px = Checkbox + text (done → `line-through text-muted`, item re-sorts below undone with `motion.div layout`); add-item input at group bottom; empty state → Button "ใช้ template มาตรฐาน" bulk `apiCreate` per template row (`from_template: true`).
- `TodayView` per spec 7: date header `วันที่ n · <thai dow+date>` + today spend `money` accent (from `useTripData` summary.byDay[today]); itinerary items of today (or first day if outside range) sorted by time; next upcoming (first `status==="planned"` with `time >= now`, else first planned) renders expanded card `ring-2 ring-primary` with shortcut buttons row (secondary 40px): "รูปจุดขึ้นรถ" (PhotoViewer of linked transport pickup_photo_ids; hidden if none), "รอบรถ" (opens small sheet listing departure_times chips), "นำทาง" (`window.open(maps_link)`); every card: Checkbox → PATCH `status:"done"`; `MoreHorizontal` button → menu sheet: "ข้าม" (PATCH skipped), "เลื่อนไปวันอื่น" → date chips sheet from `tripDays` → PATCH original `{status:"moved", moved_to_date}` + `apiCreate` clone `{id: uuid, day_date: target, status:"planned", sort_order: 999}` (spec Key Logic history rule); done/skipped cards `opacity-60`.

- [ ] **Step 1:** Implement checklist. **Step 2:** Implement TodayView + wire into dashboard active mode.
- [ ] **Step 3: Verify** — template creates 15 rows; tick persists; move item → original moved + clone on target day; today spend matches expenses.
- [ ] **Step 4: Commit** `git commit -am "feat: checklist with template and today view with move/skip"`

---

### Task 18: Quick expense sheet

**Files:**
- Create: `components/QuickExpenseSheet.tsx`
- Modify: `app/trips/[id]/layout.tsx` (FAB opens it; remove Task 13 toast stub)

**Interfaces:**
- Consumes: MoneyInput, PhotoPicker, Chip, Button, BottomSheet, toast, `apiCreate`, `useTrip`.
- Produces spec screen 8; on save calls layout-provided `onSaved` → `useTripData.reload()` where mounted.

- [ ] **Step 1:** Implement:
```tsx
"use client";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MoneyInput, type MoneyValue } from "@/components/ui/MoneyInput";
import { PhotoPicker } from "@/components/PhotoPicker";
import { toast } from "@/components/ui/Toast";
import { apiCreate } from "@/lib/api";
import type { Trip, Expense, Category } from "@/lib/models/types";

const CATS: { name: Category; color: string }[] = [
  { name: "อาหาร", color: "var(--color-cat-food)" }, { name: "เดินทาง", color: "var(--color-cat-transport)" },
  { name: "ที่พัก", color: "var(--color-cat-lodging)" }, { name: "ช้อป", color: "var(--color-cat-shopping)" },
  { name: "ตั๋ว", color: "var(--color-cat-tickets)" }, { name: "อื่นๆ", color: "var(--color-cat-other)" },
];

export function QuickExpenseSheet({ trip, open, onClose, onSaved }: { trip: Trip; open: boolean; onClose: () => void; onSaved: () => void }) {
  const blank = (): MoneyValue => ({ amount: 0, currency: trip.trip_currency, fx_rate: 0, amount_thb: 0 });
  const [money, setMoney] = useState<MoneyValue>(blank);
  const [category, setCategory] = useState<Category>("อาหาร");
  const [payer, setPayer] = useState("เรา");
  const [description, setDescription] = useState("");
  const [slips, setSlips] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const isTHB = money.currency === "THB";
    const exp: Expense = { id: crypto.randomUUID(), trip_id: trip.id, datetime: new Date().toISOString(),
      category, description, amount: money.amount, currency: money.currency,
      fx_rate: isTHB ? 1 : money.fx_rate, amount_thb: isTHB ? money.amount : money.amount_thb,
      payer, slip_photo_ids: slips };
    try {
      await apiCreate("expenses", exp);
      toast(`บันทึกแล้ว ฿${exp.amount_thb.toLocaleString()}`);
      setMoney(blank()); setDescription(""); setSlips([]);
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="จดค่าใช้จ่าย">
      <div className="flex flex-col gap-4">
        <MoneyInput value={money} onChange={setMoney} tripCurrency={trip.trip_currency} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATS.map((c) => <Chip key={c.name} selected={category === c.name} color={c.color} onClick={() => setCategory(c.name)}>{c.name}</Chip>)}
        </div>
        <div className="flex gap-2">
          {["เรา", "แฟน"].map((p) => <Chip key={p} selected={payer === p} onClick={() => setPayer(p)}>{p}</Chip>)}
        </div>
        <input className="h-11 rounded-2xl border border-muted/30 bg-surface px-4" placeholder="โน๊ตสั้นๆ (ไม่บังคับ)"
          value={description} onChange={(e) => setDescription(e.target.value)} />
        <PhotoPicker tripName={trip.name} kind="slips" fileIds={slips} onChange={setSlips} />
        <Button variant="primary" full loading={saving} onClick={save} disabled={money.amount <= 0}>บันทึก</Button>
      </div>
    </BottomSheet>
  );
}
```
- [ ] **Step 2: Verify** — FAB anywhere in trip → 3200 JPY → ≈฿ line → save → toast; row in `expenses` tab with correct `amount_thb`.
- [ ] **Step 3: Commit** `git commit -am "feat: quick expense capture from FAB"`

---

### Task 19: Expense summary screen

**Files:**
- Create: `lib/donut.ts`, `lib/donut.test.ts`, `components/CategoryDonut.tsx`, `components/ExpenseList.tsx`, `components/ExpenseEditSheet.tsx`
- Modify: `app/trips/[id]/money/page.tsx`

**Interfaces:**
- Consumes: `summarize`, `tripDays`, `useTripData`, category colors (Task 18 `CATS` — export it from `lib/categories.ts` instead; move the const there and import in both).
- Produces: `donutArcs(data: Record<string, number>): { key: string; start: number; end: number; frac: number }[]` (fractions 0..1); spec screen 9.

- [ ] **Step 1: TDD `donutArcs`** — `lib/donut.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { donutArcs } from "./donut";

describe("donutArcs", () => {
  it("fractions cover 0..1 in order", () => {
    const arcs = donutArcs({ a: 25, b: 75 });
    expect(arcs[0]).toEqual({ key: "a", start: 0, end: 0.25, frac: 0.25 });
    expect(arcs[1].end).toBe(1);
  });
  it("empty or zero total → []", () => {
    expect(donutArcs({})).toEqual([]);
    expect(donutArcs({ a: 0 })).toEqual([]);
  });
});
```
Run → FAIL. Implement `lib/donut.ts`:
```ts
export function donutArcs(data: Record<string, number>): { key: string; start: number; end: number; frac: number }[] {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  let acc = 0;
  return Object.entries(data).map(([key, v]) => {
    const start = acc / total; acc += v;
    return { key, start, end: acc / total, frac: v / total };
  });
}
```
Run → PASS.

- [ ] **Step 2: Build screen** —
  - Segmented วันนี้/รายวัน/ทั้งทริป filters expense set (รายวัน adds a day chip row).
  - Total: `motion` count-up display + sub line `จ่ายล่วงหน้า ฿${prepaidTHB.toLocaleString()} · หน้างาน ฿${onsiteTHB.toLocaleString()}` (prepaid/onsite always whole-trip figures from `summarize`; วันนี้/รายวัน views show filtered expense total as the big number).
  - `CategoryDonut`: SVG 200px, `strokeDasharray` circle arcs from `donutArcs(byCategory)` with category colors, center shows total; tap arc → `onSelect(category)` filters list; legend chips below with amounts.
  - Payer split: horizontal stacked bar (`flex` widths by fraction, primary + accent) + per-payer amounts.
  - `ExpenseList`: grouped by day (h2 label from `tripDays`), rows: 10px category color dot + description (fallback category name) + time caption + THB `money` + 40px slip thumb; tap → `ExpenseEditSheet` (same fields as QuickExpenseSheet + delete danger button; PATCH/DELETE then reload).
  - Footer ghost button "เปิดใน Google Sheets" → href `process.env.NEXT_PUBLIC_SHEET_URL` (add to `.env.example`: `NEXT_PUBLIC_SHEET_URL=https://docs.google.com/spreadsheets/d/<id>`).
- [ ] **Step 3: Verify** — totals equal manual spreadsheet sum incl. paid prepaid bookings; donut tap filters; edit + delete work.
- [ ] **Step 4: Commit** `git commit -am "feat: expense summary with donut, payer split, day grouping"`

---

### Task 20: Diary + Quick info

**Files:**
- Create: `components/DiarySection.tsx`, `components/QuickInfoSection.tsx`, `components/QuickInfoFormSheet.tsx`
- Modify: `app/trips/[id]/info/page.tsx`

**Interfaces:**
- Consumes: `tripDays`, PhotoPicker/Viewer, api helpers, `useTrip`, `useTripData` (bookings/transports for auto info rows).
- Produces spec screen 10 — one page, segmented **ข้อมูลด่วน / ไดอารี่**.

- [ ] **Step 1:** Implement:
  - `QuickInfoSection`: auto read-only cards on top derived from data — hotel bookings (vendor + detail + ref_no) and transports having pickup photos (from→to + 96px photo strip); then user rows (pinned first): card label caption + value body; tap card → `navigator.clipboard.writeText(value)` + `toast("คัดลอกแล้ว")`; photo strip 96px horizontal scroll → PhotoViewer; add button → `QuickInfoFormSheet` (label, value textarea, PhotoPicker(photos), pinned Checkbox); edit/delete via long card ⋯ button reusing sheet.
  - `DiarySection`: card per trip day — h2 day label, transparent textarea `placeholder="วันนี้เป็นยังไงบ้าง..."`, debounce 800ms upsert (`notes` row keyed by `date`: none → `apiCreate`, else `apiUpdate`), caption "บันทึกแล้ว ✓" fade in/out after save; PhotoPicker(kind="photos") grid `grid-cols-3 gap-2 rounded-xl` thumbnails → PhotoViewer.
- [ ] **Step 2: Verify** — copy toast (localhost ok), diary text survives reload (one row per day, no duplicates on fast typing), photos land in Drive `photos/`.
- [ ] **Step 3: Commit** `git commit -am "feat: diary and quick info"`

---

### Task 21: Polish + deploy

**Files:**
- Modify: `app/globals.css`, `README.md`

- [ ] **Step 1: Reduced motion** — append to `globals.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 2: Full check** — Run: `npm test` → all pass; `npm run build` → success no type errors; quick mobile-width (375px) pass over every screen for horizontal scroll bugs.

- [ ] **Step 3: E2E walkthrough (dev, real Google)** — per spec Verification: create trip → itinerary 2 days → transport with pickup photo + JPY price → booking + slip → checklist template → toggle active → today view: tick done + move item → quick expense JPY → summary matches spreadsheet → confirm rows/files in Sheets/Drive.

- [ ] **Step 4: Deploy**
```bash
gh repo create travelass --private --source=. --push
```
Vercel: import repo, set every env from `.env.example` (prod values; `AUTH_URL=https://<app>.vercel.app`), deploy. Google Cloud Console: add prod redirect URI `https://<app>.vercel.app/api/auth/callback/google`. Verify on phone: login → create expense → slip photo → summary.

- [ ] **Step 5: Commit + tag** `git commit -am "chore: reduced motion + deploy docs" && git tag v0.1.0`

---

## Self-Review Notes

- **Spec coverage:** 10 screens → Tasks 12-20; data model → Task 2; FX auto+manual rate → Tasks 3, 9, 11; prepaid/onsite rules → Tasks 4, 19; itinerary move-with-history → Task 17; ensureTabs → Tasks 6, 9; allowlist auth → Task 8; slip/photo pipeline → Tasks 7, 10, 11; checklist template → Task 17; Sheets-as-source-of-truth → no long cache anywhere, "เปิดใน Google Sheets" → Task 19.
- **Tab bar has 4 link slots + FAB;** bookings/checklist reached via dashboard shortcuts + `PlanBookSegment` header (Tasks 13, 15, 16) — deliberate deviation noted, spec's 5 destinations preserved functionally.
- **Type consistency:** `MoneyValue` (Task 11) → Tasks 15, 16, 18, 19; `tripDays` (Task 14) → 17, 19, 20; `summarize` (Task 4) → 13, 19; `PlanBookSegment` (Task 15) → 16; `CATS` moved to `lib/categories.ts` in Task 19 — Task 18 defines it inline first, Task 19 extracts (refactor within Task 19 Step 2, update QuickExpenseSheet import).
- **Google API layer** integration-verified (Tasks 9, 10) rather than unit-mocked; unit tests cover pure logic (mappers, fx, summary, days, donut) per TDD preference.
