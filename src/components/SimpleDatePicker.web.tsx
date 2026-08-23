import React from 'react';
import { View } from 'react-native';
// @ts-ignore - unstable_createElement lets us render a real HTML5 date input on web.
import { unstable_createElement } from 'react-native-web';
import { useTheme } from '../context/ThemeContext';

interface SimpleDatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  label?: string;
}

function toDateInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateInputValue(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function SimpleDatePicker({ value, onChange }: SimpleDatePickerProps) {
  const { colors } = useTheme();
  const inputStyle = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    fontFamily: 'inherit',
    width: '100%',
  };

  return (
    <View>
      {unstable_createElement('input', {
        type: 'date',
        value: toDateInputValue(value),
        min: toDateInputValue(new Date()),
        onChange: (e: any) => {
          const d = fromDateInputValue(e.target.value);
          if (d) onChange(d);
        },
        style: inputStyle,
      })}
    </View>
  );
}
