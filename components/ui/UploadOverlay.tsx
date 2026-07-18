"use client";

// From Uiverse.io by milley69 — shown full-screen while uploadLocalToSheets
// runs, since it can touch every entity for the trip and take a few seconds.
export function UploadOverlay({ open }: { open: boolean }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
      <div className="loading">
        <svg width="120" height="60" viewBox="0 0 150 60" xmlns="http://www.w3.org/2000/svg">
          <polyline id="back" points="0,30 35,30 45,10 55,50 65,10 75,50 85,30 150,30" />
          <polyline id="front" points="0,30 35,30 45,10 55,50 65,10 75,50 85,30 150,30" />
        </svg>
      </div>
      <p className="text-sm text-muted">กำลังอัพโหลดข้อมูลขึ้นฐานข้อมูล...</p>
    </div>
  );
}
