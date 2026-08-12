"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { apiUpdate } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PayLineSheet } from "@/components/PayLineSheet";
import { dayColor } from "@/lib/day-color";
import { netBalances, simplifyDebts, expensesBetween, applyPayment, splitsSharingSlip, type SettlementLine } from "@/lib/settle";
import { photoUrl } from "@/lib/photo-url";
import type { Expense, Member } from "@/lib/models/types";

function fmtDate(datetime: string): string {
  return new Date(datetime).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Whole-trip, never date-scoped — debt isn't a per-day concept. Only expenses
// with splits touch this at all (see lib/settle.ts); an empty result means
// no expense has been marked split yet, not that everyone's settled up.
export function SettleSummary({
  expenses,
  members,
  setExpenses,
  tripName,
}: {
  expenses: Expense[];
  members: Member[];
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  tripName: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);
  const [viewLine, setViewLine] = useState<SettlementLine | null>(null);

  const balances = netBalances(expenses);
  const settlements = simplifyDebts(balances);
  const names = [...new Set(Object.keys(balances))];
  const colorFor = (name: string) => members.find((m) => m.name === name)?.color ?? dayColor(names.indexOf(name));
  const memberFor = (name: string) => members.find((m) => m.name === name);

  const toggleRow = (key: string) => {
    setOpenKey((prev) => (prev === key ? null : key));
    setSelectedKeys(new Set());
  };

  // Only one direction (one creditor) can be paid in a single PromptPay
  // transfer -- a settlement pair's drill-down can contain raw lines in
  // both directions (both people alternately fronted money), so selecting
  // a line locks the checkable set to whichever direction was picked first.
  const toggleLine = (line: SettlementLine, lines: SettlementLine[]) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(line.key)) {
        next.delete(line.key);
        return next;
      }
      const selectedDirection = lines.find((l) => next.has(l.key))?.to;
      if (selectedDirection && selectedDirection !== line.to) return prev;
      next.add(line.key);
      return next;
    });
  };

  const confirmPayment = (slipPhotoIds: string[]) => {
    const changed = applyPayment(expenses, [...selectedKeys], slipPhotoIds);
    if (changed.length === 0) return;
    setExpenses((prev) => prev.map((e) => changed.find((c) => c.id === e.id) ?? e));
    changed.forEach((e) => apiUpdate<Expense>("expenses", e.id, e));
    toast(`บันทึกแล้ว ${selectedKeys.size} รายการ`);
    setSelectedKeys(new Set());
    setPayOpen(false);
  };

  // A slip that paid several lines together in one PromptPay transfer is
  // one real-world event -- group already-paid lines by shared
  // paid_slip_photo_ids into one card per event, instead of one flat list
  // that mixes old settled history with whatever's newly outstanding.
  // Every future payment naturally lands in its own new batch this way ("สร้างช่องใหม่ไปเรื่อยๆ").
  const paidBatches = (lines: SettlementLine[]) => {
    const paid = lines.filter((l) => l.paid);
    const seen = new Set<string>();
    const batches: { key: string; lines: SettlementLine[]; total: number }[] = [];
    for (const l of paid) {
      if (seen.has(l.key)) continue;
      const group = l.paid_slip_photo_ids.length > 0
        ? paid.filter((o) => o.paid_slip_photo_ids.some((id) => l.paid_slip_photo_ids.includes(id)))
        : [l];
      group.forEach((g) => seen.add(g.key));
      batches.push({ key: group.map((g) => g.key).join(","), lines: group, total: r2(group.reduce((s, g) => s + g.amount_thb, 0)) });
    }
    return batches;
  };

  if (settlements.length === 0) {
    return <p className="text-muted text-sm py-6 text-center">ไม่มีรายจ่ายที่ต้องหารกัน</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {settlements.map((s, i) => {
        const key = `${s.from}-${s.to}-${i}`;
        const open = openKey === key;
        const lines = expensesBetween(expenses, s.from, s.to);
        const selectedLines = lines.filter((l) => selectedKeys.has(l.key));
        const selectedTotal = selectedLines.reduce((sum, l) => sum + l.amount_thb, 0);
        const payToName = selectedLines[0]?.to;

        // A pair can owe each other in both directions at once (both people
        // alternately fronted money) -- the header already shows the netted
        // amount, but that hides *how* it got there. When both directions
        // have outstanding lines, spell out the subtraction explicitly
        // instead of leaving the user to do it themselves against a flat
        // list of raw transactions.
        const unpaidLines = lines.filter((l) => !l.paid);
        const owedToB = unpaidLines.filter((l) => l.to === s.to);
        const owedToA = unpaidLines.filter((l) => l.to === s.from);
        const sumToB = owedToB.reduce((sum, l) => sum + l.amount_thb, 0);
        const sumToA = owedToA.reduce((sum, l) => sum + l.amount_thb, 0);
        const showNetting = owedToB.length > 0 && owedToA.length > 0;

        return (
          <div key={key} className="rounded-2xl bg-surface shadow-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleRow(key)}
              className="press w-full flex items-center gap-3 p-3 cursor-pointer"
            >
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{ backgroundColor: `color-mix(in srgb, ${colorFor(s.from)} 18%, transparent)`, color: colorFor(s.from) }}
              >
                {s.from.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1 flex items-center gap-2 text-sm">
                <span className="font-medium truncate">{s.from}</span>
                <ArrowRight size={14} className="text-muted shrink-0" />
                <span className="font-medium truncate">{s.to}</span>
              </div>
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{ backgroundColor: `color-mix(in srgb, ${colorFor(s.to)} 18%, transparent)`, color: colorFor(s.to) }}
              >
                {s.to.slice(0, 1)}
              </span>
              <p className="money text-sm font-semibold shrink-0">฿{s.amount.toLocaleString()}</p>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-muted shrink-0">
                <ChevronDown size={16} />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1.5 px-3 pb-3">
                    {showNetting && (
                      <div className="rounded-xl bg-muted/5 p-2.5 flex flex-col gap-1 text-xs">
                        <p className="font-medium text-muted mb-0.5">การหักลบยอด</p>
                        <div className="flex items-center justify-between">
                          <span>{s.to} จ่ายแทน {s.from}</span>
                          <span className="money font-medium">฿{sumToB.toLocaleString()} ({owedToB.length} รายการ)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{s.from} จ่ายแทน {s.to}</span>
                          <span className="money font-medium">−฿{sumToA.toLocaleString()} ({owedToA.length} รายการ)</span>
                        </div>
                        <div className="h-px bg-muted/15 my-0.5" />
                        <div className="flex items-center justify-between font-semibold">
                          <span>{s.from} ต้องโอนให้ {s.to}</span>
                          <span className="money">฿{r2(sumToB - sumToA).toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                    {lines.length === 0 && (
                      <p className="text-xs text-muted">ยอดนี้มาจากการหักลบหลายรายการ (ดูรายละเอียดที่แท็บ ทั้งทริป)</p>
                    )}

                    {showNetting ? (
                      // Netted both ways -- only one real transfer ever
                      // happens (the net amount), so individual raw lines
                      // aren't independently payable; a checkbox on the
                      // opposite-direction line would imply a transfer that
                      // never occurs. List them read-only under the
                      // breakdown above, pay the net in one action.
                      <>
                        {unpaidLines.map((l) => (
                          <div key={l.key} className="flex items-center gap-2 rounded-xl bg-muted/5 p-2 text-xs">
                            <span className="text-muted shrink-0 w-12">{fmtDate(l.datetime)}</span>
                            <span className="flex-1 min-w-0 truncate font-medium">{l.description}</span>
                            <span className="text-muted shrink-0">{l.from} → {l.to}</span>
                            <span className="money font-semibold shrink-0">฿{l.amount_thb.toLocaleString()}</span>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKeys(new Set(unpaidLines.map((l) => l.key)));
                            setPayOpen(true);
                          }}
                          className="press mt-1 h-11 rounded-xl bg-primary text-white text-sm font-semibold cursor-pointer"
                        >
                          จ่ายยอดสุทธิ ฿{r2(sumToB - sumToA).toLocaleString()}
                        </button>
                      </>
                    ) : (
                      <>
                        {unpaidLines.map((l) => {
                          const checked = selectedKeys.has(l.key);
                          const disabled = selectedLines.length > 0 && payToName !== l.to && !checked;
                          return (
                            <button
                              key={l.key}
                              type="button"
                              disabled={disabled}
                              onClick={() => toggleLine(l, lines)}
                              className="press flex items-center gap-2 rounded-xl bg-muted/5 p-2 text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <span
                                className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 border-2"
                                style={
                                  checked
                                    ? { backgroundColor: "var(--color-primary)", borderColor: "var(--color-primary)" }
                                    : { borderColor: "color-mix(in srgb, var(--color-muted) 40%, transparent)" }
                                }
                              >
                                {checked && <Check size={12} className="text-white" />}
                              </span>
                              <span className="text-muted shrink-0 w-12">{fmtDate(l.datetime)}</span>
                              <span className="flex-1 min-w-0 truncate font-medium">{l.description}</span>
                              <span className="text-muted shrink-0">{l.from} → {l.to}</span>
                              <span className="money font-semibold shrink-0">฿{l.amount_thb.toLocaleString()}</span>
                            </button>
                          );
                        })}
                        {selectedLines.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayOpen(true)}
                            className="press mt-1 h-11 rounded-xl bg-primary text-white text-sm font-semibold cursor-pointer"
                          >
                            จ่ายแล้ว {selectedLines.length} รายการ (฿{selectedTotal.toLocaleString()})
                          </button>
                        )}
                      </>
                    )}

                    {paidBatches(lines).length > 0 && (
                      <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-muted/10">
                        <p className="text-xs font-medium text-muted">ประวัติที่จ่ายแล้ว</p>
                        {paidBatches(lines).map((batch) => (
                          <button
                            key={batch.key}
                            type="button"
                            onClick={() => setViewLine(batch.lines[0])}
                            className="press flex items-center gap-2 rounded-xl bg-muted/5 p-2 text-xs cursor-pointer"
                          >
                            <span className="h-5 w-5 rounded-full bg-success text-white flex items-center justify-center shrink-0">
                              <Check size={12} />
                            </span>
                            <span className="text-muted shrink-0 w-12">{fmtDate(batch.lines[0].datetime)}</span>
                            <span className="flex-1 min-w-0 truncate font-medium text-muted">
                              {batch.lines.length > 1 ? `${batch.lines.length} รายการ` : batch.lines[0].description}
                            </span>
                            <span className="text-muted shrink-0">{batch.lines[0].from} → {batch.lines[0].to}</span>
                            <span className="money font-semibold shrink-0 text-muted">฿{batch.total.toLocaleString()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {open && selectedLines.length > 0 && (
              <PayLineSheet
                open={payOpen}
                onClose={() => setPayOpen(false)}
                // Netted case: the QR/amount must be the net transfer (what
                // actually moves), to the actual net creditor (s.to) --
                // not the gross sum of both directions' raw lines, and not
                // selectedLines[0]'s direction (arbitrary, whichever line
                // happens to sort first).
                toMember={memberFor(showNetting ? s.to : payToName ?? "")}
                amount={showNetting ? r2(sumToB - sumToA) : selectedTotal}
                lineCount={selectedLines.length}
                tripName={tripName}
                onConfirm={confirmPayment}
              />
            )}
          </div>
        );
      })}

      {viewLine && (
        <BottomSheet open={!!viewLine} onClose={() => setViewLine(null)} title="รายละเอียดที่จ่ายแล้ว">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{viewLine.description}</span>
              <span className="money font-semibold">฿{viewLine.amount_thb.toLocaleString()}</span>
            </div>
            {viewLine.paid_slip_photo_ids.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {viewLine.paid_slip_photo_ids.map((id) => (
                  <img key={id} src={photoUrl(id)} alt="สลิป" className="h-24 w-24 rounded-xl object-cover" />
                ))}
              </div>
            )}
            {(() => {
              const shared = splitsSharingSlip(expenses, viewLine.paid_slip_photo_ids).filter((s) => s.key !== viewLine.key);
              if (shared.length === 0) return null;
              return (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted font-medium">จ่ายรวมกับอีก {shared.length} รายการ</p>
                  {shared.map((s) => (
                    <div key={s.key} className="flex items-center justify-between text-sm rounded-xl bg-muted/5 p-2">
                      <span className="truncate">{s.description}</span>
                      <span className="money font-semibold shrink-0">฿{s.amount_thb.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
