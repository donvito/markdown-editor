// Settings Modal - manages plugin settings UI
class SettingsModal {
  constructor() {
    this.modal = null;
    this.currentPluginId = null;

    // Provider URL mappings for AI plugin
    this.providerUrls = {
      'OpenAI': 'https://api.openai.com/v1',
      'Ollama': 'http://localhost:11434/v1',
      'LM Studio': 'http://localhost:1234/v1',
      'Custom': ''
    };

    this.init();
  }

  // Escape HTML to prevent injection
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  init() {
    // Create modal HTML
    this.createModal();

    // Listen for open settings event
    document.addEventListener('open-settings', (e) => this.show(e.detail || {}));

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal && !this.modal.classList.contains('hidden')) {
        this.hide();
      }
    });
  }

  createModal() {
    const modalHtml = `
      <div id="settings-modal" class="modal hidden">
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h2>Settings</h2>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <nav class="settings-nav">
              <button class="settings-tab active" data-tab="general">General</button>
              <button class="settings-tab" data-tab="plugins">AI &amp; Plugins</button>
            </nav>
            <div class="settings-content">
              <div id="settings-general" class="settings-panel active">
                <div class="setting-group">
                  <label class="setting-label">Default view</label>
                  <p class="setting-description">Shown when you open or create a file. You can also change this from the Edit / Split / Preview buttons.</p>
                  <div class="view-mode-options" role="radiogroup" aria-label="Default view">
                    <label class="view-mode-option">
                      <input type="radio" name="default-view-mode" value="edit">
                      <span>Edit</span>
                    </label>
                    <label class="view-mode-option">
                      <input type="radio" name="default-view-mode" value="preview">
                      <span>Preview</span>
                    </label>
                    <label class="view-mode-option">
                      <input type="radio" name="default-view-mode" value="split">
                      <span>Split</span>
                    </label>
                  </div>
                </div>
              </div>
              <div id="settings-plugins" class="settings-panel">
                <div class="plugins-list"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.modal = document.getElementById('settings-modal');

    // Event listeners
    this.modal.querySelector('.modal-close').addEventListener('click', () => this.hide());
    this.modal.querySelector('.modal-overlay').addEventListener('click', () => this.hide());

    this.modal.querySelectorAll('.settings-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    this.modal.querySelectorAll('input[name="default-view-mode"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        document.dispatchEvent(new CustomEvent('set-default-view-mode', {
          detail: { mode: input.value }
        }));
      });
    });

    document.addEventListener('view-mode-changed', (e) => {
      this.syncViewModeRadios(e.detail && e.detail.mode);
    });
  }

  switchTab(tabId) {
    this.modal.querySelectorAll('.settings-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    this.modal.querySelectorAll('.settings-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `settings-${tabId}`);
    });
  }

  syncViewModeRadios(mode) {
    const valid = ['edit', 'preview', 'split'].includes(mode) ? mode : 'preview';
    this.modal.querySelectorAll('input[name="default-view-mode"]').forEach((input) => {
      input.checked = input.value === valid;
    });
  }

  async show({ tab, pluginId } = {}) {
    const stored = localStorage.getItem('defaultViewMode');
    this.syncViewModeRadios(stored || 'preview');
    await this.loadPlugins();

    if (tab) {
      this.switchTab(tab);
    }

    // Opened from a specific feature (e.g. the chat panel): expand that
    // plugin's settings so the fields are visible without a second click.
    if (pluginId) {
      const card = this.modal.querySelector(`.plugin-card[data-plugin-id="${pluginId}"]`);
      if (card) {
        card.querySelector('.plugin-settings').classList.add('expanded');
        card.scrollIntoView({ block: 'nearest' });
      }
    }

    this.modal.classList.remove('hidden');
  }

  hide() {
    this.modal.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('settings-closed'));
  }

  async loadPlugins() {
    const pluginsList = this.modal.querySelector('.plugins-list');
    const plugins = await window.pluginAPI.getPlugins();

    if (plugins.length === 0) {
      pluginsList.innerHTML = '<p class="no-plugins">No plugins installed</p>';
      return;
    }

    let html = '';
    for (const plugin of plugins) {
      html += await this.renderPluginCard(plugin);
    }
    pluginsList.innerHTML = html;

    // Add event listeners for plugin toggles and settings
    pluginsList.querySelectorAll('.plugin-toggle').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const pluginId = e.target.dataset.pluginId;
        if (e.target.checked) {
          await window.pluginAPI.enablePlugin(pluginId);
          // Load plugin at runtime
          if (window.pluginHost) {
            await window.pluginHost.loadPlugin(pluginId);
          }
        } else {
          await window.pluginAPI.disablePlugin(pluginId);
          // Unload plugin at runtime
          if (window.pluginHost) {
            await window.pluginHost.unloadPlugin(pluginId);
          }
        }
      });
    });

    pluginsList.querySelectorAll('.plugin-settings-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pluginId = e.target.dataset.pluginId;
        this.showPluginSettings(pluginId);
      });
    });

    pluginsList.querySelectorAll('.setting-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const pluginId = e.target.dataset.pluginId;
        const key = e.target.dataset.key;
        const isSecure = e.target.dataset.secure === 'true';
        const value = e.target.value;
        await window.pluginAPI.setSetting(pluginId, key, value, isSecure);

        // Special handling for provider selection - auto-fill base URL
        if (pluginId === 'ai-editor' && key === 'provider') {
          const baseUrlInput = pluginsList.querySelector(
            `.setting-input[data-plugin-id="ai-editor"][data-key="baseUrl"]`
          );
          if (baseUrlInput && this.providerUrls[value] !== undefined) {
            const newUrl = this.providerUrls[value];
            if (newUrl) {
              baseUrlInput.value = newUrl;
              await window.pluginAPI.setSetting(pluginId, 'baseUrl', newUrl, false);
            }
          }
        }
      });
    });
  }

  async renderPluginCard(plugin) {
    const settingsHtml = await this.renderPluginSettings(plugin);

    return `
      <div class="plugin-card" data-plugin-id="${this.escapeHtml(plugin.id)}">
        <div class="plugin-header">
          <div class="plugin-info">
            <h3 class="plugin-name">${this.escapeHtml(plugin.name)}</h3>
            <p class="plugin-description">${this.escapeHtml(plugin.description || '')}</p>
            <span class="plugin-version">v${this.escapeHtml(plugin.version)}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" class="plugin-toggle" data-plugin-id="${this.escapeHtml(plugin.id)}" ${plugin.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="plugin-settings ${plugin.enabled ? '' : 'disabled'}">
          ${settingsHtml}
        </div>
      </div>
    `;
  }

  async renderPluginSettings(plugin) {
    if (!plugin.settings || Object.keys(plugin.settings).length === 0) {
      return '';
    }

    let html = '<div class="settings-form">';

    for (const [key, config] of Object.entries(plugin.settings)) {
      const currentValue = await window.pluginAPI.getSetting(plugin.id, key) || config.default || '';
      const isSecure = config.secure || false;

      html += `<div class="setting-group">`;
      html += `<label class="setting-label">${this.escapeHtml(config.label || key)}</label>`;

      if (config.type === 'select') {
        html += `<select class="setting-input" data-plugin-id="${this.escapeHtml(plugin.id)}" data-key="${this.escapeHtml(key)}" data-secure="${isSecure}">`;
        for (const option of (config.options || [])) {
          const escaped = this.escapeHtml(option);
          html += `<option value="${escaped}" ${currentValue === option ? 'selected' : ''}>${escaped}</option>`;
        }
        html += `</select>`;
      } else if (config.type === 'password') {
        html += `<input type="password" class="setting-input" data-plugin-id="${this.escapeHtml(plugin.id)}" data-key="${this.escapeHtml(key)}" data-secure="true" value="${this.escapeHtml(currentValue)}" placeholder="${this.escapeHtml(config.description || '')}">`;
      } else {
        html += `<input type="text" class="setting-input" data-plugin-id="${this.escapeHtml(plugin.id)}" data-key="${this.escapeHtml(key)}" data-secure="${isSecure}" value="${this.escapeHtml(currentValue)}" placeholder="${this.escapeHtml(config.description || '')}">`;
      }

      if (config.description && config.type !== 'password') {
        html += `<p class="setting-description">${this.escapeHtml(config.description)}</p>`;
      }

      html += `</div>`;
    }

    html += '</div>';
    return html;
  }

  showPluginSettings(pluginId) {
    const card = this.modal.querySelector(`.plugin-card[data-plugin-id="${pluginId}"]`);
    const settings = card.querySelector('.plugin-settings');
    settings.classList.toggle('expanded');
  }
}

// Initialize settings modal
window.settingsModal = new SettingsModal();
