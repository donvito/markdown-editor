// Plugin Host - manages plugin lifecycle
class PluginHost {
  constructor() {
    this.plugins = new Map();
    this.editor = null;
  }

  async initialize(editor) {
    this.editor = editor;

    // Load all enabled plugins
    const pluginList = await window.pluginAPI.getPlugins();

    for (const pluginInfo of pluginList) {
      if (pluginInfo.enabled) {
        await this.loadPlugin(pluginInfo.id);
      }
    }

    // Listen for context menu actions
    document.addEventListener('plugin:context-menu-action', (e) => {
      this.handleContextMenuAction(e.detail);
    });
  }

  async loadPlugin(pluginId) {
    try {
      const manifest = await window.pluginAPI.getManifest(pluginId);
      if (!manifest) {
        console.error(`Plugin ${pluginId} not found`);
        return;
      }

      // Create API instance for this plugin
      const api = new window.PluginAPI(pluginId, this.editor);

      // Load plugin based on ID (hardcoded for now, could be dynamic later)
      let plugin;
      if (pluginId === 'ai-editor') {
        plugin = new window.AIEditorPlugin(api);
      }

      if (plugin) {
        this.plugins.set(pluginId, { manifest, plugin, api });

        // Activate the plugin
        if (plugin.activate) {
          await plugin.activate();
        }

        console.log(`Plugin ${pluginId} loaded successfully`);
      }
    } catch (error) {
      console.error(`Failed to load plugin ${pluginId}:`, error);
    }
  }

  async unloadPlugin(pluginId) {
    const pluginData = this.plugins.get(pluginId);
    if (pluginData && pluginData.plugin.deactivate) {
      await pluginData.plugin.deactivate();
    }
    this.plugins.delete(pluginId);
  }

  handleContextMenuAction(data) {
    const { pluginId, actionId, selectedText, selectionStart, selectionEnd } = data;

    const pluginData = this.plugins.get(pluginId);
    if (pluginData && pluginData.plugin.handleAction) {
      // Set selection in editor before handling
      this.editor.selectionStart = selectionStart;
      this.editor.selectionEnd = selectionEnd;
      this.editor.focus();

      pluginData.plugin.handleAction(actionId, selectedText);
    }
  }

  getPlugin(pluginId) {
    return this.plugins.get(pluginId);
  }

  getLoadedPlugins() {
    return Array.from(this.plugins.keys());
  }
}

// Create and export plugin host
window.pluginHost = new PluginHost();

// Initialize plugins when called from renderer.js
window.initializePlugins = async function(editor) {
  await window.pluginHost.initialize(editor);
};
