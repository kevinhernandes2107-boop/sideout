import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../constants/api';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';

export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  pfp?: string | null;
  bio?: string | null;
  position?: string | null;
  skill_level?: string | null;
  city?: string | null;
  is_admin?: boolean;
}

export type ProfileUpdate = Partial<Pick<AuthUser, 'username' | 'pfp' | 'bio' | 'position' | 'skill_level' | 'city'>>;

interface AuthContextValue {
  userToken: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (token: string, initialUser: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: ProfileUpdate) => Promise<AuthUser>;
  uploadPhoto: (dataBase64: string, contentType: string) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue>({
  userToken: null,
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  updateProfile: async () => ({} as AuthUser),
  uploadPhoto: async () => ({} as AuthUser),
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (token) {
          const me = await apiFetch<AuthUser>('/api/me', { token });
          setUserToken(token);
          setUser(me);
        }
      } catch (error) {
        console.warn('Stored session is no longer valid, logging out:', (error as Error).message);
        await AsyncStorage.multiRemove(['userToken']);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredData();
  }, []);

  useEffect(() => {
    if (!userToken) return;
    // Best-effort — no-ops on web/simulators or if the user declines permission.
    registerForPushNotificationsAsync()
      .then((pushToken) => {
        if (!pushToken) return;
        return apiFetch('/api/push-token', { method: 'POST', body: { token: pushToken }, token: userToken });
      })
      .catch((error) => console.warn('Push registration failed:', error.message));
  }, [userToken]);

  const login = async (token: string, initialUser: AuthUser) => {
    setUserToken(token);
    setUser(initialUser);
    await AsyncStorage.setItem('userToken', token);
  };

  const logout = async () => {
    setUserToken(null);
    setUser(null);
    await AsyncStorage.multiRemove(['userToken']);
  };

  const updateProfile = async (updates: ProfileUpdate) => {
    const updated = await apiFetch<AuthUser>('/api/me', {
      method: 'PATCH',
      body: updates,
      token: userToken,
    });
    setUser(updated);
    return updated;
  };

  const uploadPhoto = async (dataBase64: string, contentType: string) => {
    const updated = await apiFetch<AuthUser>('/api/me/photo', {
      method: 'POST',
      body: { content_type: contentType, data_base64: dataBase64 },
      token: userToken,
    });
    setUser(updated);
    return updated;
  };

  return (
    <AuthContext.Provider value={{ userToken, user, isLoading, login, logout, updateProfile, uploadPhoto }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
