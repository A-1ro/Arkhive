import { useRef, useState, type ComponentProps } from "react";
import { parseNumericInput } from "./numeric-input";

type Props = Omit<
  ComponentProps<"input">,
  "type" | "value" | "onChange" | "min" | "max"
> & {
  value: number | null;
  min: number;
  max: number;
  onValueChange: (value: number | null) => void;
};

/** Empty is unspecified, while a typed zero remains an explicit zero. */
export function OptionalNumberInput({
  value,
  min,
  max,
  onValueChange,
  ...props
}: Props) {
  const [draft, setDraft] = useState<{
    text: string;
    value: number | null;
  } | null>(null);
  const composing = useRef(false);
  function change(text: string) {
    const next = text.trim() === "" ? null : parseNumericInput(text);
    const valid =
      !composing.current &&
      (text.trim() === "" || (next !== null && next >= min && next <= max));
    setDraft({ text, value: valid ? next : value });
    if (valid) onValueChange(next);
  }
  return (
    <input
      {...props}
      type="text"
      inputMode={min < 0 ? "text" : "numeric"}
      value={
        draft?.value === value
          ? draft.text
          : value === null
            ? ""
            : String(value)
      }
      onChange={(e) => change(e.currentTarget.value)}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        change(e.currentTarget.value);
      }}
      onBlur={(e) => {
        composing.current = false;
        const text = e.currentTarget.value;
        const next = text.trim() === "" ? null : parseNumericInput(text);
        setDraft(null);
        if (text.trim() === "" || next !== null)
          onValueChange(
            next === null ? null : Math.min(max, Math.max(min, next)),
          );
      }}
    />
  );
}
