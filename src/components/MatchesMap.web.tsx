import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

export interface MapMatch {
  id: number;
  title: string;
  city?: string | null;
  skill_level?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  host: { username: string };
  rsvp_count: number;
}

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface MatchesMapProps {
  matches: MapMatch[];
  region: Region;
  onRegionChange: (region: Region) => void;
  onSelectMatch: () => void;
}

// react-native-maps has no web implementation, so web gets a list view
// instead of the interactive pin map used on iOS/Android.
export default function MatchesMap({ matches, onSelectMatch }: MatchesMapProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <FlatList
      data={matches}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.card} onTouchEnd={onSelectMatch}>
          <Text style={styles.matchTitle}>{item.title}</Text>
          <Text style={styles.detailText}>Hosted by @{item.host.username}</Text>
          {!!item.city && <Text style={styles.detailText}>📍 {item.city}</Text>}
          {item.latitude != null && item.longitude != null && (
            <Text style={styles.coordsText}>
              {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
            </Text>
          )}
          {!!item.skill_level && <Text style={styles.detailText}>🏐 {item.skill_level}</Text>}
          <Text style={styles.rosterText}>{item.rsvp_count} going · Tap for Home</Text>
        </View>
      )}
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: colors.textMuted },
  listContent: { padding: 20, maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  matchTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  detailText: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  coordsText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rosterText: { fontSize: 13, fontWeight: '600', color: colors.blue, marginTop: 8 },
});
