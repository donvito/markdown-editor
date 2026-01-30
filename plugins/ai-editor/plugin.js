// AI Editor Plugin - AI-powered text transformations with inline streaming
class AIEditorPlugin {
  constructor(api) {
    this.api = api;
  }

  async activate() {
    // Register context menu items with keyboard shortcuts displayed
    await this.api.registerContextMenu([
      { id: 'generate', label: 'AI: Edit with AI...', shortcut: '⌘K' },
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

    // Get the instruction and label based on action
    let instruction, actionLabel;
    switch (actionId) {
      case 'shorter':
        actionLabel = 'shorten';
        instruction = 'Make this text more concise while keeping the key information. Only return the shortened text, no explanations.';
        break;
      case 'longer':
        actionLabel = 'expand';
        instruction = 'Expand this text with more detail, examples, and explanation. Only return the expanded text, no explanations.';
        break;
      case 'formal':
        actionLabel = 'formal tone';
        instruction = 'Rewrite this in a more formal, professional tone. Only return the rewritten text, no explanations.';
        break;
      case 'casual':
        actionLabel = 'casual tone';
        instruction = 'Rewrite this in a more casual, conversational tone. Only return the rewritten text, no explanations.';
        break;
      case 'fix-grammar':
        actionLabel = 'fix grammar';
        instruction = 'Fix any grammar, spelling, or punctuation errors in this text. Only return the corrected text, no explanations.';
        break;
      default:
        this.api.showNotification(`Unknown action: ${actionId}`, 'error');
        return;
    }

    await this.transformWithInlineDiff(selectedText, instruction, actionLabel);
  }

  // Stream text into inline diff panel
  async transformWithInlineDiff(originalText, instruction, actionLabel) {
    // Show the inline diff panel immediately (starts streaming)
    const panelPromise = this.api.startInlineDiff(actionLabel, originalText);

    try {
      await this.api.makeAIRequestStream(
        [
          {
            role: 'system',
            content: 'You are a helpful writing assistant. Follow the instruction precisely and only respond with the transformed text. Do not include any explanations, introductions, or meta-commentary.'
          },
          {
            role: 'user',
            content: `${instruction}\n\nText to transform:\n${originalText}`
          }
        ],
        (chunk, fullText) => {
          // Update the inline diff panel with streaming text
          this.api.updateInlineDiff(fullText);
        }
      );

      // Mark streaming as complete
      this.api.finishInlineDiffStreaming();

      // Wait for user decision (accept/reject/keep)
      const decision = await panelPromise;

      if (decision === 'accept' || decision === 'keep') {
        this.api.showNotification('Text updated successfully', 'success');
      }

    } catch (error) {
      console.error('AI Editor error:', error);
      this.api.showNotification(`Error: ${error.message}`, 'error');
      this.api.closeInlineDiff();
    }
  }

  async generateWithPrompt(selectedText) {
    // Ask user for the prompt using inline input
    const userPrompt = await this.api.showInlinePrompt('Edit with AI...');

    if (!userPrompt) {
      return; // User cancelled
    }

    // Show the inline diff panel immediately
    const panelPromise = this.api.startInlineDiff('generate', selectedText || '(from prompt)');

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
        (chunk, fullText) => {
          this.api.updateInlineDiff(fullText);
        }
      );

      this.api.finishInlineDiffStreaming();

      const decision = await panelPromise;

      if (decision === 'accept' || decision === 'keep') {
        this.api.showNotification('Text generated successfully', 'success');
      }

    } catch (error) {
      console.error('AI Editor error:', error);
      this.api.showNotification(`Error: ${error.message}`, 'error');
      this.api.closeInlineDiff();
    }
  }

  deactivate() {
    console.log('AI Editor plugin deactivated');
  }
}

// Export for plugin host
window.AIEditorPlugin = AIEditorPlugin;
