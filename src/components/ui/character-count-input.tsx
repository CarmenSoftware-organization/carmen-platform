import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { z } from 'zod';
import { Input } from './input';
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
  id,
  name,
  disabled,
  className,
  hardCap = true,
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

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        <Input
          id={fieldId}
          name={name}
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          aria-invalid={showError}
          aria-describedby={showError ? `${counterId} ${errorId}` : counterId}
          className={cn('pr-16', showError && 'border-destructive', className)}
        />
        <span
          id={counterId}
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-colors',
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
