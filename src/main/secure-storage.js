const Store = require('electron-store');
const { safeStorage } = require('electron');

class SecureStorage {
  constructor() {
    this.store = new Store({
      name: 'plugin-settings'
    });
  }

  // For non-sensitive settings
  get(key) {
    return this.store.get(key);
  }

  set(key, value) {
    this.store.set(key, value);
  }

  // For sensitive settings (API keys)
  getSecure(key) {
    const encrypted = this.store.get(`secure.${key}`);
    if (!encrypted) return null;

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encrypted, 'base64');
        return safeStorage.decryptString(buffer);
      }
      // Fallback if OS encryption unavailable
      return encrypted;
    } catch (error) {
      console.error('Failed to decrypt secure setting:', error);
      return null;
    }
  }

  setSecure(key, value) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(value);
        this.store.set(`secure.${key}`, encrypted.toString('base64'));
      } else {
        // Fallback if OS encryption unavailable
        this.store.set(`secure.${key}`, value);
      }
    } catch (error) {
      console.error('Failed to encrypt secure setting:', error);
      throw error;
    }
  }

  delete(key) {
    this.store.delete(key);
    this.store.delete(`secure.${key}`);
  }

  // Get all settings for a plugin
  getPluginSettings(pluginId) {
    return this.store.get(`plugin.${pluginId}`) || {};
  }

  // Check if encryption is available
  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable();
  }
}

module.exports = new SecureStorage();
