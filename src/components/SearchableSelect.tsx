"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchableSelectProps<T> {
  items: T[];
  value: string | null;
  onChange: (id: string) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string | null | undefined;
  placeholder?: string;
  onAddNew?: () => void;
  addNewLabel?: string;
  disabled?: boolean;
}

export default function SearchableSelect<T>({
  items,
  value,
  onChange,
  getId,
  getLabel,
  getSubLabel,
  placeholder = "Select...",
  onAddNew,
  addNewLabel = "Add new",
  disabled,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = items.find((item) => getId(item) === value) ?? null;

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter(
      (item) => getLabel(item).toLowerCase().includes(q) || (getSubLabel?.(item) ?? "").toLowerCase().includes(q)
    );
  }, [items, query, getLabel, getSubLabel]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "input-field flex items-center justify-between text-left",
          !selected && "text-slate-400 dark:text-slate-500"
        )}
      >
        <span className="truncate">{selected ? getLabel(selected) : placeholder}</span>
        <ChevronDown size={16} className="ml-2 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <Search size={14} className="text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">No matches</li>
            )}
            {filtered.map((item) => {
              const id = getId(item);
              const isSelected = id === value;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/60",
                      isSelected && "bg-brand-50 dark:bg-brand-500/10"
                    )}
                  >
                    <span>
                      <span className="block text-slate-800 dark:text-slate-100">{getLabel(item)}</span>
                      {getSubLabel?.(item) && (
                        <span className="block text-xs text-slate-400">{getSubLabel(item)}</span>
                      )}
                    </span>
                    {isSelected && <Check size={14} className="text-brand-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {onAddNew && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery("");
                onAddNew();
              }}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:border-slate-700 dark:text-brand-400 dark:hover:bg-brand-500/10"
            >
              <Plus size={14} /> {addNewLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
