import { useState, useEffect, useRef, useCallback } from "react";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when the parent resets the controlled value (e.g. clearing)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced onChange
  const emitChange = useCallback(
    (next: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(next);
      }, 300);
    },
    [onChange],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Cmd+K to focus
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setLocalValue(next);
    emitChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setLocalValue("");
      onChange("");
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative flex items-center">
      {/* Magnifying glass icon */}
      <svg
        className="absolute left-2.5 h-4 w-4 text-muted dark:text-dark-muted pointer-events-none"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>

      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Search links..."
        className="w-56 h-8 pl-8 pr-3 text-sm rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-colors"
      />

      {/* Kbd hint */}
      {!localValue && (
        <span className="absolute right-2.5 text-[10px] leading-none text-muted dark:text-dark-muted border border-border dark:border-dark-border rounded px-1 py-0.5 pointer-events-none select-none">
          ⌘K
        </span>
      )}
    </div>
  );
}
