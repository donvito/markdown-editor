// Plugin API - exposed to plugins for editor interaction
class PluginAPI {
  constructor(pluginId, editor) {
    this.pluginId = pluginId;
    this.editor = editor;
  }

  // Get current text selection
  getSelection() {
    return {
      text: this.editor.value.substring(this.editor.selectionStart, this.editor.selectionEnd),
      start: this.editor.selectionStart,
      end: this.editor.selectionEnd
    };
  }

  // Get entire editor content
  getContent() {
    return this.editor.value;
  }

  // Replace current selection with new text (preserves undo history)
  replaceSelection(newText) {
    this.editor.focus();

    // Use execCommand to preserve undo history
    // This works because the editor is a textarea and we're replacing selected text
    document.execCommand('insertText', false, newText);

    // Trigger input event to update preview and state
    this.editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Start a streaming replacement - deletes selection and returns insert position
  startStreamingReplace() {
    this.editor.focus();
    const start = this.editor.selectionStart;

    // Delete selected text first
    if (this.editor.selectionStart !== this.editor.selectionEnd) {
      document.execCommand('delete');
    }

    this._streamInsertPos = start;
    this._streamText = '';

    // Notify renderer that streaming started (for faster preview updates)
    document.dispatchEvent(new CustomEvent('plugin:streaming-start'));

    return start;
  }

  // Append text during streaming (inserts at stream position)
  appendStreamingText(chunk) {
    this.editor.focus();

    // Position cursor at end of streamed content
    const insertAt = this._streamInsertPos + this._streamText.length;
    this.editor.selectionStart = insertAt;
    this.editor.selectionEnd = insertAt;

    // Insert the chunk
    document.execCommand('insertText', false, chunk);
    this._streamText += chunk;

    // Trigger input event to update preview
    this.editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // End streaming
  endStreaming() {
    const text = this._streamText;
    this._streamInsertPos = null;
    this._streamText = '';

    // Notify renderer that streaming ended
    document.dispatchEvent(new CustomEvent('plugin:streaming-end'));

    return text;
  }

  // Insert text at specific position
  insertAt(text, position) {
    const before = this.editor.value.substring(0, position);
    const after = this.editor.value.substring(position);

    this.editor.value = before + text + after;
    this.editor.selectionStart = position + text.length;
    this.editor.selectionEnd = position + text.length;

    this.editor.dispatchEvent(new Event('input', { bubbles: true }));
    this.editor.focus();
  }

  // Settings (async - goes through IPC)
  async getSetting(key) {
    return window.pluginAPI.getSetting(this.pluginId, key);
  }

  async setSetting(key, value, isSecure = false) {
    return window.pluginAPI.setSetting(this.pluginId, key, value, isSecure);
  }

  // Context menu registration
  registerContextMenu(items) {
    return window.pluginAPI.registerContextMenuItems(this.pluginId, items);
  }

  // AI requests (proxied through main process for security)
  async makeAIRequest(messages, options = {}) {
    const result = await window.pluginAPI.makeAIRequest(this.pluginId, 'chat/completions', {
      messages,
      ...options
    });

    if (!result.success) {
      throw new Error(result.error || 'AI request failed');
    }

    return result.data;
  }

  // Streaming AI request - calls onChunk for each text chunk, returns full text when done
  async makeAIRequestStream(messages, onChunk, options = {}) {
    return new Promise(async (resolve, reject) => {
      const { streamId } = await window.pluginAPI.makeAIRequestStream(
        this.pluginId,
        'chat/completions',
        { messages, ...options }
      );

      let fullText = '';

      const chunkHandler = (data) => {
        if (data.streamId === streamId) {
          fullText += data.chunk;
          onChunk(data.chunk, fullText);
        }
      };

      const doneHandler = (data) => {
        if (data.streamId === streamId) {
          cleanup();
          resolve(fullText);
        }
      };

      const errorHandler = (data) => {
        if (data.streamId === streamId) {
          cleanup();
          reject(new Error(data.error));
        }
      };

      const cleanup = () => {
        window.pluginAPI.onAIStreamChunk(() => {});
        window.pluginAPI.onAIStreamDone(() => {});
        window.pluginAPI.onAIStreamError(() => {});
      };

      window.pluginAPI.onAIStreamChunk(chunkHandler);
      window.pluginAPI.onAIStreamDone(doneHandler);
      window.pluginAPI.onAIStreamError(errorHandler);
    });
  }

  // UI helpers
  showLoading(message = 'Processing...') {
    document.dispatchEvent(new CustomEvent('plugin:show-loading', {
      detail: { message }
    }));
  }

  hideLoading() {
    document.dispatchEvent(new CustomEvent('plugin:hide-loading'));
  }

  showNotification(message, type = 'info') {
    document.dispatchEvent(new CustomEvent('plugin:notification', {
      detail: { message, type }
    }));
  }

  // Show a prompt dialog and return user input
  async showPrompt(title, placeholder = '') {
    return new Promise((resolve) => {
      document.dispatchEvent(new CustomEvent('plugin:show-prompt', {
        detail: { title, placeholder, resolve }
      }));
    });
  }

  // Show review dialog for AI-generated text
  // Returns: 'accept', 'reject', or 'regenerate'
  async showReview(original, generated) {
    return new Promise((resolve) => {
      document.dispatchEvent(new CustomEvent('plugin:show-review', {
        detail: { original, generated, resolve }
      }));
    });
  }

  // Start inline diff panel for streaming AI generation
  // Returns an object with methods to update and close the panel
  startInlineDiff(actionLabel, originalText) {
    return new Promise((resolve) => {
      document.dispatchEvent(new CustomEvent('plugin:start-inline-diff', {
        detail: {
          actionLabel,
          originalText,
          resolve
        }
      }));
    });
  }

  // Update the generated text in the inline diff panel (for streaming)
  updateInlineDiff(text) {
    document.dispatchEvent(new CustomEvent('plugin:update-inline-diff', {
      detail: { text }
    }));
  }

  // Mark streaming as complete (removes cursor animation)
  finishInlineDiffStreaming() {
    document.dispatchEvent(new CustomEvent('plugin:finish-inline-diff-streaming'));
  }

  // Close the inline diff panel programmatically
  closeInlineDiff() {
    document.dispatchEvent(new CustomEvent('plugin:close-inline-diff'));
  }
}

// Export for use by plugin host
window.PluginAPI = PluginAPI;
