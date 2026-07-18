"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { uploadLocalToSheets } from "@/lib/force-sync";
import { toast } from "@/components/ui/Toast";

interface UploadContextValue {
  uploading: boolean;
  runUpload: () => Promise<void>;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const [uploading, setUploading] = useState(false);

  const runUpload = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      await uploadLocalToSheets(tripId);
      toast("อัพโหลดข้อมูลขึ้นฐานข้อมูลแล้ว");
    } catch {
      toast("อัพโหลดไม่สำเร็จ ลองอีกครั้ง", "error");
    } finally {
      setUploading(false);
    }
  };

  return <UploadContext.Provider value={{ uploading, runUpload }}>{children}</UploadContext.Provider>;
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within UploadProvider");
  return ctx;
}
