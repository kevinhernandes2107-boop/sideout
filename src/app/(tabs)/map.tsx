import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';
import MatchesMap, { type MapMatch } from '../../components/MatchesMap';

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const FALLBACK_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 30,
  longitudeDelta: 30,
};

export default function MapScreen() {
  const router = useRouter();
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [matches, setMatches] = useState<MapMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  const [locating, setLocating] = useState(false);

  const fetchMatches = useCallback(async () => {
    try {
      const data = await apiFetch<MapMatch[]>('/api/matches', { token: userToken });
      setMatches(data.filter((m) => m.latitude != null && m.longitude != null));
    } catch (error) {
      console.warn('Failed to load matches:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchMatches();
    }, [fetchMatches])
  );

  const centerOnMe = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({});
      setRegion({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
    } catch (error) {
      console.warn('Failed to get current location:', (error as Error).message);
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    centerOnMe();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialIcons name="place" size={22} color={colors.blue} />
          <Text style={styles.headerTitle}>Match Map</Text>
        </View>
        <TouchableOpacity style={styles.locateButton} onPress={centerOnMe} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.blue} />
          ) : (
            <MaterialIcons name="my-location" size={20} color={colors.blue} />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <View style={styles.mapArea}>
          <MatchesMap
            matches={matches}
            region={region}
            onRegionChange={setRegion}
            onSelectMatch={() => router.push('/(tabs)')}
          />
          {matches.length === 0 && (
            <View style={styles.overlayHint}>
              <Text style={styles.overlayHintText}>No hosted matches have a location pinned yet.</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginLeft: 6 },
  locateButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  mapArea: { flex: 1 },
  overlayHint: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  overlayHintText: { fontSize: 13, color: colors.textMuted },
});
