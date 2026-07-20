import { useId, type ChangeEvent } from 'react';
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
  const len = value.length;
  const warnAt = Math.ceil(maxLength * 0.9);
  const counterState = deriveCounterState(len, warnAt, maxLength);

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
          aria-describedby={counterId}
          className={cn('pr-16', className)}
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
    </div>
  );
}

export default CharacterCountInput;
