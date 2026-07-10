This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Setup (ครั้งเดียว)
1. Google Cloud Console → สร้าง project → enable **Google Sheets API** + **Google Drive API**
2. OAuth consent screen → External → เพิ่มอีเมลตัวเองเป็น test user
3. Credentials → Create OAuth client ID → **Web application** → redirect URIs:
   `http://localhost:8123/callback` และ `http://localhost:3000/api/auth/callback/google` และ `https://<app>.vercel.app/api/auth/callback/google`
4. `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-refresh-token.mjs` → login ด้วยบัญชีเจ้าของ → copy `GOOGLE_REFRESH_TOKEN`
5. สร้าง Google Spreadsheet เปล่า 1 ไฟล์ + โฟลเดอร์ Drive 1 โฟลเดอร์ → เอา id จาก URL ใส่ `SPREADSHEET_ID`, `DRIVE_ROOT_FOLDER_ID`
6. เติม `.env.local` ตาม `.env.example` (`AUTH_SECRET`: `npx auth secret`)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
