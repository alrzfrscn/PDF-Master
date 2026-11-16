import { Coffee, Moon, Sun } from "lucide-react";
import { useUIStore } from "../stores/useUIStore";
import type { ThemeName } from "../lib/types";

const OPTIONS: { value: ThemeName; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Apple Light", Icon: Sun },
  { value: "dark", label: "Apple Dark", Icon: Moon },
  { value: "sepia", label: "Sepia", Icon: Coffee },
];

export function ThemeSwitcher() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  return (
    <div className="seg h-8 items-center px-0.5" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className="grid h-6 w-7 place-items-center px-0"
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon size={14} strokeWidth={1.75} />
        </button>
      ))}
    </div>
  );
}
