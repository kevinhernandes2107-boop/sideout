import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, ApiError } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';

interface MatchHost {
  id: number;
  username: string;
  pfp?: string | null;
}

interface Match {
  id: number;
  title: string;
  city?: string | null;
  address?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  skill_level?: string | null;
  max_players?: number | null;
  recurrence?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  host: MatchHost;
  rsvp_count: number;
  going: boolean;
  waitlist_count: number;
  on_waitlist: boolean;
}

const SKILL_FILTERS = ['All', 'Beginner', 'Intermediate', 'Advanced', 'Competitive'];
const SCOPE_FILTERS: { key: 'all' | 'hosting' | 'going' | 'nearby'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'hosting', label: 'Hosting' },
  { key: 'going', label: 'Going' },
  { key: 'nearby', label: 'Nearby' },
];

const EARTH_RADIUS_MILES = 3958.8;

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isToday(start?: string | null): boolean {
  if (!start) return false;
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function formatTimeRange(start?: string | null, end?: string | null) {
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;

  const datePart = isToday(start)
    ? 'Today'
    : startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const startTimePart = startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const endDate = end ? new Date(end) : null;
  if (endDate && !Number.isNaN(endDate.getTime())) {
    const endTimePart = endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${datePart} · ${startTimePart} – ${endTimePart}`;
  }
  return `${datePart} · ${startTimePart}`;
}

type HomeListItem =
  | { kind: 'header'; key: string; count: number }
  | { kind: 'match'; key: string; match: Match };

export default function TabHomeScreen() {
  const router = useRouter();
  const { user, userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [scope, setScope] = useState<'all' | 'hosting' | 'going' | 'nearby'>('all');
  const [skillFilter, setSkillFilter] = useState('All');
  const [citySearch, setCitySearch] = useState('');
  const [rsvpingId, setRsvpingId] = useState<number | null>(null);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const fetchMatches = useCallback(async () => {
    try {
      const data = await apiFetch<Match[]>('/api/matches', { token: userToken });
      setMatches(data);
    } catch (error) {
      console.warn('Failed to load matches:', (error as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userToken]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const notifs = await apiFetch<{ read: boolean }[]>('/api/notifications', { token: userToken });
      setUnreadCount(notifs.filter((n) => !n.read).length);
    } catch (error) {
      console.warn('Failed to load notifications:', (error as Error).message);
    }
  }, [userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchMatches();
      fetchUnreadCount();
    }, [fetchMatches, fetchUnreadCount])
  );

  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status !== 'granted') return null;
        return Location.getCurrentPositionAsync({});
      })
      .then((position) => {
        if (position) setMyLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      })
      .catch((error) => console.warn('Failed to get current location:', error.message));
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMatches();
  };

  const toggleRsvp = async (match: Match) => {
    setRsvpingId(match.id);
    try {
      const updated = await apiFetch<Match>(`/api/matches/${match.id}/rsvp`, {
        method: match.going || match.on_waitlist ? 'DELETE' : 'POST',
        token: userToken,
      });
      setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not update RSVP.';
      Alert.alert('RSVP Failed', message);
    } finally {
      setRsvpingId(null);
    }
  };

  const distanceFor = useCallback(
    (m: Match): number | null => {
      if (!myLocation || m.latitude == null || m.longitude == null) return null;
      return distanceMiles(myLocation.latitude, myLocation.longitude, m.latitude, m.longitude);
    },
    [myLocation]
  );

  const filteredMatches = useMemo(() => {
    const filtered = matches.filter((m) => {
      if (scope === 'hosting' && m.host.id !== user?.id) return false;
      if (scope === 'going' && !m.going) return false;
      if (skillFilter !== 'All' && m.skill_level !== skillFilter) return false;
      if (citySearch.trim() && !(m.city || '').toLowerCase().includes(citySearch.trim().toLowerCase())) return false;
      return true;
    });

    if (scope === 'nearby') {
      return [...filtered].sort((a, b) => {
        const da = distanceFor(a);
        const db = distanceFor(b);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      });
    }
    return filtered;
  }, [matches, scope, skillFilter, citySearch, user?.id, distanceFor]);

  const homeListData = useMemo<HomeListItem[]>(() => {
    const todayMatches = filteredMatches.filter((m) => isToday(m.start_time));
    const otherMatches = filteredMatches.filter((m) => !isToday(m.start_time));

    const items: HomeListItem[] = [];
    if (todayMatches.length > 0) {
      items.push({ kind: 'header', key: 'today-header', count: todayMatches.length });
      todayMatches.forEach((m) => items.push({ kind: 'match', key: String(m.id), match: m }));
    }
    otherMatches.forEach((m) => items.push({ kind: 'match', key: String(m.id), match: m }));
    return items;
  }, [filteredMatches]);

  const renderMatch = ({ item }: { item: Match }) => {
    const when = formatTimeRange(item.start_time, item.end_time);
    const isFull = !!item.max_players && item.rsvp_count >= item.max_players && !item.going;
    const distance = distanceFor(item);
    const today = isToday(item.start_time);

    return (
      <TouchableOpacity
        style={[styles.card, today && styles.cardToday]}
        onPress={() => router.push(`/match/${item.id}`)}
        activeOpacity={0.85}
      >
        <View style={styles.cardTitleRow}>
          <Text style={styles.matchTitle}>{item.title}</Text>
          {!!item.recurrence && (
            <View style={styles.recurrenceBadge}>
              <MaterialIcons name="repeat" size={11} color={colors.navy} />
              <Text style={styles.recurrenceText}>{item.recurrence}</Text>
            </View>
          )}
        </View>
        <Text style={styles.hostText}>Hosted by @{item.host.username}</Text>

        {when && (
          <View style={styles.detailRow}>
            <MaterialIcons name="event" size={14} color={colors.blue} />
            <Text style={styles.detailText}>{when}</Text>
          </View>
        )}
        {!!(item.address || item.city) && (
          <View style={styles.detailRow}>
            <MaterialIcons name="place" size={14} color={colors.blue} />
            <Text style={styles.detailText}>
              {[item.address, item.city].filter(Boolean).join(', ')}
              {distance != null ? ` · ${distance.toFixed(1)} mi` : ''}
            </Text>
          </View>
        )}
        {!!item.skill_level && (
          <View style={styles.detailRow}>
            <MaterialIcons name="sports-volleyball" size={14} color={colors.blue} />
            <Text style={styles.detailText}>{item.skill_level}</Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.rosterText}>
            {item.rsvp_count}
            {item.max_players ? ` / ${item.max_players}` : ''} going
            {item.waitlist_count > 0 ? ` · ${item.waitlist_count} waiting` : ''}
          </Text>
          {item.host.id === user?.id ? (
            <View style={styles.hostingPill}>
              <Text style={styles.hostingPillText}>Hosting</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.rsvpButton, (item.going || item.on_waitlist) && styles.rsvpButtonActive]}
              onPress={() => toggleRsvp(item)}
              disabled={rsvpingId === item.id}
            >
              {rsvpingId === item.id ? (
                <ActivityIndicator size="small" color={item.going || item.on_waitlist ? '#fff' : colors.blue} />
              ) : (
                <Text
                  style={[
                    styles.rsvpButtonText,
                    (item.going || item.on_waitlist) && styles.rsvpButtonTextActive,
                  ]}
                >
                  {item.on_waitlist ? 'Leave Waitlist' : item.going ? "I'm Out" : isFull ? 'Join Waitlist' : "I'm In"}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialIcons name="sports-volleyball" size={22} color={colors.blue} />
          <Text style={styles.headerTitle}>Open Matches</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.bellButton} onPress={() => router.push('/notifications')}>
            <MaterialIcons name="notifications-none" size={22} color={colors.text} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileBadge} onPress={() => router.push('/profile')}>
            {user?.pfp ? (
              <Image source={{ uri: user.pfp }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarFallback}>🏐</Text>
            )}
            <Text style={styles.profileName}>{user?.username || 'Player'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.scopeRow}>
          {SCOPE_FILTERS.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.scopeChip, scope === s.key && styles.scopeChipActive]}
              onPress={() => setScope(s.key)}
            >
              <Text style={[styles.scopeChipText, scope === s.key && styles.scopeChipTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
          <TextInput
            style={styles.citySearch}
            placeholder="Search city..."
            placeholderTextColor={colors.textMuted}
            value={citySearch}
            onChangeText={setCitySearch}
          />
        </View>
        <FlatList
          data={SKILL_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => s}
          contentContainerStyle={{ paddingVertical: 4 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              style={[styles.skillChip, skillFilter === s && styles.skillChipActive]}
              onPress={() => setSkillFilter(s)}
            >
              <Text style={[styles.skillChipText, skillFilter === s && styles.skillChipTextActive]}>{s}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={homeListData}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <View style={styles.todayHeader}>
                <View style={styles.todayHeaderBadge}>
                  <MaterialIcons name="bolt" size={14} color={colors.navy} />
                  <Text style={styles.todayHeaderText}>TODAY</Text>
                </View>
                <Text style={styles.todayHeaderCount}>
                  {item.count} {item.count === 1 ? 'match' : 'matches'}
                </Text>
                <View style={styles.todayHeaderLine} />
              </View>
            ) : (
              renderMatch({ item: item.match })
            )
          }
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <MaterialIcons name="sports-volleyball" size={44} color={colors.textMuted} />
              <Text style={styles.emptyText}>No matches match your filters. Be the first to host one!</Text>
            </View>
          }
        />
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
    paddingVertical: 12,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginLeft: 6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarImage: { width: 24, height: 24, borderRadius: 12, marginRight: 6 },
  avatarFallback: { fontSize: 16, marginRight: 6 },
  profileName: { fontSize: 13, fontWeight: '600', color: colors.text },
  filterSection: { paddingHorizontal: 20, marginBottom: 4 },
  scopeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  scopeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scopeChipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  scopeChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  scopeChipTextActive: { color: '#fff' },
  citySearch: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    color: colors.text,
  },
  skillChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: colors.surface,
  },
  skillChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  skillChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  skillChipTextActive: { color: colors.navy },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  listContent: { padding: 20, paddingTop: 8 },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 2,
    gap: 8,
  },
  todayHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 3,
  },
  todayHeaderText: { fontSize: 12, fontWeight: '800', color: colors.navy, letterSpacing: 0.5 },
  todayHeaderCount: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  todayHeaderLine: { flex: 1, height: 1, backgroundColor: colors.border },
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
  cardToday: {
    borderLeftColor: colors.blue,
    borderColor: colors.blue,
    backgroundColor: `${colors.blue}0C`,
    shadowOpacity: 0.1,
  },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  matchTitle: { fontSize: 17, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  recurrenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFC72C30',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  recurrenceText: { fontSize: 10, fontWeight: '700', color: colors.navy, marginLeft: 2 },
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
  rosterText: { fontSize: 12, fontWeight: '600', color: colors.textMuted, flex: 1 },
  hostingPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.border },
  hostingPillText: { fontSize: 11, fontWeight: '700', color: colors.text },
  rsvpButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 92,
    alignItems: 'center',
    backgroundColor: colors.border,
  },
  rsvpButtonActive: { backgroundColor: colors.danger },
  rsvpButtonText: { fontSize: 12, fontWeight: '700', color: colors.text },
  rsvpButtonTextActive: { color: '#fff' },
});
