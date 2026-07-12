"use client";
import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { PhotoViewer } from "@/components/PhotoViewer";
import { toast } from "@/components/ui/Toast";
import { fileToDataUrl } from "@/lib/image";

export interface PhotoPickerProps {
  // tripName/kind are kept for interface compatibility; images are stored inline
  // as data URLs in localStorage, so no server folder routing is needed.
  tripName: string;
  kind: "photos" | "slips";
  fileIds: string[];
  onChange: (fileIds: string[]) => void;
}

export function PhotoPicker({ fileIds, onChange }: PhotoPickerProps) {
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
        const url = await fileToDataUrl(file);
        accumulated.push(url);
        onChange([...accumulated]);
      } catch {
        toast("อ่านรูปไม่สำเร็จ");
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
            src={id}
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
