# Google Sheets + Drive Backend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the deployed TravelAss app a real Google Sheets (data) + Google Drive (photos) backend with NextAuth Google-login allowlist, while keeping the current localStorage-only mode fully working as a zero-config fallback — selected by one env var, not a rewrite.

**Architecture:** Almost all of the server-side plumbing for this already exists in the repo from an earlier attempt (`lib/google/client.ts`, `lib/google/sheets.ts`, `lib/google/drive.ts`, `auth.ts`, `middleware.ts`, and three API routes) but is **completely disconnected** — `lib/api.ts` currently talks straight to `lib/local-db.ts` (browser localStorage) and never calls those routes, and the routes themselves are broken because they import a `lib/store.ts` module that was never created. This plan: (1) creates that missing seam, (2) makes `lib/api.ts` and `PhotoPicker` branch between "local" and "google" backends via one env var instead of hardcoding local-only, (3) adds a photo-URL helper so `<img>` tags work for both a local data-URL and a real Drive file id, (4) adds a one-time refresh-token script and a localStorage→Google migration script, and (5) lists every step only a human can do in Google Cloud Console / Vercel (nothing here can create a Google Cloud project or click an OAuth consent screen for you).

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest + jsdom, `googleapis` (already installed), `google-auth-library` (already installed), `next-auth@5` beta (already installed and already wired in `auth.ts`).

## Global Constraints

- Every new pure-logic module gets a co-located `*.test.ts` file, written and run RED before the implementation (TDD, matching `lib/local-db.test.ts`'s existing style: plain `describe`/`it`/`expect`, no mocking library beyond `vitest`'s own `vi`).
- `npx tsc --noEmit`, `npx vitest run`, and `npm run build` must all stay clean after every task.
- Do not touch `lib/local-db.ts`, `lib/models/mappers.ts`, or any existing entity type in `lib/models/types.ts` — they're already correct and already used by both the local path and the (currently dead) Sheets path.
- Never commit real credentials. `.env.example` documents variable names only; actual values go in `.env.local` (gitignored — confirm it's in `.gitignore` in Task 1) and in Vercel's dashboard.
- Server-only Google client code (`lib/google/*.ts`, `lib/store.ts`) must keep the existing `import "server-only";` guard pattern so it can never be pulled into a client bundle.
- Default behavior for a fresh clone with no env vars set must remain exactly what it is today: local-only mode, no login wall, no Google calls of any kind.

---

## Part A — What already exists (read before starting, don't recreate)

| File | Status | Notes |
|---|---|---|
| `lib/models/mappers.ts` | ✅ done | `ENTITIES.<name>.toRow`/`.fromRow` convert every entity to/from a Sheets row (`string[]`). This is the exact format the Sheets API needs — no new mapping layer required. |
| `lib/google/client.ts` | ✅ done | `getAuth()`/`getSheets()`/`getDrive()` build an OAuth2 client from `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`. |
| `lib/google/sheets.ts` | ✅ done | `ensureTabs`, `listRows`, `appendRow`, `updateRow`, `deleteRow` — full CRUD against `SPREADSHEET_ID`. |
| `lib/google/drive.ts` | ✅ done | `uploadImage(buf, mime, tripName, kind, filename) -> fileId`, `getImageStream(fileId) -> {stream, mime}`. Auto-creates `<tripName>/slips` and `<tripName>/photos` subfolders under `DRIVE_ROOT_FOLDER_ID`. |
| `auth.ts` | ✅ done | NextAuth Google provider, `ALLOWED_EMAILS` allowlist check in the `signIn` callback. |
| `middleware.ts` | ✅ done | Gates every route except `/login`, `/api/auth`, static assets — but only when `SPREADSHEET_ID` is set (its own local `PREVIEW` const). |
| `app/api/resource/[entity]/route.ts` | ❌ broken | Imports `listRows, appendRow, updateRow, deleteRow, ensureTabs, PREVIEW` from `@/lib/store` — **that file doesn't exist.** |
| `app/api/upload/route.ts` | ❌ broken | Imports `saveImage, PREVIEW` from `@/lib/store` — same missing file. |
| `app/api/img/[fileId]/route.ts` | ❌ broken | Imports `loadImage, PREVIEW` from `@/lib/store` — same missing file. |
| `lib/api.ts` | ⚠️ wrong path | Currently imports `lib/local-db.ts` directly. Needs to branch instead of hardcoding local. |
| `components/PhotoPicker.tsx` | ⚠️ wrong path | Currently always calls `fileToDataUrl` (client-side, no network). Needs to branch to a real upload when Google backend is active. |
| `.env.example` | ⚠️ incomplete | Has all the Google/auth vars already; missing the new `NEXT_PUBLIC_BACKEND` toggle (added in Task 9). |

---

### Task 1: `lib/store.ts` — the missing seam

**Files:**
- Create: `lib/store.ts`
- Create: `lib/store.test.ts`
- Modify: none yet (the three API routes already import from this path correctly — they'll just start working)

**Interfaces:**
- Consumes: `ensureTabs, listRows, appendRow, updateRow, deleteRow` from `@/lib/google/sheets`; `uploadImage, getImageStream` from `@/lib/google/drive`; `EntityName` from `@/lib/models/mappers`.
- Produces: `PREVIEW: boolean`, `ensureTabs(): Promise<void>`, `listRows<T>(entity: EntityName, tripId?: string): Promise<T[]>`, `appendRow<T>(entity: EntityName, obj: T): Promise<void>`, `updateRow<T>(entity: EntityName, id: string, obj: T): Promise<void>`, `deleteRow(entity: EntityName, id: string): Promise<void>`, `saveImage(buf: Buffer, mime: string, tripName: string, kind: "slips" | "photos", filename: string): Promise<string>`, `loadImage(fileId: string): Promise<{ body: NodeJS.ReadableStream; mime: string }>`. These exact names/signatures are what the three existing API routes already expect — do not rename anything.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/store.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/google/sheets", () => ({
  ensureTabs: vi.fn().mockResolvedValue(undefined),
  listRows: vi.fn().mockResolvedValue([{ id: "a" }]),
  appendRow: vi.fn().mockResolvedValue(undefined),
  updateRow: vi.fn().mockResolvedValue(undefined),
  deleteRow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/google/drive", () => ({
  uploadImage: vi.fn().mockResolvedValue("drive-file-id-123"),
  getImageStream: vi.fn().mockResolvedValue({ stream: "fake-stream", mime: "image/jpeg" }),
}));

