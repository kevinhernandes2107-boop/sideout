import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

export default function ProfileSetupScreen({ onCompleteSetup }) {
  const [username, setUsername] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState('🏐');

  const EMOJI_OPTIONS = ['🏐', '⚡', '🔥', '🏆', '🎯', '👟'];

  const handleSave = () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username.');
      return;
    }

    onCompleteSetup({
      username: username.trim(),
      avatar: avatarEmoji,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.innerContainer}>
        <Text style={styles.title}>Set Up Profile</Text>
        <Text style={styles.subtitle}>Choose your username and avatar</Text>

        {/* Selected Profile Avatar */}
        <View style={styles.avatarPreview}>
          <Text style={styles.avatarText}>{avatarEmoji}</Text>
        </View>

        {/* Emoji Selector */}
        <View style={styles.emojiRow}>
          {EMOJI_OPTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[
                styles.emojiOption,
                avatarEmoji === emoji && styles.selectedEmoji,
              ]}
              onPress={() => setAvatarEmoji(emoji)}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Username Input */}
        <TextInput
          style={styles.input}
          placeholder="Enter username"
          placeholderTextColor="#888"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Continue to App</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  innerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: { fontSize: 26, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 25, marginTop: 5 },
  avatarPreview: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#007AFF15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  avatarText: { fontSize: 45 },
  emojiRow: {
    flexDirection: 'row',
    marginBottom: 25,
    justifyContent: 'center',
  },
  emojiOption: {
    padding: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  selectedEmoji: {
    borderColor: '#007AFF',
    backgroundColor: '#e6f0ff',
  },
  emojiText: { fontSize: 22 },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});