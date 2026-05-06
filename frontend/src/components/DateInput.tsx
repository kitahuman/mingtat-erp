import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, ChangeEvent } from 'react';
import { fmtDate } from '../lib/dateUtils';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: string | null;
  onChange?: (value: string | null) => void;
}

const DateInput = forwardRef<HTMLInputElement, DateInputProps>(({ value, onChange, ...props }, ref) => {
  const [displayValue, setDisplayValue] = useState<string>(fmtDate(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  useEffect(() => {
    setDisplayValue(fmtDate(value));
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);

    // Attempt to parse dd/MM/yyyy to YYYY-MM-DD
    const parts = inputValue.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      if (day.length === 2 && month.length === 2 && year.length === 4 &&
          !isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
        const formattedValue = `${year}-${month}-${day}`;
        const date = new Date(formattedValue);
        if (!isNaN(date.getTime())) {
          onChange?.(formattedValue);
          return;
        }
      }
    }
    if (inputValue === '') {
      onChange?.(null);
      return;
    }
  };

  const handleBlur = () => {
    setDisplayValue(fmtDate(value));
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="dd/MM/yyyy"
      pattern="\d{2}/\d{2}/\d{4}"
      {...props}
    />
  );
});

DateInput.displayName = 'DateInput';

export default DateInput;
