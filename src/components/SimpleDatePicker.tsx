import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface SimpleDatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  label?: string;
}

export default function SimpleDatePicker({ value, onChange, label = 'date' }: SimpleDatePickerProps) {
  const { colors } = useTheme();
  const [show, setShow] = useState(false);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (event.type === 'dismissed' || !date) return;
    onChange(date);
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setShow(true)}
      >
        <MaterialIcons name="event" size={18} color={colors.blue} />
        <Text style={[styles.buttonText, { color: colors.text }]}>
          {value
            ? value.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
            : `Choose a ${label}`}
        </Text>
      </TouchableOpacity>
      {show && (
        <View style={[styles.pickerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <DateTimePicker
            value={value || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={new Date()}
            onChange={handleChange}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={[styles.doneButton, { backgroundColor: colors.blue }]} onPress={() => setShow(false)}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 12 },
  buttonText: { fontSize: 15, marginLeft: 8, fontWeight: '600' },
  pickerCard: { borderRadius: 12, borderWidth: 1, marginTop: 10, padding: 8, alignItems: 'center' },
  doneButton: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24, marginTop: 4, marginBottom: 4 },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
