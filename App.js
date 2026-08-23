import React from 'react';
import { AuthProvider } from './src/context/AuthContext';
import Navigation from './src/navigation'; // Adjust path if using Expo Router or React Navigation

export default function App() {
  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}