import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';
import DrillsScreen from '../../components/main/DrillsScreen';
import PracticeScreen from '../../components/main/PracticeScreen';

export default function TrainScreen() {
  const [tab, setTab] = useState<'drills' | 'practice'>('drills');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <MaterialIcons name="fitness-center" size={22} color={colors.blue} />
        <Text style={styles.headerTitle}>Train</Text>
      </View>

      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segment, tab === 'drills' && styles.segmentActive]}
          onPress={() => setTab('drills')}
        >
          <Text style={[styles.segmentText, tab === 'drills' && styles.segmentTextActive]}>Drills</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, tab === 'practice' && styles.segmentActive]}
          onPress={() => setTab('practice')}
        >
          <Text style={[styles.segmentText, tab === 'practice' && styles.segmentTextActive]}>Practice Timer</Text>
        </TouchableOpacity>
      </View>

      {tab === 'drills' ? <DrillsScreen /> : <PracticeScreen />}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginLeft: 6 },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.blue },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: '#fff' },
});
