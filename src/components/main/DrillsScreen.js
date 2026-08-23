import React, { useMemo } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

const CATEGORY_ICONS = {
  Receiving: 'sports-handball',
  Spiking: 'sports-volleyball',
  Serving: 'sports-tennis',
  Setting: 'front-hand',
  Conditioning: 'directions-run',
};

const DRILLS = [
  { id: '1', title: 'Solo Wall Passing', category: 'Receiving', description: 'Pass against a wall to sharpen platform control.' },
  { id: '2', title: 'Self-Toss Spike Timing', category: 'Spiking', description: 'Toss and attack to dial in your approach timing.' },
  { id: '3', title: 'Target Serving Practice', category: 'Serving', description: 'Serve at cones or targets to build accuracy.' },
  { id: '4', title: 'Wall Setting Reps', category: 'Setting', description: 'Repeated overhead sets against a wall for hand shape.' },
  { id: '5', title: 'Approach Footwork Ladder', category: 'Conditioning', description: 'Footwork drills for a faster, cleaner approach.' },
];

export default function DrillsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={DRILLS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} activeOpacity={0.85}>
          <View style={styles.iconWrap}>
            <MaterialIcons name={CATEGORY_ICONS[item.category] || 'sports-volleyball'} size={20} color={colors.blue} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardCategory}>{item.category}</Text>
            <Text style={styles.cardDescription}>{item.description}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: 20 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0057B815',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardCategory: { fontSize: 12, fontWeight: '600', color: colors.blue, marginTop: 2 },
  cardDescription: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
});
