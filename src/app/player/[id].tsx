import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, ApiError } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';
import { RatingSummary } from '../../components/StarRating';

interface Player {
  id: number;
  username: string;
  pfp?: string | null;
  bio?: string | null;
  position?: string | null;
  skill_level?: string | null;
  city?: string | null;
}

interface RatingInfo {
  average: number | null;
  count: number;
}

interface PlayerStats {
  matches_hosted: number;
  matches_played: number;
  tournaments_won: number;
}

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [rating, setRating] = useState<RatingInfo>({ average: null, count: 0 });
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blockBusy, setBlockBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [playerData, ratingData, statsData, blockedList] = await Promise.all([
        apiFetch<Player>(`/api/users/${id}`, { token: userToken }),
        apiFetch<RatingInfo>(`/api/users/${id}/rating-summary`, { token: userToken }),
        apiFetch<PlayerStats>(`/api/users/${id}/stats`, { token: userToken }),
        apiFetch<{ user: { id: number } }[]>('/api/blocked-users', { token: userToken }),
      ]);
      setPlayer(playerData);
      setRating(ratingData);
      setStats(statsData);
      setIsBlocked(blockedList.some((b) => String(b.user.id) === String(id)));
    } catch (error) {
      console.warn('Failed to load player:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, userToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleBlock = async () => {
    setBlockBusy(true);
    try {
      await apiFetch(`/api/users/${id}/block`, { method: isBlocked ? 'DELETE' : 'POST', token: userToken });
      setIsBlocked(!isBlocked);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not update block status.';
      Alert.alert('Error', message);
    } finally {
      setBlockBusy(false);
    }
  };

  const submitReport = async () => {
    if (!reportReason.trim()) {
      Alert.alert('Error', 'Describe the issue before submitting.');
      return;
    }
    setReportBusy(true);
    try {
      await apiFetch(`/api/users/${id}/report`, { method: 'POST', token: userToken, body: { reason: reportReason.trim() } });
      setReportReason('');
      setShowReport(false);
      Alert.alert('Thanks', 'Report submitted.');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not submit report.';
      Alert.alert('Error', message);
    } finally {
      setReportBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  if (!player) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Player not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {player.pfp ? (
        <Image source={{ uri: player.pfp }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarFallbackText}>🏐</Text>
        </View>
      )}
      <Text style={styles.username}>@{player.username}</Text>
      {!!(player.position || player.skill_level) && (
        <Text style={styles.meta}>{[player.position, player.skill_level].filter(Boolean).join(' · ')}</Text>
      )}
      {!!player.city && <Text style={styles.meta}>{player.city}</Text>}
      {rating.count > 0 && (
        <View style={styles.ratingRow}>
          <RatingSummary average={rating.average} count={rating.count} size={16} />
        </View>
      )}
      {!!player.bio && <Text style={styles.bio}>{player.bio}</Text>}

      {!!stats && (
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{stats.matches_hosted}</Text>
            <Text style={styles.statLabel}>Hosted</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{stats.matches_played}</Text>
            <Text style={styles.statLabel}>Played</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{stats.tournaments_won}</Text>
            <Text style={styles.statLabel}>{stats.tournaments_won === 1 ? 'Title' : 'Titles'}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.messageButton} onPress={() => router.push(`/chat/${player.id}`)}>
        <Text style={styles.messageButtonText}>Message</Text>
      </TouchableOpacity>

      <View style={styles.secondaryRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={toggleBlock} disabled={blockBusy}>
          <MaterialIcons name={isBlocked ? 'lock-open' : 'block'} size={16} color={colors.danger} />
          <Text style={styles.secondaryButtonText}>{isBlocked ? 'Unblock' : 'Block'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowReport((v) => !v)}>
          <MaterialIcons name="flag" size={16} color={colors.textMuted} />
          <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>Report</Text>
        </TouchableOpacity>
      </View>

      {showReport && (
        <View style={styles.reportBox}>
          <TextInput
            style={styles.reportInput}
            value={reportReason}
            onChangeText={setReportReason}
            placeholder="What's going on?"
            placeholderTextColor="#999"
            multiline
          />
          <TouchableOpacity style={styles.reportSubmit} onPress={submitReport} disabled={reportBusy}>
            <Text style={styles.reportSubmitText}>{reportBusy ? 'Submitting...' : 'Submit Report'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', padding: 24, paddingTop: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  emptyText: { fontSize: 15, color: colors.textMuted },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16 },
  avatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    backgroundColor: '#0057B815',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: { fontSize: 44 },
  username: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  ratingRow: { marginTop: 8 },
  bio: { fontSize: 14, color: colors.textMuted, marginTop: 16, textAlign: 'center' },
  statsRow: { flexDirection: 'row', marginTop: 20, gap: 10, width: '100%' },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.navy },
  statLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
  messageButton: {
    marginTop: 28,
    backgroundColor: colors.blue,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  messageButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  secondaryRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '600', color: colors.danger, marginLeft: 4 },
  reportBox: { width: '100%', marginTop: 16, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 },
  reportInput: { minHeight: 60, fontSize: 14, color: colors.text, textAlignVertical: 'top' },
  reportSubmit: { marginTop: 10, backgroundColor: colors.navy, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  reportSubmitText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
