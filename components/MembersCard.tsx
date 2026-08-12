"use client";
import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { apiList, apiCreate, apiDelete, apiUpdate } from "@/lib/api";
import { optimisticCreate, optimisticDelete, optimisticUpdate } from "@/lib/optimistic";
import { nextMemberColor } from "@/lib/members";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { isValidPromptPayId } from "@/lib/promptpay";
import type { Member, Expense, Booking, Transport } from "@/lib/models/types";

function EditMemberSheet({
  member,
  otherNames,
  onClose,
  onSave,
}: {
  member: Member | null;
  otherNames: string[];
  onClose: () => void;
  onSave: (name: string, promptpayId: string) => void;
}) {
  const [name, setName] = useState("");
  const [promptpayId, setPromptpayId] = useState("");

  useEffect(() => {
    if (member) {
      setName(member.name);
      setPromptpayId(member.promptpay_id);
    }
  }, [member]);

  const trimmed = name.trim();
  const duplicate = otherNames.includes(trimmed);
  const valid = trimmed !== "" && !duplicate;

  return (
    <BottomSheet open={!!member} onClose={onClose} title={member ? `แก้ไข ${member.name}` : ""}>
      <div className="flex flex-col gap-3">
        <FormField label="ชื่อ">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        {duplicate && <p className="text-xs text-danger -mt-2">มีสมาชิกชื่อนี้อยู่แล้ว</p>}
        <FormField label="เลข PromptPay (เบอร์โทร/เลขบัตร ปชช.)">
          <input
            className="field"
            inputMode="numeric"
            placeholder="เช่น 0812345678"
            value={promptpayId}
            onChange={(e) => setPromptpayId(e.target.value)}
          />
        </FormField>
        {promptpayId.trim() !== "" && !isValidPromptPayId(promptpayId) && (
          <p className="text-xs text-warning -mt-2">
            เลขนี้ไม่ครบตามรูปแบบ PromptPay ทั่วไป (เบอร์โทร 10 หลัก / เลขบัตร ปชช. 13 หลัก) เช็คอีกทีก่อนสแกนโอนจริง
          </p>
        )}
        <Button variant="primary" full disabled={!valid} onClick={() => onSave(trimmed, promptpayId.trim())}>
          บันทึก
        </Button>
      </div>
    </BottomSheet>
  );
}

export function MembersCard({ tripId }: { tripId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);

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
      promptpay_id: "",
    };
    setAdding("");
    optimisticCreate(setMembers, newMember, () => apiCreate<Member>("members", newMember));
    window.dispatchEvent(new Event("members-changed"));
  };

  const remove = (id: string) => {
    optimisticDelete(setMembers, id, () => apiDelete("members", id));
    window.dispatchEvent(new Event("members-changed"));
  };

  // Members are matched everywhere else by free-text name (payer, split
  // owner), not an id -- see docs/superpowers/specs/2026-08-05-expense-
  // splitting-design.md. Renaming has to walk every place that name is
  // stored and rewrite it, or the person's expense/split history silently
  // detaches from them (their old debt stops counting toward anyone).
  const renameEverywhere = async (oldName: string, newName: string) => {
    const [expenses, bookings, transports] = await Promise.all([
      apiList<Expense>("expenses", tripId),
      apiList<Booking>("bookings", tripId),
      apiList<Transport>("transports", tripId),
    ]);
    expenses.forEach((e) => {
      const payerMatch = e.payer === oldName;
      const splitMatch = e.splits.some((s) => s.name === oldName);
      if (!payerMatch && !splitMatch) return;
      const updated: Expense = {
        ...e,
        payer: payerMatch ? newName : e.payer,
        splits: e.splits.map((s) => (s.name === oldName ? { ...s, name: newName } : s)),
      };
      void apiUpdate<Expense>("expenses", e.id, updated);
    });
    bookings.forEach((b) => {
      if (b.payer !== oldName) return;
      void apiUpdate<Booking>("bookings", b.id, { ...b, payer: newName });
    });
    transports.forEach((t) => {
      if (t.payer !== oldName) return;
      void apiUpdate<Transport>("transports", t.id, { ...t, payer: newName });
    });
  };

  const saveMember = (name: string, promptpayId: string) => {
    if (!editing) return;
    const oldName = editing.name;
    const patch = { name, promptpay_id: promptpayId };
    optimisticUpdate(setMembers, editing.id, patch, () => apiUpdate<Member>("members", editing.id, { ...editing, ...patch }));
    setEditing(null);
    window.dispatchEvent(new Event("members-changed"));
    if (name !== oldName) {
      void renameEverywhere(oldName, name).then(() => {
        toast(`เปลี่ยนชื่อ "${oldName}" เป็น "${name}" ทุกรายการแล้ว`);
      });
    }
  };

  return (
    <div className="rounded-3xl bg-surface border border-black/[0.04] shadow-card p-5">
      <h2 className="font-heading text-lg font-semibold mb-3">สมาชิก</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        {members.length === 0 && <span className="text-sm text-muted">ยังไม่มีสมาชิก</span>}
        {members.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 h-9 pl-1 pr-1.5 rounded-full bg-bg border border-muted/20"
          >
            <button
              type="button"
              onClick={() => setEditing(m)}
              className="press flex items-center gap-1.5 cursor-pointer"
            >
              <span
                className="w-6 h-6 rounded-full text-white text-xs font-semibold flex items-center justify-center shrink-0"
                style={{ background: m.color }}
              >
                {m.name.charAt(0)}
              </span>
              <span className="text-sm">{m.name}</span>
            </button>
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

      <EditMemberSheet
        member={editing}
        otherNames={members.filter((m) => m.id !== editing?.id).map((m) => m.name)}
        onClose={() => setEditing(null)}
        onSave={saveMember}
      />
    </div>
  );
}
