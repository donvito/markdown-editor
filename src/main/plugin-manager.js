const fs = require('fs');
const path = require('path');
const secureStorage = require('./secure-storage');

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginsDir = null;
  }

  initialize(appPath) {
    this.pluginsDir = path.join(appPath, 'plugins');
    this.loadPlugins();
  }

  loadPlugins() {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
      return;
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = path.join(this.pluginsDir, entry.name);
        const manifestPath = path.join(pluginPath, 'plugin.json');

        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            manifest._path = pluginPath;
            manifest._enabled = secureStorage.get(`plugin.${manifest.id}.enabled`) !== false;
            this.plugins.set(manifest.id, manifest);
          } catch (error) {
            console.error(`Failed to load plugin from ${pluginPath}:`, error);
          }
        }
      }
    }
  }

  getPlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      enabled: p._enabled,
      settings: p.settings || {}
    }));
  }

  getManifest(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return null;

    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      enabled: plugin._enabled,
      settings: plugin.settings || {}
    };
  }

  getPluginPath(pluginId) {
    const plugin = this.plugins.get(pluginId);
    return plugin ? plugin._path : null;
  }

  enablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin._enabled = true;
      secureStorage.set(`plugin.${pluginId}.enabled`, true);
      return true;
    }
    return false;
  }

  disablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin._enabled = false;
      secureStorage.set(`plugin.${pluginId}.enabled`, false);
      return true;
    }
    return false;
  }

  isEnabled(pluginId) {
    const plugin = this.plugins.get(pluginId);
    return plugin ? plugin._enabled : false;
  }

  getSetting(pluginId, key) {
    const settingKey = `plugin.${pluginId}.${key}`;
    const manifest = this.plugins.get(pluginId);

    // Check if this is a secure setting
    if (manifest?.settings?.[key]?.secure) {
      return secureStorage.getSecure(settingKey);
    }

    return secureStorage.get(settingKey);
  }

  setSetting(pluginId, key, value, isSecure = false) {
    const settingKey = `plugin.${pluginId}.${key}`;

    if (isSecure) {
      secureStorage.setSecure(settingKey, value);
    } else {
      secureStorage.set(settingKey, value);
    }
  }
}

module.exports = new PluginManager();
