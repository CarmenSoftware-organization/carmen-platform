/**
 * CharacterCountInput - a controlled text field with a live character count and
 * Zod validation. Renders an <input> or a <textarea> (multiline); the counter
 * and warning color update in real time, while the error border + message
 * appear only after the first blur while the value is invalid. Surface validity
 * to a parent via onValidChange to gate submit.
 *
 * @example
 * const [bio, setBio] = useState('');
 * const [valid, setValid] = useState(false);
 * <form onSubmit={handleSubmit}>
 *   <CharacterCountInput
 *     label="Bio" value={bio} onChange={setBio}
 *     minLength={10} maxLength={200} multiline
 *     onValidChange={(ok) => setValid(ok)}
 *   />
 *   <Button type="submit" disabled={!valid}>Save</Button>
 * </form>
 *
 * Note: length is counted with String.length (UTF-16 code units); astral
 * characters such as most emoji count as 2 - the same unit Zod's .max() uses.
 */
import { useEffect, useId, useMemo, useState, type ChangeEvent } from 'react';
import { z } from 'zod';
import { Input } from './input';
import { Textarea } from './textarea';
import { Label } from './label';
import { cn } from '../../lib/utils';

export type CounterState = 'normal' | 'warning' | 'error';

export function deriveCounterState(
  len: number,
  warnAt: number,
  maxLength: number,
): CounterState {
  if (len > maxLength) return 'error';
  if (len >= warnAt) return 'warning';
  return 'normal';
}

const counterColor: Record<CounterState, string> = {
  normal: 'text-muted-foreground',
  warning: 'text-warning',
  error: 'text-destructive',
};

export interface CharacterCountInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  minLength?: number;
  placeholder?: string;
  multiline?: boolean;
  hardCap?: boolean;
  onValidChange?: (isValid: boolean, error?: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
}

export function CharacterCountInput({
  label,
  value,
  onChange,
  maxLength = 200,
  minLength = 0,
  placeholder,
  multiline = false,
  hardCap = true,
  onValidChange,
  id,
  name,
  disabled,
  className,
}: CharacterCountInputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const counterId = `${fieldId}-counter`;
  const errorId = `${fieldId}-error`;
  const [touched, setTouched] = useState(false);

  const schema = useMemo(
    () => z.string().min(minLength).max(maxLength),
    [minLength, maxLength],
  );
  const result = schema.safeParse(value);
  const isValid = result.success;
  const error = result.success ? undefined : result.error.issues[0].message;

  // Redundant calls with an unchanged value are harmless (React bails on an
  // identical setState); parents doing expensive work should memoize onValidChange.
  useEffect(() => {
    onValidChange?.(isValid, error);
  }, [isValid, error, onValidChange]);

  const len = value.length;
  const warnAt = Math.ceil(maxLength * 0.9);
  const counterState = deriveCounterState(len, warnAt, maxLength);
  const showError = touched && !isValid;

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = e.target.value;
    if (hardCap && next.length > maxLength) return;
    onChange(next);
  };

  const sharedProps = {
    id: fieldId,
    name,
    value,
    placeholder,
    disabled,
    onChange: handleChange,
    onBlur: () => setTouched(true),
    'aria-invalid': showError,
    'aria-describedby': showError ? `${counterId} ${errorId}` : counterId,
    className: cn(
      multiline ? 'resize-none pb-6' : 'pr-16',
      showError && 'border-destructive',
      className,
    ),
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        {multiline ? (
          <Textarea {...sharedProps} />
        ) : (
          <Input type="text" {...sharedProps} />
        )}
        <span
          id={counterId}
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute text-xs transition-colors',
            multiline ? 'bottom-2 right-3' : 'right-3 top-1/2 -translate-y-1/2',
            counterColor[counterState],
          )}
        >
          {len} / {maxLength}
        </span>
      </div>
      {showError && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default CharacterCountInput;
