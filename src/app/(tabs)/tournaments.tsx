import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';

interface TournamentHost {
  id: number;
  username: string;
}

interface Tournament {
  id: number;
  title: string;
  city?: string | null;
  format: 'single_elim' | 'round_robin';
  skill_level?: string | null;
  start_date?: string | null;
  team_size: number;
  max_teams?: number | null;
  status: 'registration' | 'in_progress' | 'completed';
  host: TournamentHost;
  team_count: number;
}

const FORMAT_LABELS: Record<string, string> = {
  single_elim: 'Single Elim',
  round_robin: 'Round Robin',
};

const STATUS_LABELS: Record<string, string> = {
  registration: 'Registering',
  in_progress: 'In Progress',
  completed: 'Completed',
};

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TournamentsScreen() {
  const router = useRouter();
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTournaments = useCallback(async () => {
    try {
      const data = await apiFetch<Tournament[]>('/api/tournaments', { token: userToken });
      setTournaments(data);
    } catch (error) {
      console.warn('Failed to load tournaments:', (error as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchTournaments();
    }, [fetchTournaments])
  );

  const renderTournament = ({ item }: { item: Tournament }) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/tournament/${item.id}`)} activeOpacity={0.85}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.title}>{item.title}</Text>
        <View style={[styles.statusPill, item.status === 'registration' && styles.statusPillOpen]}>
          <Text style={[styles.statusPillText, item.status === 'registration' && styles.statusPillTextOpen]}>
            {STATUS_LABELS[item.status]}
          </Text>
        </View>
      </View>
      <Text style={styles.hostText}>Hosted by @{item.host.username}</Text>

      <View style={styles.detailRow}>
        <MaterialIcons name="emoji-events" size={14} color={colors.blue} />
        <Text style={styles.detailText}>{FORMAT_LABELS[item.format]}</Text>
      </View>
      {formatDate(item.start_date) && (
        <View style={styles.detailRow}>
          <MaterialIcons name="event" size={14} color={colors.blue} />
          <Text style={styles.detailText}>{formatDate(item.start_date)}</Text>
        </View>
      )}
      {!!item.city && (
        <View style={styles.detailRow}>
          <MaterialIcons name="place" size={14} color={colors.blue} />
          <Text style={styles.detailText}>{item.city}</Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.teamsText}>
          {item.team_count}
          {item.max_teams ? ` / ${item.max_teams}` : ''} teams
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialIcons name="emoji-events" size={22} color={colors.blue} />
          <Text style={styles.headerTitle}>Tournaments</Text>
        </View>
        <TouchableOpacity style={styles.hostButton} onPress={() => router.push('/tournament/create')}>
          <MaterialIcons name="add" size={18} color="#fff" />
          <Text style={styles.hostButtonText}>Host</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTournament}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchTournaments();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <MaterialIcons name="emoji-events" size={44} color={colors.textMuted} />
              <Text style={styles.emptyText}>No tournaments yet. Host the first one!</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginLeft: 6 },
    hostButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.blue,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    hostButtonText: { color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 3 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
    emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
    listContent: { padding: 20, paddingTop: 8 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderLeftWidth: 4,
      borderLeftColor: colors.gold,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    title: { fontSize: 17, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
    hostText: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 8 },
    detailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
    detailText: { fontSize: 13, color: colors.text, marginLeft: 6 },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    teamsText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    statusPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.border },
    statusPillOpen: { backgroundColor: colors.blue },
    statusPillText: { fontSize: 11, fontWeight: '700', color: colors.text },
    statusPillTextOpen: { color: '#fff' },
  });
