import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../constants/api';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

const POSITIONS = ['Setter', 'Outside', 'Middle', 'Opposite', 'Libero', 'DS'];
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Competitive'];

export default function OnboardingScreen() {
  const router = useRouter();
  const { updateProfile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [position, setPosition] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      await updateProfile({
        position: position || undefined,
        skill_level: skillLevel || undefined,
        city: city.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      router.replace('/(tabs)');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not save your profile.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const skip = () => router.replace('/(tabs)');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Welcome! 🏐</Text>
      <Text style={styles.subtitle}>
        Tell other players a bit about yourself — you can always change this later from your profile.
      </Text>

      <Text style={styles.label}>Position</Text>
      <View style={styles.pillRow}>
        {POSITIONS.map((p) => (
          <TouchableOpacity key={p} style={[styles.pill, position === p && styles.pillSelected]} onPress={() => setPosition(p)}>
            <Text style={[styles.pillText, position === p && styles.pillTextSelected]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Skill Level</Text>
      <View style={styles.pillRow}>
        {SKILL_LEVELS.map((s) => (
          <TouchableOpacity key={s} style={[styles.pill, skillLevel === s && styles.pillSelected]} onPress={() => setSkillLevel(s)}>
            <Text style={[styles.pillText, skillLevel === s && styles.pillTextSelected]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>City</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Winston-Salem"
        placeholderTextColor="#999"
        value={city}
        onChangeText={setCity}
      />

      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[styles.input, styles.multilineInput]}
        placeholder="Tell other players about yourself"
        placeholderTextColor="#999"
        value={bio}
        onChangeText={setBio}
        multiline
      />

      <TouchableOpacity style={styles.finishButton} onPress={finish} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.finishButtonText}>Finish</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipButton} onPress={skip} disabled={saving}>
        <Text style={styles.skipButtonText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
    title: { fontSize: 26, fontWeight: 'bold', color: colors.text, marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 28, textAlign: 'center', lineHeight: 20 },
    label: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginBottom: 6, marginTop: 16 },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.text,
    },
    multilineInput: { minHeight: 80, textAlignVertical: 'top' },
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
    finishButton: {
      backgroundColor: colors.blue,
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 28,
    },
    finishButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    skipButton: { marginTop: 16, alignItems: 'center' },
    skipButtonText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  });
