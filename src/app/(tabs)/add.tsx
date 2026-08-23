import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, ApiError } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';
import HostMapPicker from '../../components/HostMapPicker';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import MatchScheduler, { type Recurrence, type ScheduledOccurrence } from '../../components/MatchScheduler';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface Region extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

const SKILL_LEVELS = ['All Levels', 'Beginner', 'Intermediate', 'Advanced', 'Competitive'];
const RECURRENCE_OPTIONS: Recurrence[] = ['None', 'Weekly', 'Biweekly'];

const FALLBACK_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 30,
  longitudeDelta: 30,
};

export default function AddScreen() {
  const router = useRouter();
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>('None');
  const [occurrences, setOccurrences] = useState<ScheduledOccurrence[]>([]);
  const [skillLevel, setSkillLevel] = useState('All Levels');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [loading, setLoading] = useState(false);

  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [hasRealLocation, setHasRealLocation] = useState(false);

  const goToCurrentLocation = async (dropPin: boolean) => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Unavailable', 'Enable location access to center the map on you.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setRegion({ ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 });
      setHasRealLocation(true);
      if (dropPin) setPin(coords);
    } catch (error) {
      console.warn('Failed to get current location:', (error as Error).message);
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    goToCurrentLocation(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Give your match a title.');
      return;
    }
    if (occurrences.some((o) => o.endTime && o.endTime <= o.startTime)) {
      Alert.alert('Invalid Time', 'End time must be after the start time.');
      return;
    }

    const sharedBody = {
      title: title.trim(),
      city: city.trim() || undefined,
      address: address.trim() || undefined,
      skill_level: skillLevel,
      max_players: maxPlayers.trim() ? Number(maxPlayers.trim()) : undefined,
      latitude: pin?.latitude,
      longitude: pin?.longitude,
      recurrence: recurrence === 'None' ? undefined : recurrence,
    };

    setLoading(true);
    try {
      const isRecurring = recurrence !== 'None' && occurrences.length > 0;

      if (occurrences.length === 0) {
        await apiFetch('/api/matches', { method: 'POST', token: userToken, body: sharedBody });
      } else {
        for (const occurrence of occurrences) {
          await apiFetch(isRecurring ? '/api/matches/series' : '/api/matches', {
            method: 'POST',
            token: userToken,
            body: {
              ...sharedBody,
              start_time: occurrence.startTime.toISOString(),
              end_time: occurrence.endTime ? occurrence.endTime.toISOString() : undefined,
            },
          });
        }
      }

      setTitle('');
      setCity('');
      setAddress('');
      setSkillLevel('All Levels');
      setMaxPlayers('');
      setPin(null);
      setRecurrence('None');
      setOccurrences([]);

      const message = isRecurring
        ? `${occurrences.length > 1 ? `${occurrences.length} recurring slots` : 'Your recurring slot'} created — new matches will keep appearing automatically. Cancel anytime from My Recurring Matches.`
        : occurrences.length > 1
        ? `${occurrences.length} matches created!`
        : 'Match created!';
      Alert.alert('Success', message, [{ text: 'OK', onPress: () => router.push('/(tabs)') }]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not create the match.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.header}>Host a Match</Text>
          <Text style={styles.subheader}>Fill in the details and other players can find and join.</Text>

          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sunday Open Gym"
            placeholderTextColor="#999"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Recurrence</Text>
          <View style={styles.pillRow}>
            {RECURRENCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.pill, recurrence === opt && styles.pillSelected]}
                onPress={() => setRecurrence(opt)}
              >
                <Text style={[styles.pillText, recurrence === opt && styles.pillTextSelected]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <MatchScheduler
            recurrence={recurrence}
            multiDay
            initialStartTime={null}
            initialEndTime={null}
            onChange={setOccurrences}
          />

          <Text style={styles.label}>Address</Text>
          <AddressAutocomplete
            value={address}
            onChangeText={setAddress}
            placeholder="Start typing an address or place..."
            near={hasRealLocation ? { latitude: region.latitude, longitude: region.longitude } : null}
            onSelect={(result) => {
              setAddress(result.address);
              setCity(result.city);
              const coords = { latitude: result.latitude, longitude: result.longitude };
              setPin(coords);
              setRegion({ ...coords, latitudeDelta: 0.02, longitudeDelta: 0.02 });
            }}
          />

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Winston-Salem"
            placeholderTextColor="#999"
            value={city}
            onChangeText={setCity}
          />

          <View style={styles.mapLabelRow}>
            <Text style={styles.label}>Location on Map</Text>
            <TouchableOpacity onPress={() => goToCurrentLocation(true)} disabled={locating}>
              <Text style={styles.mapLinkText}>{locating ? 'Locating...' : 'Use my location'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.mapHint}>Tap the map to drop a pin at the exact spot.</Text>
          <HostMapPicker region={region} pin={pin} onRegionChange={setRegion} onPick={setPin} />

          <Text style={styles.label}>Max Players</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 12"
            placeholderTextColor="#999"
            value={maxPlayers}
            onChangeText={setMaxPlayers}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Skill Level</Text>
          <View style={styles.pillRow}>
            {SKILL_LEVELS.map((level) => (
              <TouchableOpacity
                key={level}
                style={[styles.pill, skillLevel === level && styles.pillSelected]}
                onPress={() => setSkillLevel(level)}
              >
                <Text style={[styles.pillText, skillLevel === level && styles.pillTextSelected]}>{level}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Match</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  form: { padding: 20, paddingBottom: 40 },
  header: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  subheader: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
  mapLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 2,
  },
  mapLinkText: { color: colors.blue, fontSize: 13, fontWeight: '600' },
  mapHint: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
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
  button: {
    backgroundColor: colors.blue,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
