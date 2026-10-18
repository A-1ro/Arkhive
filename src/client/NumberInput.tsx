import { useRef, useState, type ComponentProps } from "react";
import { parseNumericInput } from "./numeric-input";

type Props = Omit<
  ComponentProps<"input">,
  | "type"
  | "inputMode"
  | "value"
  | "defaultValue"
  | "min"
  | "max"
  | "onChange"
  | "onBlur"
  | "onCompositionStart"
  | "onCompositionEnd"
> & {
  value: number;
  min: number;
  max: number;
  decimal?: boolean;
  emptyWhenZero?: boolean;
  onValueChange: (value: number) => void;
};

export function NumberInput({
  value,
  min,
  max,
  decimal = false,
  emptyWhenZero = false,
  onValueChange,
  ...props
}: Props) {
  const [draft, setDraft] = useState<{ text: string; value: number } | null>(
    null,
  );
  const composing = useRef(false);

  function change(text: string) {
    const next = composing.current ? null : parseNumericInput(text, decimal);
    const valid = next !== null && next >= min && next <= max;
    setDraft({ text, value: valid ? next : value });
    if (valid) onValueChange(next);
  }

  return (
    <input
      {...props}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      value={
        draft?.value === value
          ? draft.text
          : emptyWhenZero && value === 0
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
        const next =
          text.trim() === "" ? min : parseNumericInput(text, decimal);
        setDraft(null);
        if (next !== null) onValueChange(Math.min(max, Math.max(min, next)));
      }}
    />
  );
}
