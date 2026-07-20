import { useId } from 'react';
import { Input } from './input';
import { Label } from './label';
import { cn } from '../../lib/utils';

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
}: CharacterCountInputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const counterId = `${fieldId}-counter`;
  const len = value.length;

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
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={counterId}
          className={cn('pr-16', className)}
        />
        <span
          id={counterId}
          aria-live="polite"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
        >
          {len} / {maxLength}
        </span>
      </div>
    </div>
  );
}

export default CharacterCountInput;
