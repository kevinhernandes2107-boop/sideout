import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../constants/api';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

interface PreferencesResponse {
  muted_types: string[];
}

interface NotificationTypeDef {
  key: string;
  label: string;
}

const SECTIONS: { title: string; types: NotificationTypeDef[] }[] = [
  {
    title: 'Matches',
    types: [
      { key: 'rsvp', label: 'Someone RSVPs to your match' },
      { key: 'waitlist_promoted', label: "You're promoted off a waitlist" },
      { key: 'match_message', label: 'New match chat messages' },
      { key: 'match_cancelled', label: 'A match you joined gets cancelled' },
      { key: 'match_reminder', label: 'Match starting soon reminders' },
    ],
  },
  {
    title: 'Messages',
    types: [{ key: 'direct_message', label: 'New direct messages' }],
  },
  {
    title: 'Tournaments',
    types: [
      { key: 'team_message', label: 'New tournament team chat messages' },
      { key: 'tournament_team_joined', label: 'Someone joins your tournament team' },
      { key: 'tournament_started', label: 'Your tournament bracket/schedule is set' },
      { key: 'tournament_next_match', label: 'Your next tournament opponent is set' },
      { key: 'tournament_result', label: 'Tournament match results' },
      { key: 'tournament_completed', label: 'Tournament finishes' },
    ],
  },
];

export default function NotificationSettingsScreen() {
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      const data = await apiFetch<PreferencesResponse>('/api/notification-preferences', { token: userToken });
      setMuted(new Set(data.muted_types));
    } catch (error) {
      console.warn('Failed to load notification preferences:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchPreferences();
    }, [fetchPreferences])
  );

  const handleToggle = async (key: string, enabled: boolean) => {
    const next = new Set(muted);
    if (enabled) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setMuted(next);
    setSavingKey(key);
    try {
      await apiFetch<PreferencesResponse>('/api/notification-preferences', {
        method: 'PUT',
        token: userToken,
        body: { muted_types: Array.from(next) },
      });
    } catch (error) {
      console.warn('Failed to save notification preferences:', (error as Error).message);
      setMuted(muted);
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>Turn off any notification you don't want to receive, in-app or as a push.</Text>
      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.card}>
            {section.types.map((t, i) => (
              <View key={t.key} style={[styles.row, i < section.types.length - 1 && styles.rowDivider]}>
                <Text style={styles.rowLabel}>{t.label}</Text>
                <Switch
                  value={!muted.has(t.key)}
                  onValueChange={(enabled) => handleToggle(t.key, enabled)}
                  disabled={savingKey === t.key}
                  trackColor={{ false: colors.border, true: colors.blue }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: 18, lineHeight: 18 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { flex: 1, fontSize: 14, color: colors.text },
});
