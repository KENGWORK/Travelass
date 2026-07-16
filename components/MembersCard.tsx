"use client";
import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { apiList, apiCreate, apiDelete } from "@/lib/api";
import { optimisticCreate, optimisticDelete } from "@/lib/optimistic";
import { nextMemberColor } from "@/lib/members";
import type { Member } from "@/lib/models/types";

export function MembersCard({ tripId }: { tripId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [adding, setAdding] = useState("");

  const load = () => apiList<Member>("members", tripId).then(setMembers);
  useEffect(() => {
    load();
  }, [tripId]);

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    const newMember: Member = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      name,
      color: nextMemberColor(members.map((m) => m.color)),
    };
    setAdding("");
    optimisticCreate(setMembers, newMember, () => apiCreate<Member>("members", newMember));
    window.dispatchEvent(new Event("members-changed"));
  };

  const remove = (id: string) => {
    optimisticDelete(setMembers, id, () => apiDelete("members", id));
    window.dispatchEvent(new Event("members-changed"));
  };

  return (
    <div className="rounded-2xl bg-surface shadow-card p-4">
      <h2 className="font-heading text-lg font-semibold mb-2">สมาชิก</h2>
      <div className="flex flex-wrap gap-2 mb-3">
        {members.length === 0 && <span className="text-sm text-muted">ยังไม่มีสมาชิก</span>}
        {members.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 h-9 pl-1 pr-1.5 rounded-full bg-bg border border-muted/20"
          >
            <span
              className="w-6 h-6 rounded-full text-white text-xs font-semibold flex items-center justify-center"
              style={{ background: m.color }}
            >
              {m.name.charAt(0)}
            </span>
            <span className="text-sm">{m.name}</span>
            <button
              type="button"
              aria-label={`ลบ ${m.name}`}
              onClick={() => remove(m.id)}
              className="relative w-6 h-6 flex items-center justify-center text-muted cursor-pointer before:absolute before:inset-[-6px] before:content-['']"
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="เพิ่มคน เช่น แฟน, แม่"
          className="field flex-1 h-11 text-sm"
        />
        <button
          type="button"
          onClick={add}
          className="h-11 px-4 rounded-full bg-primary-soft text-primary text-sm font-medium inline-flex items-center gap-1 cursor-pointer shrink-0"
        >
          <UserPlus size={16} />
          เพิ่ม
        </button>
      </div>
    </div>
  );
}
