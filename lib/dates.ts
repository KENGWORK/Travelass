// Booking dates: end defaults to the start date and can never be earlier than it.
export function defaultEndDate(from: string, to: string): string {
  if (!from) return to;
  if (!to || to < from) return from;
  return to;
}
