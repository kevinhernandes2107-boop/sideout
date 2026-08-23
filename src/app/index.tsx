import React, { useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../components/auth/LoginScreen';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

export default function Index() {
  const { userToken, isLoading } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Show a loading spinner while checking local storage for a saved session
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  // If user has a token, route them straight into the tab screens
  if (userToken) {
    return <Redirect href="/(tabs)" />;
  }

  // Otherwise, render the Login screen
  return <LoginScreen />;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});