"use client";
import { Search } from "lucide-react";
import { useSearch } from "@/lib/search-context";

export function SearchButton() {
  const { openSearch } = useSearch();
  return (
    <button
      type="button"
      aria-label="ค้นหา"
      onClick={openSearch}
      className="relative h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted hover:bg-primary/8 active:scale-90 transition-transform cursor-pointer"
    >
      <Search size={20} />
    </button>
  );
}
