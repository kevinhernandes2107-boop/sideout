import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
// @ts-ignore - unstable_createElement lets us render real HTML5 date/time inputs on web.
import { unstable_createElement } from 'react-native-web';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';
import type { Recurrence, ScheduledOccurrence } from './MatchScheduler';

interface MatchSchedulerProps {
  recurrence: Recurrence;
  multiDay?: boolean;
  initialStartTime: Date | null;
  initialEndTime: Date | null;
  onChange: (occurrences: ScheduledOccurrence[]) => void;
}

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nextOccurrence(weekday: number): Date {
  const now = new Date();
  const result = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (weekday - now.getDay() + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function toDateInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toTimeInputValue(date: Date | null): string {
  if (!date) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function fromDateInputValue(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fromTimeInputValue(value: string): Date | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  const base = new Date();
  base.setHours(h, m, 0, 0);
  return base;
}

export default function MatchScheduler({
  recurrence,
  multiDay = false,
  initialStartTime,
  initialEndTime,
  onChange,
}: MatchSchedulerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(() =>
    recurrence === 'None' && initialStartTime ? new Date(initialStartTime) : null
  );
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(() =>
    recurrence !== 'None' && initialStartTime ? [new Date(initialStartTime).getDay()] : []
  );
  const [isPlayWeek, setIsPlayWeek] = useState(true);
  const [timeStart, setTimeStart] = useState<Date | null>(() => (initialStartTime ? new Date(initialStartTime) : null));
  const [timeEnd, setTimeEnd] = useState<Date | null>(() => (initialEndTime ? new Date(initialEndTime) : null));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const toggleWeekday = (index: number) => {
    if (!multiDay) {
      setSelectedWeekdays([index]);
      return;
    }
    setSelectedWeekdays((prev) => (prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index].sort()));
  };

  useEffect(() => {
    let baseDates: Date[] = [];
    if (recurrence === 'None') {
      baseDates = selectedDate ? [selectedDate] : [];
    } else {
      baseDates = selectedWeekdays.map((weekday) => {
        let date = nextOccurrence(weekday);
        if (recurrence === 'Biweekly' && !isPlayWeek) date = addDays(date, 7);
        return date;
      });
    }

    const occurrences: ScheduledOccurrence[] = timeStart
      ? baseDates.map((date) => ({
          startTime: combineDateAndTime(date, timeStart),
          endTime: timeEnd ? combineDateAndTime(date, timeEnd) : null,
        }))
      : [];

    onChangeRef.current(occurrences);
  }, [recurrence, selectedDate, selectedWeekdays, isPlayWeek, timeStart, timeEnd]);

  const playWeekLabel =
    selectedWeekdays.length === 1
      ? `Is ${WEEKDAYS_FULL[selectedWeekdays[0]]}, ${formatDate(nextOccurrence(selectedWeekdays[0]))} a play week?`
      : 'Is this week a play week?';

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
      {recurrence === 'None' ? (
        <>
          <Text style={styles.label}>Date</Text>
          {unstable_createElement('input', {
            type: 'date',
            value: toDateInputValue(selectedDate),
            min: toDateInputValue(new Date()),
            onChange: (e: any) => setSelectedDate(fromDateInputValue(e.target.value)),
            style: inputStyle,
          })}
        </>
      ) : (
        <>
          <Text style={styles.label}>{multiDay ? 'Day(s) of Week' : 'Day of Week'}</Text>
          <View style={styles.pillRow}>
            {WEEKDAYS_SHORT.map((day, index) => (
              <TouchableOpacity
                key={day}
                style={[styles.pill, selectedWeekdays.includes(index) && styles.pillSelected]}
                onPress={() => toggleWeekday(index)}
              >
                <Text style={[styles.pillText, selectedWeekdays.includes(index) && styles.pillTextSelected]}>
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {recurrence === 'Biweekly' && selectedWeekdays.length > 0 && (
            <>
              <Text style={styles.label}>{playWeekLabel}</Text>
              <View style={styles.pillRow}>
                <TouchableOpacity
                  style={[styles.pill, isPlayWeek && styles.pillSelected]}
                  onPress={() => setIsPlayWeek(true)}
                >
                  <Text style={[styles.pillText, isPlayWeek && styles.pillTextSelected]}>Yes, this week</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, !isPlayWeek && styles.pillSelected]}
                  onPress={() => setIsPlayWeek(false)}
                >
                  <Text style={[styles.pillText, !isPlayWeek && styles.pillTextSelected]}>No, next week</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </>
      )}

      <Text style={styles.label}>Time</Text>
      <View style={styles.timeRow}>
        <View style={styles.timeInputWrap}>
          {unstable_createElement('input', {
            type: 'time',
            value: toTimeInputValue(timeStart),
            onChange: (e: any) => setTimeStart(fromTimeInputValue(e.target.value)),
            style: inputStyle,
          })}
        </View>
        <Text style={styles.timeSeparator}>to</Text>
        <View style={styles.timeInputWrap}>
          {unstable_createElement('input', {
            type: 'time',
            value: toTimeInputValue(timeEnd),
            onChange: (e: any) => setTimeEnd(fromTimeInputValue(e.target.value)),
            style: inputStyle,
          })}
        </View>
      </View>

      {multiDay && selectedWeekdays.length > 1 && timeStart && (
        <Text style={styles.multiDayHint}>
          This creates {selectedWeekdays.length} matches, one on each selected day.
        </Text>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginBottom: 6, marginTop: 12 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  pillSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
  pillText: { fontSize: 13, color: colors.textMuted },
  pillTextSelected: { color: '#fff', fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeInputWrap: { flex: 1 },
  timeSeparator: { marginHorizontal: 10, color: colors.textMuted, fontWeight: '600' },
  multiDayHint: { fontSize: 12, color: colors.blue, fontStyle: 'italic', marginTop: 8 },
});