describe("lib/store", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SPREADSHEET_ID;
  });

  it("PREVIEW is true when SPREADSHEET_ID is unset", async () => {
    const { PREVIEW } = await import("./store");
    expect(PREVIEW).toBe(true);
  });

  it("PREVIEW is false when SPREADSHEET_ID is set", async () => {
    process.env.SPREADSHEET_ID = "sheet-123";
    const { PREVIEW } = await import("./store");
    expect(PREVIEW).toBe(false);
  });

  it("listRows delegates to google/sheets.listRows with the same args", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { listRows } = await import("./store");
    const result = await listRows("trips", "t1");
    expect(sheets.listRows).toHaveBeenCalledWith("trips", "t1");
    expect(result).toEqual([{ id: "a" }]);
  });

  it("appendRow delegates to google/sheets.appendRow", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { appendRow } = await import("./store");
    await appendRow("trips", { id: "a" });
    expect(sheets.appendRow).toHaveBeenCalledWith("trips", { id: "a" });
  });

  it("updateRow delegates to google/sheets.updateRow", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { updateRow } = await import("./store");
    await updateRow("trips", "a", { id: "a", name: "x" });
    expect(sheets.updateRow).toHaveBeenCalledWith("trips", "a", { id: "a", name: "x" });
  });

  it("deleteRow delegates to google/sheets.deleteRow", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { deleteRow } = await import("./store");
    await deleteRow("trips", "a");
    expect(sheets.deleteRow).toHaveBeenCalledWith("trips", "a");
  });

  it("ensureTabs delegates to google/sheets.ensureTabs", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { ensureTabs } = await import("./store");
    await ensureTabs();
    expect(sheets.ensureTabs).toHaveBeenCalled();
  });

  it("saveImage delegates to google/drive.uploadImage and returns its fileId", async () => {
    const drive = await import("@/lib/google/drive");
    const { saveImage } = await import("./store");
    const buf = Buffer.from("fake");
    const id = await saveImage(buf, "image/jpeg", "Tokyo Trip", "slips", "receipt.jpg");
    expect(drive.uploadImage).toHaveBeenCalledWith(buf, "image/jpeg", "Tokyo Trip", "slips", "receipt.jpg");
    expect(id).toBe("drive-file-id-123");
  });

  it("loadImage delegates to google/drive.getImageStream and returns {body, mime}", async () => {
    const drive = await import("@/lib/google/drive");
    const { loadImage } = await import("./store");
    const result = await loadImage("drive-file-id-123");
    expect(drive.getImageStream).toHaveBeenCalledWith("drive-file-id-123");
    expect(result).toEqual({ body: "fake-stream", mime: "image/jpeg" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL with `Cannot find module './store'` (or similar — the file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/store.ts
import "server-only";

import * as sheets from "@/lib/google/sheets";
import * as drive from "@/lib/google/drive";
import type { EntityName } from "@/lib/models/mappers";

// Local-only mode (no Google credentials configured) is the default for a
// fresh clone/deploy. Setting SPREADSHEET_ID switches these server routes
// live and re-enables the NextAuth login wall in middleware.ts.
export const PREVIEW = !process.env.SPREADSHEET_ID;

export const ensureTabs = (): Promise<void> => sheets.ensureTabs();

export const listRows = <T,>(entity: EntityName, tripId?: string): Promise<T[]> =>
  sheets.listRows<T>(entity, tripId);

export const appendRow = <T,>(entity: EntityName, obj: T): Promise<void> =>
  sheets.appendRow<T>(entity, obj);

export const updateRow = <T,>(entity: EntityName, id: string, obj: T): Promise<void> =>
  sheets.updateRow<T>(entity, id, obj);

export const deleteRow = (entity: EntityName, id: string): Promise<void> =>
  sheets.deleteRow(entity, id);

export const saveImage = (
  buf: Buffer,
  mime: string,
  tripName: string,
  kind: "slips" | "photos",
  filename: string
): Promise<string> => drive.uploadImage(buf, mime, tripName, kind, filename);

export const loadImage = async (
  fileId: string
): Promise<{ body: NodeJS.ReadableStream; mime: string }> => {
  const { stream, mime } = await drive.getImageStream(fileId);
  return { body: stream, mime };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Verify the three API routes now type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/api/resource/[entity]/route.ts`, `app/api/upload/route.ts`, or `app/api/img/[fileId]/route.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: add lib/store.ts seam connecting API routes to Google Sheets/Drive"
```

---

### Task 2: `lib/photo-url.ts` — one helper for both storage modes

**Files:**
- Create: `lib/photo-url.ts`
- Create: `lib/photo-url.test.ts`
- Modify: `components/PhotoPicker.tsx:70` (the `<img src={id} .../>` in the thumbnail list), `components/PhotoViewer.tsx`, `components/QuickInfoSection.tsx:25`, `components/TransportCard.tsx:116`, `components/BookingCard.tsx:61`

**Interfaces:**
- Produces: `photoUrl(id: string): string` — pure function, no env/backend awareness needed. A local-mode id is always a `data:` URL (render as-is); a Google-mode id is always an opaque Drive file id (route it through `/api/img/<id>`). The function tells the two apart by shape, not by reading any config — this is what lets one call site work correctly regardless of which backend produced the id.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/photo-url.test.ts
import { describe, it, expect } from "vitest";
import { photoUrl } from "./photo-url";

describe("photoUrl", () => {
  it("returns a data: URL unchanged", () => {
    const url = "data:image/jpeg;base64,AAAA";
    expect(photoUrl(url)).toBe(url);
  });

  it("routes an opaque Drive file id through /api/img/", () => {
    expect(photoUrl("1a2b3c4d5e")).toBe("/api/img/1a2b3c4d5e");
  });

  it("URL-encodes the id when building the /api/img/ path", () => {
    expect(photoUrl("weird id/with slash")).toBe("/api/img/weird%20id%2Fwith%20slash");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/photo-url.test.ts`
Expected: FAIL with `Cannot find module './photo-url'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/photo-url.ts
// A photo id is either a local data: URL (client-side MVP mode) or an
// opaque Google Drive file id (Google-backend mode). Callers never need to
// know which — this picks the right rendering strategy from the id's shape.
export function photoUrl(id: string): string {
  if (id.startsWith("data:")) return id;
  return `/api/img/${encodeURIComponent(id)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/photo-url.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into every image render site**

In `components/PhotoPicker.tsx`, change:
```tsx
<img
  src={id}
  alt=""
  className="w-14 h-14 rounded-xl object-cover cursor-pointer"
  onClick={() => setViewerIndex(i)}
/>
```
to:
```tsx
<img
  src={photoUrl(id)}
  alt=""
  className="w-14 h-14 rounded-xl object-cover cursor-pointer"
  onClick={() => setViewerIndex(i)}
/>
```
and add `import { photoUrl } from "@/lib/photo-url";` to its import block.

Apply the same `src={id}` → `src={photoUrl(id)}` change (plus the import) in:
- `components/PhotoViewer.tsx` (wherever it renders the full-size `<img>`)
- `components/QuickInfoSection.tsx:25`
- `components/TransportCard.tsx:116` (`transport.pickup_photo_ids[0]` → `photoUrl(transport.pickup_photo_ids[0])`)
- `components/BookingCard.tsx:61`

- [ ] **Step 6: Run the full test suite and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/photo-url.ts lib/photo-url.test.ts components/PhotoPicker.tsx components/PhotoViewer.tsx components/QuickInfoSection.tsx components/TransportCard.tsx components/BookingCard.tsx
git commit -m "feat: add photoUrl helper so image rendering works for both local and Google-Drive-backed photo ids"
```

---

### Task 3: `lib/backend.ts` — the local/google mode switch

**Files:**
- Create: `lib/backend.ts`
- Create: `lib/backend.test.ts`

**Interfaces:**
- Produces: `isGoogleBackend(): boolean` — reads `process.env.NEXT_PUBLIC_BACKEND`. `true` when its value is exactly `"google"`; `false` for anything else (unset, `"local"`, typos — fails safe to local mode). Must be readable from client components (hence the `NEXT_PUBLIC_` prefix — Next.js inlines these at build time).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/backend.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isGoogleBackend } from "./backend";

describe("isGoogleBackend", () => {
  const original = process.env.NEXT_PUBLIC_BACKEND;
  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND = original;
  });

  it("is false when NEXT_PUBLIC_BACKEND is unset", () => {
    delete process.env.NEXT_PUBLIC_BACKEND;
    expect(isGoogleBackend()).toBe(false);
  });

  it("is false when NEXT_PUBLIC_BACKEND is \"local\"", () => {
    process.env.NEXT_PUBLIC_BACKEND = "local";
    expect(isGoogleBackend()).toBe(false);
  });

  it("is true when NEXT_PUBLIC_BACKEND is \"google\"", () => {
    process.env.NEXT_PUBLIC_BACKEND = "google";
    expect(isGoogleBackend()).toBe(true);
  });

  it("is false for an unrecognized value (fails safe to local)", () => {
    process.env.NEXT_PUBLIC_BACKEND = "sheets-please";
    expect(isGoogleBackend()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/backend.test.ts`
Expected: FAIL with `Cannot find module './backend'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/backend.ts
// Single switch between the two storage modes. NEXT_PUBLIC_ so client
// components (lib/api.ts, PhotoPicker) can read it directly without a
// server round-trip. Unset or unrecognized -> local (fail safe).
export function isGoogleBackend(): boolean {
  return process.env.NEXT_PUBLIC_BACKEND === "google";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/backend.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/backend.ts lib/backend.test.ts
git commit -m "feat: add isGoogleBackend() env switch between local and Google storage modes"
```

---

### Task 4: `lib/api.ts` — dual-mode CRUD

**Files:**
- Modify: `lib/api.ts` (full rewrite of the body, same exported signatures)
- Create: `lib/resource-url.ts`
- Create: `lib/resource-url.test.ts`

**Interfaces:**
- Consumes: `isGoogleBackend` from `@/lib/backend`; `dbList, dbCreate, dbUpdate, dbDelete` from `@/lib/local-db` (unchanged); `EntityName` from `@/lib/models/mappers`.
- Produces (pure, testable): `resourceListUrl(entity: EntityName, tripId?: string): string`, `resourceItemUrl(entity: EntityName, id: string): string`. Produces (unchanged public signatures, now dual-mode): `apiList, apiCreate, apiUpdate, apiDelete, apiRate` — every existing call site in the app keeps working with zero changes.

- [ ] **Step 1: Write the failing test for the URL builders**

```typescript
// lib/resource-url.test.ts
import { describe, it, expect } from "vitest";
import { resourceListUrl, resourceItemUrl } from "./resource-url";

describe("resource-url", () => {
  it("resourceListUrl with no tripId", () => {
    expect(resourceListUrl("trips")).toBe("/api/resource/trips");
  });

  it("resourceListUrl with a tripId appends the query param", () => {
    expect(resourceListUrl("expenses", "t1")).toBe("/api/resource/expenses?trip_id=t1");
  });

  it("resourceItemUrl appends the id as a query param", () => {
    expect(resourceItemUrl("trips", "abc123")).toBe("/api/resource/trips?id=abc123");
  });

  it("resourceItemUrl URL-encodes the id", () => {
    expect(resourceItemUrl("trips", "a b/c")).toBe("/api/resource/trips?id=a%20b%2Fc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/resource-url.test.ts`
Expected: FAIL with `Cannot find module './resource-url'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/resource-url.ts
import type { EntityName } from "@/lib/models/mappers";

export function resourceListUrl(entity: EntityName, tripId?: string): string {
  const base = `/api/resource/${entity}`;
  return tripId ? `${base}?trip_id=${encodeURIComponent(tripId)}` : base;
}

export function resourceItemUrl(entity: EntityName, id: string): string {
  return `/api/resource/${entity}?id=${encodeURIComponent(id)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/resource-url.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Rewrite `lib/api.ts` to branch on `isGoogleBackend()`**

```typescript
// lib/api.ts
import type { EntityName } from "@/lib/models/mappers";
import { dbList, dbCreate, dbUpdate, dbDelete, type Row } from "@/lib/local-db";
import { isGoogleBackend } from "@/lib/backend";
import { resourceListUrl, resourceItemUrl } from "@/lib/resource-url";

// Two storage modes behind one interface, selected by NEXT_PUBLIC_BACKEND
// (see lib/backend.ts). "local" (default) talks to localStorage via
// lib/local-db.ts synchronously, wrapped in a resolved Promise so callers
// stay unchanged either way. "google" talks to the Sheets-backed API routes
// under app/api/resource/[entity]/route.ts.
async function jsonOrThrow(res: Response) {
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const apiList = <T,>(entity: EntityName, tripId?: string): Promise<T[]> => {
  if (isGoogleBackend()) {
    return fetch(resourceListUrl(entity, tripId)).then(jsonOrThrow);
  }
  return Promise.resolve(dbList(entity, tripId) as T[]);
};

export const apiCreate = <T,>(entity: EntityName, obj: T): Promise<{ ok: true }> => {
  if (isGoogleBackend()) {
    return fetch(resourceListUrl(entity), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj),
    }).then(jsonOrThrow);
  }
  dbCreate(entity, obj as Row);
  return Promise.resolve({ ok: true });
};

export const apiUpdate = <T,>(entity: EntityName, id: string, obj: T): Promise<{ ok: true }> => {
  if (isGoogleBackend()) {
    return fetch(resourceItemUrl(entity, id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj),
    }).then(jsonOrThrow);
  }
  dbUpdate(entity, id, obj as Partial<Row>);
  return Promise.resolve({ ok: true });
};

export const apiDelete = (entity: EntityName, id: string): Promise<{ ok: true }> => {
  if (isGoogleBackend()) {
    return fetch(resourceItemUrl(entity, id), { method: "DELETE" }).then(jsonOrThrow);
  }
  dbDelete(entity, id);
  return Promise.resolve({ ok: true });
};

// FX always uses the server route (external rate API, no storage backend involved).
export const apiRate = async (from: string): Promise<{ rate: number }> => {
  const res = await fetch(`/api/fx?from=${from}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
};
```

- [ ] **Step 6: Run the full suite and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS (existing `lib/local-db.test.ts` and everything else untouched), no type errors.

- [ ] **Step 7: Manual smoke test in local mode (default, no env changes)**

Run: `npm run dev`, open the app, create a trip, add an expense. Confirm it still works exactly as before — `NEXT_PUBLIC_BACKEND` is unset, so `isGoogleBackend()` is `false` and every call still goes to `lib/local-db.ts`. This step has no automated assertion; it's a manual regression check that the branch didn't break the default path.

- [ ] **Step 8: Commit**

```bash
git add lib/api.ts lib/resource-url.ts lib/resource-url.test.ts
git commit -m "feat: make lib/api.ts branch between local and Google-backed storage via NEXT_PUBLIC_BACKEND"
```

---

### Task 5: `PhotoPicker` — dual-mode photo upload

**Files:**
- Modify: `components/PhotoPicker.tsx`

**Interfaces:**
- Consumes: `isGoogleBackend` from `@/lib/backend`; `fileToDataUrl` from `@/lib/image` (unchanged, local-mode path); `photoUrl` from `@/lib/photo-url` (Task 2).
- Produces: same `PhotoPickerProps` interface as today (`tripName`, `kind`, `fileIds`, `onChange`) — callers (`TransportFormSheet`, `BookingFormSheet`, etc.) need zero changes.

- [ ] **Step 1: Modify `handleFiles` to branch on backend mode**

Replace the body of `components/PhotoPicker.tsx` with:

```tsx
"use client";
import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { PhotoViewer } from "@/components/PhotoViewer";
import { toast } from "@/components/ui/Toast";
import { fileToDataUrl } from "@/lib/image";
import { photoUrl } from "@/lib/photo-url";
import { isGoogleBackend } from "@/lib/backend";

export interface PhotoPickerProps {
  tripName: string;
  kind: "photos" | "slips";
  fileIds: string[];
  onChange: (fileIds: string[]) => void;
}

async function uploadToGoogle(file: File, tripName: string, kind: "photos" | "slips"): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("tripName", tripName);
  form.append("kind", kind);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  const { fileId } = await res.json();
  return fileId as string;
}

export function PhotoPicker({ tripName, kind, fileIds, onChange }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploadingCount((n) => n + list.length);
    const accumulated = [...fileIds];
    for (const file of list) {
      try {
        const id = isGoogleBackend()
          ? await uploadToGoogle(file, tripName, kind)
          : await fileToDataUrl(file);
        accumulated.push(id);
        onChange([...accumulated]);
      } catch {
        toast(isGoogleBackend() ? "อัปโหลดรูปไม่สำเร็จ" : "อ่านรูปไม่สำเร็จ");
      } finally {
        setUploadingCount((n) => Math.max(0, n - 1));
      }
    }
  };

  const remove = (id: string) => {
    onChange(fileIds.filter((f) => f !== id));
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        aria-label="ถ่ายรูปหรือเลือกรูป"
        onClick={() => inputRef.current?.click()}
        className="h-14 w-14 rounded-xl border-2 border-dashed border-muted/30 flex items-center justify-center cursor-pointer text-muted"
      >
        <Camera size={24} />
      </button>

      {fileIds.map((id, i) => (
        <div key={id} className="relative h-14 w-14">
          <img
            src={photoUrl(id)}
            alt=""
            className="w-14 h-14 rounded-xl object-cover cursor-pointer"
            onClick={() => setViewerIndex(i)}
          />
          <button
            type="button"
            aria-label="ลบรูป"
            onClick={() => remove(id)}
            className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-danger text-white flex items-center justify-center cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {Array.from({ length: uploadingCount }).map((_, i) => (
        <Skeleton key={`uploading-${i}`} className="h-14 w-14" />
      ))}

      {viewerIndex !== null && (
        <PhotoViewer fileIds={fileIds} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  );
}
```

Note `tripName`/`kind` are back in the destructured props (they were kept-but-unused placeholders before; now `uploadToGoogle` actually needs them).

- [ ] **Step 2: Run the full suite and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors (no test file changes needed here — this component has no existing test file and the logic worth unit-testing already lives in `photoUrl`/`isGoogleBackend`, which are covered).

- [ ] **Step 3: Manual smoke test in local mode**

Run: `npm run dev`, add a photo to a transport leg. Confirm it still renders instantly as a data URL (unchanged behavior — `isGoogleBackend()` is false by default).

- [ ] **Step 4: Commit**

```bash
git add components/PhotoPicker.tsx
git commit -m "feat: PhotoPicker uploads to Google Drive via /api/upload when NEXT_PUBLIC_BACKEND=google"
```

---

### Task 6: `middleware.ts` — single source of truth for PREVIEW

**Files:**
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: `PREVIEW` from `@/lib/store` (Task 1) instead of recomputing `!process.env.SPREADSHEET_ID` locally.

- [ ] **Step 1: Replace the local PREVIEW computation**

```typescript
// middleware.ts
import { auth } from "@/auth";
import { PREVIEW } from "@/lib/store";

export const middleware = PREVIEW ? () => undefined : auth;
export const config = { matcher: ["/((?!login|api/auth|_next|favicon.ico).*)"] };
```

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`lib/store.ts` has `import "server-only"` — confirm middleware, which runs in the Edge runtime, can still import it. If `tsc`/`next build` in Task 8 flags an edge-runtime incompatibility here, keep the inline `!process.env.SPREADSHEET_ID` in `middleware.ts` instead and leave `lib/store.ts`'s `PREVIEW` as the copy used by the three API routes only — note this as a deliberate deviation if it happens, don't fight the runtime.)

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "refactor: middleware reads PREVIEW from lib/store instead of duplicating the check"
```

---

### Task 7: One-time refresh-token script (human runs this once)

**Files:**
- Create: `scripts/get-refresh-token.mjs`
- Create: `lib/oauth-url.ts`
- Create: `lib/oauth-url.test.ts`

**Interfaces:**
- Produces (pure, testable): `buildAuthUrl(clientId: string, redirectUri: string): string` — the only piece of this task with real logic; the rest of the script is an interactive CLI wrapper.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/oauth-url.test.ts
import { describe, it, expect } from "vitest";
import { buildAuthUrl } from "./oauth-url";

describe("buildAuthUrl", () => {
  it("builds a Google OAuth consent URL with the Sheets+Drive scopes", () => {
    const url = buildAuthUrl("client-123", "http://localhost:3000/oauth-callback");
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("client_id")).toBe("client-123");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3000/oauth-callback");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/oauth-url.test.ts`
Expected: FAIL with `Cannot find module './oauth-url'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/oauth-url.ts
// access_type=offline + prompt=consent are both required to get a refresh
// token back on the first exchange (Google otherwise only returns one the
// very first time an app is ever authorized, which is easy to lose).
export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/oauth-url.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Write the interactive CLI script**

```javascript
// scripts/get-refresh-token.mjs
// One-time script: run this yourself after creating the OAuth client in
// Google Cloud Console (Task list in the plan's Part B). Prints a URL to
// open, then exchanges the code you paste back for a refresh token.
//
// Usage: node scripts/get-refresh-token.mjs <client_id> <client_secret>

import { google } from "googleapis";
import readline from "node:readline/promises";

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error("Usage: node scripts/get-refresh-token.mjs <client_id> <client_secret>");
  process.exit(1);
}

const REDIRECT_URI = "http://localhost:3000/oauth-callback";
const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

console.log("\n1. Open this URL in a browser signed into the Google account you want the app to use:\n");
console.log(authUrl);
console.log("\n2. After approving, you'll land on a page that fails to load (that's expected —");
console.log("   nothing is listening on localhost:3000 right now). Copy the \"code\" value out of");
console.log("   that browser's address bar (the part after code= and before &scope=).\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const code = await rl.question("Paste the code here: ");
rl.close();

const { tokens } = await oauth2Client.getToken(code.trim());
if (!tokens.refresh_token) {
  console.error("\nNo refresh_token in the response. This usually means the Google account already");
  console.error("authorized this OAuth client before. Go to https://myaccount.google.com/permissions,");
  console.error("remove this app's access, and run this script again.");
  process.exit(1);
}

console.log("\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
console.log("\nAdd that line to .env.local (and to the same variable in Vercel's project settings).");
```

- [ ] **Step 6: Run the full suite and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS. (`scripts/*.mjs` isn't in the vitest `include` glob and isn't type-checked by `tsc` either since it's plain JS — that's fine, it's a one-off interactive tool, not app code.)

- [ ] **Step 7: Commit**

```bash
git add lib/oauth-url.ts lib/oauth-url.test.ts scripts/get-refresh-token.mjs
git commit -m "feat: add one-time refresh-token script for Google OAuth setup"
```

---

### Task 8: localStorage → Google migration script

**Files:**
- Create: `lib/data-url.ts`
- Create: `lib/data-url.test.ts`
- Create: `scripts/migrate-localstorage-to-google.mjs`

**Interfaces:**
- Produces (pure, testable): `isDataUrl(value: string): boolean`, `decodeDataUrl(value: string): { buf: Buffer; mime: string }`.
- Consumes (in the script only, not unit-tested): `ENTITIES` from `@/lib/models/mappers`; `ensureTabs, appendRow, saveImage` from `@/lib/store`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/data-url.test.ts
import { describe, it, expect } from "vitest";
import { isDataUrl, decodeDataUrl } from "./data-url";

describe("data-url", () => {
  it("isDataUrl is true for a data: URL", () => {
    expect(isDataUrl("data:image/jpeg;base64,AAAA")).toBe(true);
  });

  it("isDataUrl is false for a plain Drive file id", () => {
    expect(isDataUrl("1a2b3c4d")).toBe(false);
  });

  it("decodeDataUrl extracts the mime type and decodes the base64 payload", () => {
    const original = Buffer.from("hello world");
    const b64 = original.toString("base64");
    const { buf, mime } = decodeDataUrl(`data:image/png;base64,${b64}`);
    expect(mime).toBe("image/png");
    expect(buf.toString()).toBe("hello world");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/data-url.test.ts`
Expected: FAIL with `Cannot find module './data-url'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/data-url.ts
export function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

export function decodeDataUrl(value: string): { buf: Buffer; mime: string } {
  const match = value.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) throw new Error("not a base64 data URL");
  const [, mime, b64] = match;
  return { buf: Buffer.from(b64, "base64"), mime };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/data-url.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the migration script**

```javascript
// scripts/migrate-localstorage-to-google.mjs
// One-time script. Run this AFTER Google Sheets/Drive env vars are set and
// the app has been redeployed with NEXT_PUBLIC_BACKEND=google.
//
// 1. In the OLD (local-mode) deployed app, open devtools console and run:
//      copy(localStorage.getItem("travelass:db"))
//    Paste the result into a file, e.g. old-data.json.
// 2. Run: npx tsx --env-file=.env.local --conditions=react-server scripts/migrate-localstorage-to-google.mjs old-data.json
//
// This uses the same lib/store.ts (and therefore the same env vars) the
// running app uses, so run it with the exact same .env.local the deployed
// app has. Unlike Next.js (which auto-loads .env.local), this script runs
// under bare `tsx`, which does NOT auto-load it — hence the explicit
// `--env-file=.env.local` flag above.

import { readFileSync } from "node:fs";
import { ENTITIES } from "../lib/models/mappers.ts";
import { ensureTabs, appendRow, saveImage } from "../lib/store.ts";
import { isDataUrl, decodeDataUrl } from "../lib/data-url.ts";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npx tsx --env-file=.env.local --conditions=react-server scripts/migrate-localstorage-to-google.mjs <exported-localstorage.json>");
  process.exit(1);
}

const db = JSON.parse(readFileSync(path, "utf8"));

await ensureTabs();

// Every entity that can carry photo_ids/slip_photo_ids/pickup_photo_ids gets
// those arrays' data: URLs uploaded to Drive first, then the row is written
// to Sheets with the real Drive file ids in their place.
const PHOTO_FIELDS = ["photo_ids", "slip_photo_ids", "pickup_photo_ids"];

async function migrateRow(entity, row) {
  const patched = { ...row };
  for (const field of PHOTO_FIELDS) {
    if (!Array.isArray(patched[field])) continue;
    const uploaded = [];
    for (const value of patched[field]) {
      if (!isDataUrl(value)) {
        uploaded.push(value); // already a real id (re-running the script) — leave it
        continue;
      }
      const { buf, mime } = decodeDataUrl(value);
      const tripName = db.trips?.find((t) => t.id === row.trip_id)?.name ?? "trip";
      const kind = field === "slip_photo_ids" ? "slips" : "photos";
      const fileId = await saveImage(buf, mime, tripName, kind, `${row.id}-${uploaded.length}.jpg`);
      uploaded.push(fileId);
    }
    patched[field] = uploaded;
  }
  await appendRow(entity, patched);
}

for (const entity of Object.keys(ENTITIES)) {
  const rows = db[entity] ?? [];
  console.log(`Migrating ${entity}: ${rows.length} row(s)`);
  for (const row of rows) {
    await migrateRow(entity, row);
  }
}

console.log("\nDone. Check the Sheet and Drive folder, then verify the app in Google mode before");
console.log("wiping the old localStorage-only deployment's data.");
```

- [ ] **Step 6: Run the full suite and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/data-url.ts lib/data-url.test.ts scripts/migrate-localstorage-to-google.mjs
git commit -m "feat: add one-time localStorage-to-Google migration script"
```

---

### Task 9: `.env.example` — document the new toggle

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the backend toggle**

Add this line (with the rest of the existing vars left exactly as they are):

```
NEXT_PUBLIC_BACKEND=local
```

Add a comment above the Google-related block clarifying the two-mode relationship:

```
# Set NEXT_PUBLIC_BACKEND=google (and fill in every var below) to switch
# from local-only (localStorage, no login, default) to a real Google
# Sheets + Drive backend with NextAuth login. See docs/superpowers/plans/
# 2026-07-14-google-backend-migration.md Part B for the full setup checklist.
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document NEXT_PUBLIC_BACKEND toggle in .env.example"
```

---

## Part B — Steps only a human can do (Google Cloud Console / Vercel)

Nothing in Part A can execute any of these — they require clicking through Google's and Vercel's own dashboards with real account credentials.

- [ ] **1. Create a Google Cloud project** at https://console.cloud.google.com/projectcreate (or reuse an existing personal one).
- [ ] **2. Enable two APIs** for that project: **Google Sheets API** and **Google Drive API** (Console → APIs & Services → Library → search each → Enable).
- [ ] **3. Configure the OAuth consent screen** (APIs & Services → OAuth consent screen): User type **External**. Decision made: **publish to Production** rather than staying in Testing, since it's used by one person/family. Note this means Google's verification review applies to the sensitive `spreadsheets`/`drive` scopes this app requests — expect to provide a privacy policy URL and possibly wait on review before the consent screen fully works for a non-test-user account. If this stalls, switching back to Testing + adding your own account as a **Test user** is the fast, review-free fallback (no functional difference for a single owner-operated app).
- [ ] **4. Create an OAuth 2.0 Client ID** (APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application). Add this authorized redirect URI:
  - `http://localhost:3000/oauth-callback` (used once, by `scripts/get-refresh-token.mjs`)
  Copy the resulting **Client ID** and **Client Secret**. (No NextAuth callback URI needed — login is intentionally disabled, see step 9.)
- [ ] **5. Get a refresh token**: with the repo checked out locally and dependencies installed, run `node scripts/get-refresh-token.mjs <client_id> <client_secret>` (Task 7) and follow its prompts. Save the printed `GOOGLE_REFRESH_TOKEN`.
- [ ] **6. Create the actual spreadsheet**: go to https://sheets.google.com, create a new blank spreadsheet, name it (e.g. "TravelAss data"), copy its ID out of the URL (`https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`) into `SPREADSHEET_ID`. You do **not** need to create any tabs by hand — `ensureTabs()` (already implemented, Task 1 wires it up) creates every entity's tab and header row automatically the first time the app calls it.
- [ ] **7. Create a Drive folder**: go to https://drive.google.com, create a folder (e.g. "TravelAss photos"), open it, copy its ID out of the URL into `DRIVE_ROOT_FOLDER_ID`. Both the spreadsheet and this folder must be owned by (or at least fully editable by) the same Google account whose refresh token you generated in step 5 — the server always acts as that one account.
- [ ] **8. Set every env var** — locally in `.env.local` for testing, and in the Vercel project (Settings → Environment Variables) for the real deploy: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `SPREADSHEET_ID`, `DRIVE_ROOT_FOLDER_ID`, `NEXT_PUBLIC_BACKEND=google`. (`ALLOWED_EMAILS`/`AUTH_SECRET`/`AUTH_URL` are not needed — the app has no login wall by design, see the decision below.)
- [ ] **9. Redeploy** (Vercel redeploys automatically on env var changes if "Redeploy" is confirmed, or push any commit).
- [ ] **10. If migrating existing data**: on the OLD deployment (still local-mode), open devtools console, run `copy(localStorage.getItem("travelass:db"))`, paste into a local file. After the NEW (Google-mode) deployment is live, run `npx tsx --env-file=.env.local --conditions=react-server scripts/migrate-localstorage-to-google.mjs <that-file>` (Task 8) with the same `.env.local` the deployed app uses.
- [ ] **11. Manual end-to-end verification on the live Google-mode deployment**: visit the site (no login prompt, by design) → create a trip → add an expense with a photo → confirm the row appears in the Google Sheet and the photo appears in the Drive folder → refresh the page → data persists (proves it's really reading from Sheets, not a cached client state).

**Decision: no login wall.** Originally planned as NextAuth + Google-login allowlist (`auth.ts`, `middleware.ts`). User decided against this — the app is used by one person/family and login was an unwanted friction point carried over from the very first version of the app (which explicitly removed the login requirement). `middleware.ts` is now an unconditional no-op regardless of backend mode; the three API routes' auth guards were removed the same way. `auth.ts`, `app/login/`, and the `ALLOWED_EMAILS`/`AUTH_SECRET`/`AUTH_URL` env vars are unused leftovers, kept only in case login is wanted again later — not required for Google mode to work.

---

## Self-Review

**Spec coverage:**
- Sheets-backed CRUD for every entity → Task 1 (`lib/store.ts` wires the already-complete `lib/google/sheets.ts` into the already-existing, previously-broken API routes).
- Drive-backed photo storage → Task 1 (`saveImage`/`loadImage`) + Task 2 (`photoUrl` render helper) + Task 5 (`PhotoPicker` upload path).
- ~~NextAuth Google login with allowlist~~ → superseded post-plan: user decided against any login wall (see Part B decision note). `auth.ts` is now unused; `middleware.ts` and the three API routes no longer call it.
- Keep localStorage mode working with zero config → Task 3 (`isGoogleBackend()` fails safe to `false`) + Task 4 (branches, doesn't replace) + Task 5 (branches, doesn't replace).
- Human-only setup steps clearly separated from code → Part B, none of which any Task in Part A performs.
- One-time refresh token acquisition → Task 7.
- Migrating already-entered localStorage data → Task 8.
- TDD on every new pure-logic piece → Tasks 1, 2, 3, 4, 7, 8 each start with a failing test.

**Placeholder scan:** no "TBD"/"handle errors appropriately"/"similar to Task N" — every step has complete, runnable code or an exact command.

**Type consistency:** `PREVIEW`, `ensureTabs`, `listRows`, `appendRow`, `updateRow`, `deleteRow`, `saveImage`, `loadImage` in Task 1 match the exact names the three pre-existing API routes already import. `isGoogleBackend` (Task 3) is the single name used identically in Task 4 and Task 5. `photoUrl` (Task 2) is the single name used identically in Task 5 and all five render-site edits.
