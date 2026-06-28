import { useEffect, useState } from 'react';

interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Current numeric value, or null when the field is empty. */
  value: number | null;
  /** Called with the parsed value whenever the user edits the field. */
  onChange: (value: number | null) => void;
  /** When true an empty field emits null; otherwise it emits 0. */
  allowEmpty?: boolean;
}

// Whole numbers or an in-progress decimal (e.g. "12", "12.", "12.5").
const PARTIAL_NUMBER = /^\d*\.?\d*$/;

/**
 * A controlled money field that lets the user type whole numbers naturally
 * (no forced decimal point) while still accepting decimals. It keeps its own
 * text buffer so an in-progress value like "12." is not collapsed back to "12"
 * on each keystroke, which is the bug with binding a number straight to a
 * `type="number"` input via `parseFloat(...) || 0`.
 */
export function MoneyInput({ value, onChange, allowEmpty = false, ...rest }: MoneyInputProps) {
  const [text, setText] = useState<string>(value === null ? '' : String(value));

  // Keep the buffer in sync when the external value changes (e.g. form reset),
  // but leave an in-progress entry alone when it already parses to that value.
  useEffect(() => {
    const parsed = text === '' ? null : Number(text);
    if (parsed !== value) {
      setText(value === null ? '' : String(value));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    if (!PARTIAL_NUMBER.test(next)) {
      return;
    }

    setText(next);

    if (next === '' || next === '.') {
      onChange(allowEmpty ? null : 0);
      return;
    }

    const parsed = Number(next);
    if (!Number.isNaN(parsed)) {
      onChange(parsed);
    }
  };

  return <input type="text" inputMode="decimal" value={text} onChange={handleChange} {...rest} />;
}
