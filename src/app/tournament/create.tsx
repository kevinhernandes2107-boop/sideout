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
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, ApiError } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';
import HostMapPicker from '../../components/HostMapPicker';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import SimpleDatePicker from '../../components/SimpleDatePicker';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface Region extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

const SKILL_LEVELS = ['All Levels', 'Beginner', 'Intermediate', 'Advanced', 'Competitive'];
const FORMATS: { key: 'single_elim' | 'round_robin'; label: string; hint: string }[] = [
  { key: 'single_elim', label: 'Single Elimination', hint: 'Lose once, you\'re out. A bracket with a champion.' },
  { key: 'round_robin', label: 'Round Robin', hint: 'Everyone plays everyone, ranked by record.' },
];
const TEAM_COUNT_PRESETS = [4, 8, 16];
const TEAM_SIZE_PRESETS = [2, 4, 6];

const FALLBACK_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 30,
  longitudeDelta: 30,
};

export default function CreateTournamentScreen() {
  const router = useRouter();
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<'single_elim' | 'round_robin'>('single_elim');
  const [teamCount, setTeamCount] = useState('8');
  const [teamSize, setTeamSize] = useState('6');
  const [skillLevel, setSkillLevel] = useState('All Levels');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [hasRealLocation, setHasRealLocation] = useState(false);

  const goToCurrentLocation = async (dropPin: boolean) => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
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
      Alert.alert('Missing Title', 'Give your tournament a title.');
      return;
    }
    const parsedTeamCount = Number(teamCount);
    if (!parsedTeamCount || parsedTeamCount < 2) {
      Alert.alert('Invalid Team Count', 'Enter how many teams can register (at least 2).');
      return;
    }
    const parsedTeamSize = Number(teamSize);
    if (!parsedTeamSize || parsedTeamSize < 1) {
      Alert.alert('Invalid Team Size', 'Enter how many players make up a full team.');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/api/tournaments', {
        method: 'POST',
        token: userToken,
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          city: city.trim() || undefined,
          address: address.trim() || undefined,
          latitude: pin?.latitude,
          longitude: pin?.longitude,
          format,
          skill_level: skillLevel,
          start_date: startDate ? startDate.toISOString() : undefined,
          team_size: parsedTeamSize,
          max_teams: parsedTeamCount,
        },
      });

      Alert.alert('Success', 'Tournament created!', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/tournaments') },
      ]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not create the tournament.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Summer Smash Tournament"
          placeholderTextColor="#999"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Rules, what to bring, anything players should know"
          placeholderTextColor="#999"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Format</Text>
        {FORMATS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.formatCard, format === f.key && styles.formatCardSelected]}
            onPress={() => setFormat(f.key)}
          >
            <Text style={[styles.formatLabel, format === f.key && styles.formatLabelSelected]}>{f.label}</Text>
            <Text style={[styles.formatHint, format === f.key && styles.formatHintSelected]}>{f.hint}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Number of Teams *</Text>
        <Text style={styles.hint}>How many teams can register for this tournament?</Text>
        <View style={styles.pillRow}>
          {TEAM_COUNT_PRESETS.map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.pill, teamCount === String(n) && styles.pillSelected]}
              onPress={() => setTeamCount(String(n))}
            >
              <Text style={[styles.pillText, teamCount === String(n) && styles.pillTextSelected]}>{n} teams</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Or enter a custom number"
          placeholderTextColor="#999"
          value={teamCount}
          onChangeText={setTeamCount}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Players per Team</Text>
        <View style={styles.pillRow}>
          {TEAM_SIZE_PRESETS.map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.pill, teamSize === String(n) && styles.pillSelected]}
              onPress={() => setTeamSize(String(n))}
            >
              <Text style={[styles.pillText, teamSize === String(n) && styles.pillTextSelected]}>{n}v{n}</Text>
            </TouchableOpacity>
          ))}
          <TextInput
            style={[styles.input, styles.teamSizeInput]}
            placeholder="Custom"
            placeholderTextColor="#999"
            value={teamSize}
            onChangeText={setTeamSize}
            keyboardType="number-pad"
          />
        </View>

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

        <Text style={styles.label}>Start Date</Text>
        <SimpleDatePicker value={startDate} onChange={setStartDate} label="start date" />

        <Text style={styles.label}>Address</Text>
        <AddressAutocomplete
          value={address}
          onChangeText={setAddress}
          placeholder="Start typing an address or venue..."
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
        <HostMapPicker region={region} pin={pin} onRegionChange={setRegion} onPick={setPin} />

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleCreate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Tournament</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    form: { padding: 20, paddingBottom: 40 },
    label: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginBottom: 6, marginTop: 16 },
    hint: { fontSize: 12, color: colors.textMuted, marginBottom: 8, marginTop: -4 },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.text,
    },
    multilineInput: { minHeight: 70, textAlignVertical: 'top' },
    teamSizeInput: { width: 90, marginBottom: 8 },
    formatCard: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
    },
    formatCardSelected: { borderColor: colors.blue, backgroundColor: `${colors.blue}15` },
    formatLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
    formatLabelSelected: { color: colors.blue },
    formatHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    formatHintSelected: { color: colors.text },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
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
    mapLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    mapLinkText: { color: colors.blue, fontSize: 13, fontWeight: '600' },
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
