import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import ChatModal from './ChatModal';

const HOST_IP = '192.168.1.56';

export interface Gym {
  id: string;
  name: string;
  address?: string;
  city?: string;
  level?: string;
  price?: string;
  comments_count?: number;
}

interface HomeScreenProps {
  user?: {
    name?: string;
    identifier?: string;
  } | null;
}

export default function HomeScreen({ user }: HomeScreenProps) {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);

  // Profile State
  const username = user?.name || user?.identifier || 'Player';
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fetchGyms = async () => {
    try {
      const res = await fetch(`http://${HOST_IP}:8000/gyms`);
      const data: Gym[] = await res.json();
      setGyms(data);
    } catch (err) {
      console.error('Failed to load gyms:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGyms();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchGyms();
  };

  const renderGymItem = ({ item }: { item: Gym }) => {
    const isFree = item.price?.toLowerCase() === 'free';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setSelectedGym(item)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.gymName}>{item.name}</Text>
          {item.price && (
            <View
              style={[
                styles.priceBadge,
                { backgroundColor: isFree ? '#E30613' : '#0033A0' },
              ]}
            >
              <Text style={styles.priceText}>{item.price}</Text>
            </View>
          )}
        </View>

        {/* Location Details */}
        {(item.address || item.city) && (
          <View style={styles.detailRow}>
            <MaterialIcons name="location-on" size={16} color="#E30613" />
            <Text style={styles.locationText}>
              {[item.address, item.city].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}

        {/* Skill Level Badge */}
        {item.level && (
          <View style={styles.detailRow}>
            <MaterialIcons name="fitness-center" size={16} color="#0033A0" />
            <Text style={styles.levelText}>Level: {item.level}</Text>
          </View>
        )}

        {/* Footer / Comments */}
        <View style={styles.cardFooter}>
          <View style={styles.commentContainer}>
            <MaterialIcons name="chat-bubble-outline" size={16} color="#0033A0" />
            <Text style={styles.commentsCount}>
              {item.comments_count || 0} comments
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#0033A0" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Personalized Profile Bar */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialIcons name="sports-volleyball" size={28} color="#FFFFFF" />
          <Text style={styles.headerTitle}>Sideout</Text>
        </View>

        <TouchableOpacity style={styles.profileBadge}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <MaterialIcons name="account-circle" size={28} color="#FFFFFF" />
          )}
          <Text style={styles.profileName}>{username}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#E30613" />
        </View>
      ) : (
        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          renderItem={renderGymItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E30613"
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No gyms available.</Text>
            </View>
          }
        />
      )}

      {/* Chat / Details Modal */}
      <ChatModal
        visible={selectedGym !== null}
        gym={selectedGym}
        username={username}
        avatarUrl={avatarUrl}
        onClose={() => setSelectedGym(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#E30613',
    borderBottomWidth: 4,
    borderBottomColor: '#0033A0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  avatarImage: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  profileName: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#E30613',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  gymName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0033A0',
    flex: 1,
    marginRight: 8,
  },
  priceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationText: {
    fontSize: 14,
    color: '#4A5568',
    marginLeft: 6,
  },
  levelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0033A0',
    marginLeft: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
  },
  commentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentsCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0033A0',
    marginLeft: 6,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 15,
    color: '#0033A0',
  },
});