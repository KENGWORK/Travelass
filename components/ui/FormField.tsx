"use client";
import { useId, isValidElement, cloneElement, type ReactElement } from "react";

// Wires the label to its control via htmlFor/id (useId) so screen readers
// announce the label instead of falling back to the input's placeholder.
// Only works when there's exactly one control child (input/textarea/select/
// TimeInput) — multi-child fields (e.g. an input plus a PhotoPicker below
// it) or composite controls (Chip groups, MoneyInput, PayerChips) fall back
// to a plain unassociated label, same as before.
export function FormField({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  const id = useId();
  const canAssociate = isValidElement(children);
  const child = canAssociate ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children;

  return (
    <div className={className}>
      <label htmlFor={canAssociate ? id : undefined} className="text-sm text-muted">
        {label}
      </label>
      <div className="mt-1">{child}</div>
    </div>
  );
}
