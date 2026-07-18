"use client";
import { isGoogleConfigured } from "@/lib/backend";
import { useUpload } from "@/lib/upload-context";

export function UploadButton() {
  const { uploading, runUpload } = useUpload();
  if (!isGoogleConfigured()) return null;

  return (
    <button
      type="button"
      aria-label="อัพโหลดข้อมูลขึ้นฐานข้อมูล"
      onClick={runUpload}
      disabled={uploading}
      className="relative h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted hover:bg-primary/8 active:scale-90 transition-transform cursor-pointer disabled:opacity-50"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-5" width={20} height={20}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m15 11.25-3-3m0 0-3 3m3-3v7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    </button>
  );
}
