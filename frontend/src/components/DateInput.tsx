import React, { useState, useEffect, ChangeEvent } from 'react';
import { fmtDate, toInputDate } from '../lib/dateUtils';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: string | null;
  onChange?: (value: string | null) => void;
}

const DateInput: React.FC<DateInputProps> = ({ value, onChange, ...props }) => {
  const [displayValue, setDisplayValue] = useState<string>(fmtDate(value));

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
      // Basic validation for numbers and length
      if (day.length === 2 && month.length === 2 && year.length === 4 &&
          !isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
        const formattedValue = `${year}-${month}-${day}`;
        // Check if it's a valid date
        const date = new Date(formattedValue);
        if (!isNaN(date.getTime())) {
          onChange?.(formattedValue);
          return;
        }
      }
    }
    // If input is empty, clear the value
    if (inputValue === '') {
      onChange?.(null);
      return;
    }
    // If input is not a valid dd/MM/yyyy or empty, don't update the parent state yet
    // The parent will update displayValue via useEffect if its value changes
  };

  const handleBlur = () => {
    // When blurring, re-format the display value to ensure consistency
    setDisplayValue(fmtDate(value));
  };

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="dd/MM/yyyy"
      pattern="\d{2}/\d{2}/\d{4}"
      {...props}
    />
  );
};

export default DateInput;
