import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, ApiError } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';

const THEME_OPTIONS = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
];
import { RatingSummary } from '../StarRating';

const POSITIONS = ['Setter', 'Outside', 'Middle', 'Opposite', 'Libero', 'DS'];
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Competitive'];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, userToken, logout, updateProfile, uploadPhoto } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rating, setRating] = useState({ average: null, count: 0 });
  const [stats, setStats] = useState({ matches_hosted: 0, matches_played: 0, tournaments_won: 0 });

  const [form, setForm] = useState({
    username: user?.username || '',
    bio: user?.bio || '',
    position: user?.position || '',
    skill_level: user?.skill_level || '',
    city: user?.city || '',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.id) return;
      apiFetch(`/api/users/${user.id}/rating-summary`, { token: userToken })
        .then(setRating)
        .catch(() => {});
      apiFetch(`/api/users/${user.id}/stats`, { token: userToken })
        .then(setStats)
        .catch(() => {});
    }, [user?.id, userToken])
  );

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await apiFetch('/api/me', { method: 'DELETE', token: userToken });
      await logout();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not delete your account.';
      Alert.alert('Error', message);
      setDeletingAccount(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProfile(form);
      setIsEditing(false);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not save profile.';
      Alert.alert('Update Failed', message);
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = () => {
    setForm({
      username: user?.username || '',
      bio: user?.bio || '',
      position: user?.position || '',
      skill_level: user?.skill_level || '',
      city: user?.city || '',
    });
    setIsEditing(true);
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Allow access to your photos to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    setIsUploadingPhoto(true);
    try {
      const context = ImageManipulator.manipulate(result.assets[0].uri);
      context.resize({ width: 512 });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });

      if (!saved.base64) throw new Error('Could not process image.');
      await uploadPhoto(saved.base64, 'image/jpeg');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not upload photo.';
      Alert.alert('Upload Failed', message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.next.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    try {
      await apiFetch('/api/change-password', {
        method: 'POST',
        token: userToken,
        body: { current_password: passwordForm.current, new_password: passwordForm.next },
      });
      setPasswordForm({ current: '', next: '', confirm: '' });
      setIsChangingPassword(false);
      Alert.alert('Success', 'Your password has been updated.');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not change password.';
      Alert.alert('Update Failed', message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <MaterialIcons name="account-circle" size={22} color={colors.blue} />
        <Text style={styles.header}>Player Profile</Text>
      </View>

      {/* Profile Display Card */}
      <View style={styles.profileCard}>
        <TouchableOpacity onPress={handlePickPhoto} disabled={isUploadingPhoto} style={styles.avatarWrapper}>
          {user?.pfp ? (
            <Image source={{ uri: user.pfp }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>🏐</Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            {isUploadingPhoto ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.avatarEditBadgeText}>✎</Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePickPhoto} disabled={isUploadingPhoto}>
          <Text style={styles.changePhotoText}>{isUploadingPhoto ? 'Uploading...' : 'Change Photo'}</Text>
        </TouchableOpacity>
        <Text style={styles.usernameText}>@{user?.username || 'Player'}</Text>
        {!!(user?.position || user?.skill_level) && (
          <Text style={styles.metaText}>
            {[user?.position, user?.skill_level].filter(Boolean).join(' · ')}
          </Text>
        )}
        {!!user?.city && <Text style={styles.metaText}>{user.city}</Text>}
        {rating.count > 0 && (
          <View style={{ marginTop: 8 }}>
            <RatingSummary average={rating.average} count={rating.count} size={15} />
          </View>
        )}
        {!!user?.bio && <Text style={styles.bioText}>{user.bio}</Text>}

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
      </View>

      {/* Edit Profile Form */}
      {isEditing ? (
        <View style={styles.editSection}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={form.username}
            onChangeText={(v) => setForm({ ...form, username: v })}
            placeholder="Enter username"
            placeholderTextColor="#999"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={form.bio}
            onChangeText={(v) => setForm({ ...form, bio: v })}
            placeholder="Tell other players about yourself"
            placeholderTextColor="#999"
            multiline
          />

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={form.city}
            onChangeText={(v) => setForm({ ...form, city: v })}
            placeholder="e.g. Winston-Salem"
            placeholderTextColor="#999"
          />

          <Text style={styles.label}>Position</Text>
          <View style={styles.pillRow}>
            {POSITIONS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.pill, form.position === p && styles.pillSelected]}
                onPress={() => setForm({ ...form, position: p })}
              >
                <Text style={[styles.pillText, form.position === p && styles.pillTextSelected]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Skill Level</Text>
          <View style={styles.pillRow}>
            {SKILL_LEVELS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.pill, form.skill_level === s && styles.pillSelected]}
                onPress={() => setForm({ ...form, skill_level: s })}
              >
                <Text style={[styles.pillText, form.skill_level === s && styles.pillTextSelected]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
            <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.editButton} onPress={startEditing}>
          <Text style={styles.buttonText}>Edit Profile</Text>
        </TouchableOpacity>
      )}

      {/* Change Password */}
      {isChangingPassword ? (
        <View style={styles.editSection}>
          <Text style={styles.sectionTitle}>Change Password</Text>

          <Text style={styles.label}>Current Password</Text>
          <TextInput
            style={styles.input}
            value={passwordForm.current}
            onChangeText={(v) => setPasswordForm({ ...passwordForm, current: v })}
            placeholder="Current password"
            placeholderTextColor="#999"
            secureTextEntry
          />

          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            value={passwordForm.next}
            onChangeText={(v) => setPasswordForm({ ...passwordForm, next: v })}
            placeholder="New password"
            placeholderTextColor="#999"
            secureTextEntry
          />

          <Text style={styles.label}>Confirm New Password</Text>
          <TextInput
            style={styles.input}
            value={passwordForm.confirm}
            onChangeText={(v) => setPasswordForm({ ...passwordForm, confirm: v })}
            placeholder="Confirm new password"
            placeholderTextColor="#999"
            secureTextEntry
          />

          <TouchableOpacity style={styles.saveButton} onPress={handleChangePassword} disabled={isSavingPassword}>
            <Text style={styles.buttonText}>{isSavingPassword ? 'Saving...' : 'Update Password'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setPasswordForm({ current: '', next: '', confirm: '' });
              setIsChangingPassword(false);
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsChangingPassword(true)}>
          <Text style={styles.secondaryButtonText}>Change Password</Text>
        </TouchableOpacity>
      )}

      <View style={styles.editSection}>
        <Text style={styles.sectionTitle}>Theme</Text>
        <View style={styles.pillRow}>
          {THEME_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.pill, preference === opt.key && styles.pillSelected]}
              onPress={() => setPreference(opt.key)}
            >
              <Text style={[styles.pillText, preference === opt.key && styles.pillTextSelected]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/notification-settings')}>
        <MaterialIcons name="notifications-none" size={18} color={colors.textMuted} />
        <Text style={styles.linkRowText}>Notification Settings</Text>
        <MaterialIcons name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/series')}>
        <MaterialIcons name="event-repeat" size={18} color={colors.textMuted} />
        <Text style={styles.linkRowText}>My Recurring Matches</Text>
        <MaterialIcons name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/blocked-users')}>
        <MaterialIcons name="block" size={18} color={colors.textMuted} />
        <Text style={styles.linkRowText}>Blocked Users</Text>
        <MaterialIcons name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {user?.is_admin && (
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/admin-reports')}>
          <MaterialIcons name="flag" size={18} color={colors.textMuted} />
          <Text style={styles.linkRowText}>Reports</Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      {!showDeleteConfirm ? (
        <TouchableOpacity style={styles.deleteAccountLink} onPress={() => setShowDeleteConfirm(true)}>
          <Text style={styles.deleteAccountLinkText}>Delete Account</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.deleteConfirmBox}>
          <Text style={styles.deleteConfirmWarning}>
            This permanently deletes your account, hosted matches, tournaments, messages, and everything tied to
            it. This can't be undone.
          </Text>
          <Text style={styles.deleteConfirmLabel}>Type DELETE to confirm</Text>
          <TextInput
            style={styles.deleteConfirmInput}
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            placeholder="DELETE"
            placeholderTextColor="#999"
            autoCapitalize="characters"
          />
          <View style={styles.deleteConfirmButtonRow}>
            <TouchableOpacity
              style={[styles.deleteConfirmButton, deleteConfirmText !== 'DELETE' && styles.deleteConfirmButtonDisabled]}
              onPress={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
            >
              {deletingAccount ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.deleteConfirmButtonText}>Permanently Delete</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowDeleteConfirm(false);
                setDeleteConfirmText('');
              }}
            >
              <Text style={styles.deleteConfirmCancelText}>Never mind</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 6 },
  header: { fontSize: 24, fontWeight: 'bold', color: colors.text },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  profileCard: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarWrapper: {
    marginBottom: 8,
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#0057B815',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 48 },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.blue,
    borderWidth: 2,
    borderColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  changePhotoText: { color: colors.blue, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  usernameText: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  metaText: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  bioText: { fontSize: 14, color: colors.textMuted, marginTop: 10, textAlign: 'center' },
  statsRow: { flexDirection: 'row', marginTop: 18, gap: 10, width: '100%' },
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
  editSection: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 14,
    color: colors.text,
  },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
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
  editButton: {
    backgroundColor: colors.blue,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.blue,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: { color: colors.blue, fontWeight: 'bold', fontSize: 16 },
  saveButton: {
    backgroundColor: colors.blue,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: { padding: 12, alignItems: 'center', marginTop: 4 },
  cancelButtonText: { color: colors.textMuted, fontWeight: '600' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  linkRowText: { flex: 1, marginLeft: 8, fontSize: 14, fontWeight: '600', color: colors.text },
  logoutButton: {
    backgroundColor: colors.danger,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  deleteAccountLink: { marginTop: 16, alignItems: 'center' },
  deleteAccountLinkText: { color: colors.danger, fontWeight: '600', fontSize: 13 },
  deleteConfirmBox: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: 14,
  },
  deleteConfirmWarning: { fontSize: 13, color: colors.text, lineHeight: 18, marginBottom: 12 },
  deleteConfirmLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  deleteConfirmInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  deleteConfirmButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  deleteConfirmButton: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 150,
    alignItems: 'center',
  },
  deleteConfirmButtonDisabled: { opacity: 0.5 },
  deleteConfirmButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  deleteConfirmCancelText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
});
