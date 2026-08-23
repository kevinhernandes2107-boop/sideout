import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function RootStack() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.blue },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile" options={{ headerShown: true, title: 'My Profile' }} />
      <Stack.Screen name="player/[id]" options={{ headerShown: true, title: 'Player' }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: 'Chat' }} />
      <Stack.Screen name="team-chat/[teamId]" options={{ headerShown: true, title: 'Team Chat' }} />
      <Stack.Screen name="match/[id]" options={{ headerShown: true, title: 'Match' }} />
      <Stack.Screen name="tournament/create" options={{ headerShown: true, title: 'Host a Tournament' }} />
      <Stack.Screen name="tournament/[id]" options={{ headerShown: true, title: 'Tournament' }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications' }} />
      <Stack.Screen name="notification-settings" options={{ headerShown: true, title: 'Notification Settings' }} />
      <Stack.Screen name="blocked-users" options={{ headerShown: true, title: 'Blocked Users' }} />
      <Stack.Screen name="series" options={{ headerShown: true, title: 'Recurring Matches' }} />
      <Stack.Screen name="admin-reports" options={{ headerShown: true, title: 'Reports' }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: true, title: 'Reset Password' }} />
      <Stack.Screen name="reset-password" options={{ headerShown: true, title: 'Set New Password' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <RootStack />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
