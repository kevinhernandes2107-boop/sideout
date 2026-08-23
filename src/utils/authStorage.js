import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'user_jwt_token';

// Save token to secure storage
export const saveToken = async (token) => {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    console.error('Error saving JWT token:', error);
  }
};

// Retrieve token from secure storage
export const getToken = async () => {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('Error getting JWT token:', error);
    return null;
  }
};

// Remove token (Logout)
export const removeToken = async () => {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('Error removing JWT token:', error);
  }
};