import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

export type Recurrence = 'None' | 'Weekly' | 'Biweekly';

export interface ScheduledOccurrence {
  startTime: Date;
  endTime: Date | null;
}

interface MatchSchedulerProps {
  recurrence: Recurrence;
  /** When true (Weekly/Biweekly only), multiple weekdays can be selected at once, producing one occurrence per day. */
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

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

type ActivePicker = 'date' | 'start' | 'end' | null;

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
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

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

  const handlePickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setActivePicker(null);
    if (event.type === 'dismissed' || !date) return;

    if (activePicker === 'date') setSelectedDate(date);
    else if (activePicker === 'start') setTimeStart(date);
    else if (activePicker === 'end') setTimeEnd(date);
  };

  const pickerValue =
    activePicker === 'date'
      ? selectedDate || new Date()
      : activePicker === 'start'
        ? timeStart || new Date()
        : timeEnd || new Date();

  const playWeekLabel =
    selectedWeekdays.length === 1
      ? `Is ${WEEKDAYS_FULL[selectedWeekdays[0]]}, ${formatDate(nextOccurrence(selectedWeekdays[0]))} a play week?`
      : 'Is this week a play week?';

  return (
    <View>
      {recurrence === 'None' ? (
        <>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.fieldButton} onPress={() => setActivePicker('date')}>
            <MaterialIcons name="event" size={18} color={colors.blue} />
            <Text style={styles.fieldButtonText}>{selectedDate ? formatDate(selectedDate) : 'Choose a date'}</Text>
          </TouchableOpacity>
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
        <TouchableOpacity style={[styles.fieldButton, styles.timeButton]} onPress={() => setActivePicker('start')}>
          <MaterialIcons name="schedule" size={18} color={colors.blue} />
          <Text style={styles.fieldButtonText}>{timeStart ? formatTime(timeStart) : 'Start'}</Text>
        </TouchableOpacity>
        <Text style={styles.timeSeparator}>to</Text>
        <TouchableOpacity style={[styles.fieldButton, styles.timeButton]} onPress={() => setActivePicker('end')}>
          <MaterialIcons name="schedule" size={18} color={colors.blue} />
          <Text style={styles.fieldButtonText}>{timeEnd ? formatTime(timeEnd) : 'End'}</Text>
        </TouchableOpacity>
      </View>

      {multiDay && selectedWeekdays.length > 1 && timeStart && (
        <Text style={styles.multiDayHint}>
          This creates {selectedWeekdays.length} matches, one on each selected day.
        </Text>
      )}

      {activePicker && (
        <View style={styles.pickerCard}>
          <DateTimePicker
            value={pickerValue}
            mode={activePicker === 'date' ? 'date' : 'time'}
            display={Platform.OS === 'ios' ? (activePicker === 'date' ? 'inline' : 'spinner') : 'default'}
            minimumDate={activePicker === 'date' ? new Date() : undefined}
            onChange={handlePickerChange}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.doneButton} onPress={() => setActivePicker(null)}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginBottom: 6, marginTop: 12 },
  fieldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
  },
  fieldButtonText: { fontSize: 15, color: colors.text, marginLeft: 8, fontWeight: '600' },
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
  timeButton: { flex: 1 },
  timeSeparator: { marginHorizontal: 10, color: colors.textMuted, fontWeight: '600' },
  multiDayHint: { fontSize: 12, color: colors.blue, fontStyle: 'italic', marginTop: 8 },
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
    padding: 8,
    alignItems: 'center',
  },
  doneButton: {
    backgroundColor: colors.blue,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
    marginBottom: 4,
  },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
