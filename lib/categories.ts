import type { Category } from "@/lib/models/types";

export const CATS: { name: Category; color: string }[] = [
  { name: "อาหาร", color: "var(--color-cat-food)" }, { name: "เดินทาง", color: "var(--color-cat-transport)" },
  { name: "ที่พัก", color: "var(--color-cat-lodging)" }, { name: "ช้อป", color: "var(--color-cat-shopping)" },
  { name: "ตั๋ว", color: "var(--color-cat-tickets)" }, { name: "อื่นๆ", color: "var(--color-cat-other)" },
];
