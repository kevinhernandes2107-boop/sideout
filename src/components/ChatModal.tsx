import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

const HOST_IP = '192.168.1.56';

interface Comment {
  id: number;
  username: string;
  avatar_url: string | null;
  text: string;
  created_at: string;
}

interface Gym {
  id: string;
  name: string;
  address?: string;
  city?: string;
  level?: string;
  price?: string;
}

interface ChatModalProps {
  visible: boolean;
  gym: Gym | null;
  username: string;
  avatarUrl: string | null;
  onClose: () => void;
}

export default function ChatModal({
  visible,
  gym,
  username,
  avatarUrl,
  onClose,
}: ChatModalProps) {
  const [messages, setMessages] = useState<Comment[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const socketRef = useRef<WebSocket | null>(null);

  const fetchChatHistory = async () => {
    if (!gym) return;
    try {
      const res = await fetch(`http://${HOST_IP}:8000/gyms/${gym.id}`);
      const data = await res.json();
      if (data.comments) {
        setMessages(data.comments);
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible || !gym) return;

    fetchChatHistory();

    const wsUrl = `ws://${HOST_IP}:8000/ws/chat/${gym.id}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const newMsg: Comment = JSON.parse(event.data);
        setMessages((prev) => [newMsg, ...prev]);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [visible, gym]);

  useEffect(() => {
    if (!visible || isConnected || !gym) return;

    const interval = setInterval(() => {
      fetchChatHistory();
    }, 3000);

    return () => clearInterval(interval);
  }, [visible, isConnected, gym]);

  const sendMessage = async () => {
    if (!inputText.trim() || !gym) return;

    const payload = {
      username: username || 'Player',
      avatar_url: avatarUrl,
      text: inputText.trim(),
    };

    if (isConnected && socketRef.current) {
      socketRef.current.send(JSON.stringify(payload));
    } else {
      try {
        await fetch(`http://${HOST_IP}:8000/gyms/${gym.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        fetchChatHistory();
      } catch (err) {
        console.error('Failed to send comment via HTTP:', err);
      }
    }

    setInputText('');
  };

  if (!gym) return null;

  const isFree = gym.price?.toLowerCase() === 'free';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{gym.name}</Text>
                {gym.price && (
                  <View
                    style={[
                      styles.priceBadge,
                      { backgroundColor: isFree ? '#E30613' : '#0033A0' },
                    ]}
                  >
                    <Text style={styles.priceText}>{gym.price}</Text>
                  </View>
                )}
              </View>

              {/* Location & Level in Modal */}
              {(gym.address || gym.city || gym.level) && (
                <Text style={styles.subtext}>
                  {[gym.address, gym.city, gym.level ? `Level: ${gym.level}` : null]
                    .filter(Boolean)
                    .join(' • ')}
                </Text>
              )}

              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isConnected ? '#34C759' : '#FFCC00' },
                  ]}
                />
                <Text style={styles.statusText}>
                  {isConnected ? 'Live WebSocket' : 'HTTP Polling Mode'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Chat Messages */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#E30613" />
            </View>
          ) : (
            <FlatList
              data={messages}
              inverted
              keyExtractor={(item, idx) => item.id?.toString() || idx.toString()}
              renderItem={({ item }) => (
                <View style={styles.messageRow}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <MaterialIcons name="account-circle" size={32} color="#0033A0" />
                  )}
                  <View style={styles.messageBubble}>
                    <View style={styles.messageHeader}>
                      <Text style={styles.usernameText}>{item.username}</Text>
                      <Text style={styles.timeText}>{item.created_at}</Text>
                    </View>
                    <Text style={styles.messageText}>{item.text}</Text>
                  </View>
                </View>
              )}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
                </View>
              }
            />
          )}

          {/* Text Input Footer */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={`Chatting as ${username}...`}
              placeholderTextColor="#8A92A6"
              value={inputText}
              onChangeText={setInputText}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                !inputText.trim() && styles.sendButtonDisabled,
              ]}
              onPress={sendMessage}
              disabled={!inputText.trim()}
            >
              <MaterialIcons name="send" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#E30613',
    borderBottomWidth: 4,
    borderBottomColor: '#0033A0',
  },
  headerTitleGroup: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginRight: 8 },
  priceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginVertical: 2,
  },
  priceText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  subtext: { fontSize: 12, color: '#FFD1D1', marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, color: '#F8F9FA' },
  listContent: { padding: 16 },
  messageRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  messageBubble: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 10,
    marginLeft: 8,
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: '#E30613',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  usernameText: { fontSize: 12, fontWeight: 'bold', color: '#0033A0' },
  timeText: { fontSize: 10, color: '#6B7280' },
  messageText: { fontSize: 14, color: '#1C1C1E' },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#D0D7DE',
    color: '#0033A0',
  },
  sendButton: {
    backgroundColor: '#E30613',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#F18087' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 14, color: '#0033A0' },
});