import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Callout, Marker, type Region } from 'react-native-maps';
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

interface MatchesMapProps {
  matches: MapMatch[];
  region: Region;
  onRegionChange: (region: Region) => void;
  onSelectMatch: () => void;
}

export default function MatchesMap({ matches, region, onRegionChange, onSelectMatch }: MatchesMapProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <MapView style={styles.map} region={region} onRegionChangeComplete={onRegionChange} showsUserLocation>
      {matches.map((match) => (
        <Marker
          key={match.id}
          coordinate={{ latitude: match.latitude as number, longitude: match.longitude as number }}
          pinColor={colors.gold}
          onCalloutPress={onSelectMatch}
        >
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{match.title}</Text>
              <Text style={styles.calloutText}>Hosted by @{match.host.username}</Text>
              {!!match.city && <Text style={styles.calloutText}>{match.city}</Text>}
              {!!match.skill_level && <Text style={styles.calloutText}>{match.skill_level}</Text>}
              <Text style={styles.calloutLink}>{match.rsvp_count} going · View on Home</Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  map: { flex: 1 },
  callout: { minWidth: 160, padding: 4 },
  calloutTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  calloutText: { fontSize: 12, color: colors.textMuted },
  calloutLink: { fontSize: 12, color: colors.blue, fontWeight: '600', marginTop: 4 },
});
