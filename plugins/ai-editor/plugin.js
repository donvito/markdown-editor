// AI Editor Plugin - AI-powered text transformations with streaming
class AIEditorPlugin {
  constructor(api) {
    this.api = api;
  }

  async activate() {
    // Register context menu items
    await this.api.registerContextMenu([
      { id: 'generate', label: 'AI: Generate from prompt...' },
      { id: 'shorter', label: 'AI: Make shorter' },
      { id: 'longer', label: 'AI: Make longer' },
      { id: 'formal', label: 'AI: More formal tone' },
      { id: 'casual', label: 'AI: More casual tone' },
      { id: 'fix-grammar', label: 'AI: Fix grammar & spelling' }
    ]);

    console.log('AI Editor plugin activated');
  }

  async handleAction(actionId, selectedText) {
    // Check if API key is configured
    const apiKey = await this.api.getSetting('apiKey');
    if (!apiKey) {
      this.api.showNotification('Please configure your API key in Settings > Plugins', 'error');
      return;
    }

    // For generate action, show prompt first before processing
    if (actionId === 'generate') {
      await this.generateWithPrompt(selectedText);
      return;
    }

    // Get the instruction based on action
    let instruction;
    switch (actionId) {
      case 'shorter':
        instruction = 'Make this text more concise while keeping the key information. Only return the shortened text, no explanations.';
        break;
      case 'longer':
        instruction = 'Expand this text with more detail, examples, and explanation. Only return the expanded text, no explanations.';
        break;
      case 'formal':
        instruction = 'Rewrite this in a more formal, professional tone. Only return the rewritten text, no explanations.';
        break;
      case 'casual':
        instruction = 'Rewrite this in a more casual, conversational tone. Only return the rewritten text, no explanations.';
        break;
      case 'fix-grammar':
        instruction = 'Fix any grammar, spelling, or punctuation errors in this text. Only return the corrected text, no explanations.';
        break;
      default:
        this.api.showNotification(`Unknown action: ${actionId}`, 'error');
        return;
    }

    await this.transformStream(selectedText, instruction);
  }

  async transformStream(text, instruction) {
    this.api.showLoading('Processing with AI...');

    // Start streaming replacement (deletes selected text)
    this.api.startStreamingReplace();

    try {
      await this.api.makeAIRequestStream(
        [
          {
            role: 'system',
            content: 'You are a helpful writing assistant. Follow the instruction precisely and only respond with the transformed text. Do not include any explanations, introductions, or meta-commentary.'
          },
          {
            role: 'user',
            content: `${instruction}\n\nText to transform:\n${text}`
          }
        ],
        (chunk) => {
          // Append each chunk as it arrives
          this.api.appendStreamingText(chunk);
        }
      );

      this.api.endStreaming();
      this.api.showNotification('Text updated successfully', 'success');
    } catch (error) {
      console.error('AI Editor error:', error);
      this.api.showNotification(`Error: ${error.message}`, 'error');
    } finally {
      this.api.hideLoading();
    }
  }

  async generateWithPrompt(selectedText) {
    // Ask user for the prompt
    const userPrompt = await this.api.showPrompt('Enter your prompt for AI generation:', 'e.g., Write a summary of this text...');

    if (!userPrompt) {
      return; // User cancelled
    }

    this.api.showLoading('Generating with AI...');

    // Start streaming replacement
    this.api.startStreamingReplace();

    try {
      const fullPrompt = selectedText
        ? `${userPrompt}\n\nContext/Selected text:\n${selectedText}`
        : userPrompt;

      await this.api.makeAIRequestStream(
        [
          {
            role: 'system',
            content: 'You are a helpful writing assistant. Generate text based on the user\'s prompt. Be creative and helpful. Only respond with the generated text, no meta-commentary.'
          },
          {
            role: 'user',
            content: fullPrompt
          }
        ],
        (chunk) => {
          this.api.appendStreamingText(chunk);
        }
      );

      this.api.endStreaming();
      this.api.showNotification('Text generated successfully', 'success');
    } catch (error) {
      console.error('AI Editor error:', error);
      this.api.showNotification(`Error: ${error.message}`, 'error');
    } finally {
      this.api.hideLoading();
    }
  }

  deactivate() {
    console.log('AI Editor plugin deactivated');
  }
}

// Export for plugin host
window.AIEditorPlugin = AIEditorPlugin;
