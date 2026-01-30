document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('open-btn');
  const saveBtn = document.getElementById('save-btn');
  const fileNameSpan = document.getElementById('file-name');
  const welcomeDiv = document.getElementById('welcome');
  const editorContainer = document.getElementById('editor-container');
  const editorPane = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  const editor = document.getElementById('editor');
  const contentDiv = document.getElementById('content');
  const toggleGroup = document.getElementById('toggle-group');
  const editBtn = document.getElementById('edit-btn');
  const previewBtn = document.getElementById('preview-btn');
  const splitBtn = document.getElementById('split-btn');
  const themeToggle = document.getElementById('theme-toggle');
  const lineNumbers = document.getElementById('line-numbers');
  const cursorPosition = document.getElementById('cursor-position');
  const toggleLineNumbersBtn = document.getElementById('toggle-line-numbers');
  const toggleWordWrapBtn = document.getElementById('toggle-word-wrap');
  const sidebar = document.getElementById('sidebar');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const fileList = document.getElementById('file-list');
  const tabsBar = document.getElementById('tabs-bar');

  // Multi-file state management
  let openFiles = new Map(); // Map of filePath -> { content, unsaved, cursorPos, scrollPos }
  let activeFilePath = null;
  let untitledCounter = 1;
  let isDarkMode = localStorage.getItem('darkMode') === 'true';
  let showLineNumbers = localStorage.getItem('showLineNumbers') !== 'false';
  let sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  let wordWrap = localStorage.getItem('wordWrap') !== 'false'; // Default to true

  // Initialize theme
  const lightIcon = themeToggle.querySelector('.light-icon');
  const darkIcon = themeToggle.querySelector('.dark-icon');

  function initTheme() {
    if (isDarkMode) {
      document.body.classList.add('dark');
      lightIcon.classList.remove('active');
      darkIcon.classList.add('active');
    } else {
      document.body.classList.remove('dark');
      lightIcon.classList.add('active');
      darkIcon.classList.remove('active');
    }
  }

  function toggleTheme() {
    isDarkMode = !isDarkMode;
    localStorage.setItem('darkMode', isDarkMode);
    initTheme();
  }

  // Initialize theme on load
  initTheme();

  // Theme toggle button
  themeToggle.addEventListener('click', toggleTheme);

  // Sidebar functionality
  function initSidebar() {
    if (sidebarCollapsed) {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
    initSidebar();
  }

  initSidebar();
  toggleSidebarBtn.addEventListener('click', toggleSidebar);

  // Line numbers functionality
  function initLineNumbers() {
    if (showLineNumbers) {
      lineNumbers.classList.remove('hidden');
      toggleLineNumbersBtn.classList.add('active');
    } else {
      lineNumbers.classList.add('hidden');
      toggleLineNumbersBtn.classList.remove('active');
    }
  }

  // Measurement element for calculating wrapped line heights
  let measureElement = null;

  function getMeasureElement() {
    if (!measureElement) {
      measureElement = document.createElement('div');
      // Copy computed styles from editor for accurate measurement
      const editorStyles = getComputedStyle(editor);
      measureElement.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: ${editorStyles.fontFamily};
        font-size: ${editorStyles.fontSize};
        line-height: ${editorStyles.lineHeight};
        letter-spacing: ${editorStyles.letterSpacing};
        padding: 0;
        border: none;
        box-sizing: border-box;
      `;
      document.body.appendChild(measureElement);
    }
    return measureElement;
  }

  function getLineHeight() {
    const computed = getComputedStyle(editor);
    const lineHeight = parseFloat(computed.lineHeight);
    // If lineHeight is NaN (e.g., "normal"), calculate from font size
    if (isNaN(lineHeight)) {
      return parseFloat(computed.fontSize) * 1.6;
    }
    return lineHeight;
  }

  function updateLineNumbers() {
    const lines = editor.value.split('\n');
    const lineHeight = getLineHeight();

    // If word wrap is disabled, use simple line numbers
    if (!wordWrap) {
      const lineNumbersHtml = lines.map((_, i) => `<span>${i + 1}</span>`).join('');
      lineNumbers.innerHTML = lineNumbersHtml;
      return;
    }

    // Calculate visual height for each line when word wrap is enabled
    const measure = getMeasureElement();
    const editorWidth = editor.clientWidth - 40; // Subtract padding (20px each side)
    measure.style.width = editorWidth + 'px';

    const lineNumbersHtml = lines.map((line, i) => {
      // Measure the height of this line when wrapped
      measure.textContent = line || ' '; // Use space for empty lines
      const height = measure.offsetHeight;
      const visualLines = Math.max(1, Math.round(height / lineHeight));
      const spanHeight = visualLines * lineHeight;

      return `<span style="height: ${spanHeight}px">${i + 1}</span>`;
    }).join('');

    lineNumbers.innerHTML = lineNumbersHtml;
  }

  function syncLineNumbersScroll() {
    lineNumbers.scrollTop = editor.scrollTop;
  }

  function toggleLineNumbersVisibility() {
    showLineNumbers = !showLineNumbers;
    localStorage.setItem('showLineNumbers', showLineNumbers);
    initLineNumbers();
  }

  // Word wrap functions
  function initWordWrap() {
    if (wordWrap) {
      editor.classList.remove('no-wrap');
      toggleWordWrapBtn.classList.add('active');
    } else {
      editor.classList.add('no-wrap');
      toggleWordWrapBtn.classList.remove('active');
    }
  }

  function toggleWordWrap() {
    wordWrap = !wordWrap;
    localStorage.setItem('wordWrap', wordWrap);
    initWordWrap();
    updateLineNumbers(); // Recalculate line heights
  }

  // Sync scrolling between editor and preview
  let isEditorScrolling = false;
  let isPreviewScrolling = false;

  function syncEditorToPreview() {
    if (isPreviewScrolling) return;
    isEditorScrolling = true;

    const editorScrollMax = editor.scrollHeight - editor.clientHeight;
    if (editorScrollMax <= 0) return;

    const editorScrollPercent = editor.scrollTop / editorScrollMax;
    const previewScrollMax = previewPane.scrollHeight - previewPane.clientHeight;
    previewPane.scrollTop = editorScrollPercent * previewScrollMax;

    setTimeout(() => { isEditorScrolling = false; }, 50);
  }

  function syncPreviewToEditor() {
    if (isEditorScrolling) return;
    isPreviewScrolling = true;

    const previewScrollMax = previewPane.scrollHeight - previewPane.clientHeight;
    if (previewScrollMax <= 0) return;

    const previewScrollPercent = previewPane.scrollTop / previewScrollMax;
    const editorScrollMax = editor.scrollHeight - editor.clientHeight;
    editor.scrollTop = previewScrollPercent * editorScrollMax;
    syncLineNumbersScroll();

    setTimeout(() => { isPreviewScrolling = false; }, 50);
  }

  // Initialize line numbers and word wrap
  initLineNumbers();
  initWordWrap();

  // Line numbers toggle button
  toggleLineNumbersBtn.addEventListener('click', toggleLineNumbersVisibility);

  // Word wrap toggle button
  toggleWordWrapBtn.addEventListener('click', toggleWordWrap);

  // Update line numbers when editor is resized (affects word wrap)
  let resizeTimer;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (wordWrap) {
        updateLineNumbers();
      }
    }, 100);
  });
  resizeObserver.observe(editor);

  // Sync scroll - line numbers and preview
  editor.addEventListener('scroll', () => {
    syncLineNumbersScroll();
    syncEditorToPreview();
  });

  previewPane.addEventListener('scroll', syncPreviewToEditor);

  // Cursor position tracking
  function updateCursorPosition() {
    const text = editor.value.substring(0, editor.selectionStart);
    const lines = text.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    cursorPosition.textContent = `Ln ${line}, Col ${col}`;
  }

  // Update cursor position on various events
  editor.addEventListener('keyup', updateCursorPosition);
  editor.addEventListener('click', updateCursorPosition);
  editor.addEventListener('focus', updateCursorPosition);

  function setViewMode(mode) {
    // Remove active class from all toggle buttons
    editBtn.classList.remove('active');
    previewBtn.classList.remove('active');
    splitBtn.classList.remove('active');

    switch (mode) {
      case 'edit':
        editBtn.classList.add('active');
        editorPane.style.display = 'flex';
        previewPane.style.display = 'none';
        editorContainer.classList.remove('split-view');
        break;
      case 'preview':
        previewBtn.classList.add('active');
        editorPane.style.display = 'none';
        previewPane.style.display = 'flex';
        editorContainer.classList.remove('split-view');
        break;
      case 'split':
        splitBtn.classList.add('active');
        editorPane.style.display = 'flex';
        previewPane.style.display = 'flex';
        editorContainer.classList.add('split-view');
        break;
    }
  }

  function updatePreview() {
    const fileData = openFiles.get(activeFilePath);
    if (fileData) {
      window.electronAPI.parseMarkdown(fileData.content).then((html) => {
        contentDiv.innerHTML = html;
      });
    }
  }

  function getFileName(filePath) {
    if (filePath.startsWith('untitled:')) {
      const fileData = openFiles.get(filePath);
      return fileData?.untitledName || 'Untitled.md';
    }
    return filePath.split(/[/\\]/).pop();
  }

  // Render the file list in sidebar
  function renderFileList() {
    fileList.innerHTML = '';
    openFiles.forEach((fileData, filePath) => {
      const li = document.createElement('li');
      li.className = filePath === activeFilePath ? 'active' : '';
      li.title = filePath;
      li.innerHTML = `
        <span class="file-icon">📄</span>
        <span class="file-name">${getFileName(filePath)}</span>
        ${fileData.unsaved ? '<span class="unsaved-dot"></span>' : ''}
        <button class="close-file" title="Close file">×</button>
      `;
      li.addEventListener('click', (e) => {
        if (!e.target.classList.contains('close-file')) {
          switchToFile(filePath);
        }
      });
      li.querySelector('.close-file').addEventListener('click', (e) => {
        e.stopPropagation();
        closeFile(filePath);
      });
      fileList.appendChild(li);
    });
  }

  // Render tabs
  function renderTabs() {
    tabsBar.innerHTML = '';
    openFiles.forEach((fileData, filePath) => {
      const tab = document.createElement('div');
      tab.className = `tab ${filePath === activeFilePath ? 'active' : ''}`;
      tab.title = filePath;
      tab.innerHTML = `
        <span class="tab-name">${getFileName(filePath)}</span>
        ${fileData.unsaved ? '<span class="unsaved-indicator"></span>' : ''}
        <button class="close-tab" title="Close">×</button>
      `;
      tab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('close-tab')) {
          switchToFile(filePath);
        }
      });
      tab.querySelector('.close-tab').addEventListener('click', (e) => {
        e.stopPropagation();
        closeFile(filePath);
      });
      tabsBar.appendChild(tab);
    });
  }

  // Save current file state before switching
  function saveCurrentFileState() {
    if (activeFilePath && openFiles.has(activeFilePath)) {
      const fileData = openFiles.get(activeFilePath);
      fileData.content = editor.value;
      fileData.cursorPos = editor.selectionStart;
      fileData.scrollPos = editor.scrollTop;
    }
  }

  // Switch to a different file
  function switchToFile(filePath) {
    if (!openFiles.has(filePath)) return;

    saveCurrentFileState();
    activeFilePath = filePath;

    const fileData = openFiles.get(filePath);
    editor.value = fileData.content;

    // Restore cursor and scroll position
    editor.selectionStart = fileData.cursorPos || 0;
    editor.selectionEnd = fileData.cursorPos || 0;
    editor.scrollTop = fileData.scrollPos || 0;

    const fileName = getFileName(filePath);
    fileNameSpan.textContent = fileData.unsaved ? `${fileName} (unsaved)` : fileName;
    document.title = `${fileName} - Markdown Viewer`;

    saveBtn.disabled = !fileData.unsaved;

    updatePreview();
    updateLineNumbers();
    updateCursorPosition();
    syncLineNumbersScroll();
    renderFileList();
    renderTabs();
  }

  // Close a file
  async function closeFile(filePath) {
    if (!openFiles.has(filePath)) return;

    const fileData = openFiles.get(filePath);
    const fileName = getFileName(filePath);

    // Check for unsaved changes
    if (fileData.unsaved) {
      const result = await window.electronAPI.confirmCloseFile(fileName);

      if (result === 0) {
        // Save first, then close
        await window.electronAPI.saveFile(filePath, fileData.content);
      } else if (result === 2) {
        // Cancel - don't close
        return;
      }
      // result === 1 means Don't Save, continue to close
    }

    openFiles.delete(filePath);
    window.electronAPI.notifyFileClosed(filePath);

    if (openFiles.size === 0) {
      // No more files open
      activeFilePath = null;
      welcomeDiv.style.display = 'flex';
      editorContainer.style.display = 'none';
      toggleGroup.style.display = 'none';
      fileNameSpan.textContent = '';
      document.title = 'Markdown Editor';
      editor.value = '';
      contentDiv.innerHTML = '';
    } else if (filePath === activeFilePath) {
      // Switch to another file
      const nextFile = openFiles.keys().next().value;
      switchToFile(nextFile);
    }

    renderFileList();
    renderTabs();
  }

  function markUnsaved() {
    if (!activeFilePath || !openFiles.has(activeFilePath)) return;

    const fileData = openFiles.get(activeFilePath);
    if (!fileData.unsaved) {
      fileData.unsaved = true;
      saveBtn.disabled = false;
      fileNameSpan.textContent = getFileName(activeFilePath) + ' (unsaved)';
      window.electronAPI.notifyFileUnsaved(activeFilePath, getFileName(activeFilePath));
      renderFileList();
      renderTabs();
    }
  }

  function markSaved() {
    if (!activeFilePath || !openFiles.has(activeFilePath)) return;

    const fileData = openFiles.get(activeFilePath);
    fileData.unsaved = false;
    saveBtn.disabled = true;
    fileNameSpan.textContent = getFileName(activeFilePath);
    window.electronAPI.notifyFileSaved(activeFilePath);
    renderFileList();
    renderTabs();
  }

  function openFile(filePath, content) {
    // Check if file is already open
    if (openFiles.has(filePath)) {
      switchToFile(filePath);
      return;
    }

    // Save current file state before opening new file
    saveCurrentFileState();

    // Add new file to open files
    openFiles.set(filePath, {
      content: content,
      unsaved: false,
      cursorPos: 0,
      scrollPos: 0
    });

    activeFilePath = filePath;

    const fileName = getFileName(filePath);
    fileNameSpan.textContent = fileName;
    document.title = `${fileName} - Markdown Editor`;

    welcomeDiv.style.display = 'none';
    editorContainer.style.display = 'flex';
    toggleGroup.style.display = 'flex';
    setViewMode('split');

    editor.value = content;
    editor.selectionStart = 0;
    editor.selectionEnd = 0;
    editor.scrollTop = 0;

    updatePreview();
    updateLineNumbers();
    updateCursorPosition();
    renderFileList();
    renderTabs();
  }

  function newFile() {
    // Save current file state before creating new file
    saveCurrentFileState();

    // Create untitled file path
    const untitledPath = `untitled:${untitledCounter}`;
    const fileName = `Untitled-${untitledCounter}.md`;
    untitledCounter++;

    // Add new file to open files
    openFiles.set(untitledPath, {
      content: '',
      unsaved: true,
      cursorPos: 0,
      scrollPos: 0,
      isUntitled: true,
      untitledName: fileName
    });

    activeFilePath = untitledPath;

    fileNameSpan.textContent = fileName + ' (unsaved)';
    document.title = `${fileName} - Markdown Editor`;

    welcomeDiv.style.display = 'none';
    editorContainer.style.display = 'flex';
    toggleGroup.style.display = 'flex';
    setViewMode('split');

    editor.value = '';
    editor.selectionStart = 0;
    editor.selectionEnd = 0;
    editor.scrollTop = 0;
    saveBtn.disabled = false;

    window.electronAPI.notifyFileUnsaved(untitledPath, fileName);

    updatePreview();
    updateLineNumbers();
    updateCursorPosition();
    renderFileList();
    renderTabs();

    editor.focus();
  }

  function isUntitledFile(filePath) {
    return filePath && filePath.startsWith('untitled:');
  }

  // Editor input handler with debounced preview update
  let debounceTimer;
  let isStreaming = false;
  let lastStreamUpdate = 0;
  const STREAM_THROTTLE = 50; // Update preview every 50ms during streaming

  editor.addEventListener('input', () => {
    if (activeFilePath && openFiles.has(activeFilePath)) {
      openFiles.get(activeFilePath).content = editor.value;
    }
    markUnsaved();
    updateLineNumbers();
    updateCursorPosition();

    if (isStreaming) {
      // Throttle updates during streaming for smoother preview
      const now = Date.now();
      if (now - lastStreamUpdate > STREAM_THROTTLE) {
        lastStreamUpdate = now;
        updatePreview();
      }
    } else {
      // Normal debounce for regular typing
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updatePreview, 150);
    }
  });

  // Listen for streaming state changes from plugins
  document.addEventListener('plugin:streaming-start', () => {
    isStreaming = true;
    lastStreamUpdate = 0;
  });

  document.addEventListener('plugin:streaming-end', () => {
    isStreaming = false;
    updatePreview(); // Final update when streaming ends
    updateLineNumbers(); // Ensure line numbers are updated
    syncLineNumbersScroll(); // Sync scroll position
  });

  // Toggle buttons
  editBtn.addEventListener('click', () => setViewMode('edit'));
  previewBtn.addEventListener('click', () => setViewMode('preview'));
  splitBtn.addEventListener('click', () => setViewMode('split'));

  // New button
  const newBtn = document.getElementById('new-btn');
  newBtn.addEventListener('click', () => {
    newFile();
  });

  // Donate link
  const donateLink = document.getElementById('donate-link');
  donateLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.electronAPI.openExternal('https://buymeacoffee.com/donvitocodes');
  });

  // Open button
  openBtn.addEventListener('click', () => {
    window.electronAPI.openFile();
  });

  // Save button
  saveBtn.addEventListener('click', async () => {
    await saveCurrentFile();
  });

  async function saveCurrentFile() {
    if (!activeFilePath || !openFiles.has(activeFilePath)) return;

    const fileData = openFiles.get(activeFilePath);
    if (!fileData.unsaved) return;

    if (isUntitledFile(activeFilePath)) {
      await saveFileAs();
    } else {
      await window.electronAPI.saveFile(activeFilePath, fileData.content);
    }
  }

  async function saveFileAs() {
    if (!activeFilePath || !openFiles.has(activeFilePath)) return;

    const fileData = openFiles.get(activeFilePath);
    const defaultName = isUntitledFile(activeFilePath)
      ? fileData.untitledName
      : getFileName(activeFilePath);

    const result = await window.electronAPI.saveFileAs(fileData.content, defaultName);

    if (result.success && result.filePath) {
      // Remove old entry
      const oldPath = activeFilePath;
      window.electronAPI.notifyFileClosed(oldPath);
      openFiles.delete(oldPath);

      // Add with new path
      openFiles.set(result.filePath, {
        content: fileData.content,
        unsaved: false,
        cursorPos: fileData.cursorPos,
        scrollPos: fileData.scrollPos
      });

      activeFilePath = result.filePath;
      const fileName = getFileName(result.filePath);
      fileNameSpan.textContent = fileName;
      document.title = `${fileName} - Markdown Editor`;
      saveBtn.disabled = true;

      renderFileList();
      renderTabs();
    }
  }

  // IPC handlers
  window.electronAPI.onFileOpened((data) => {
    openFile(data.filePath, data.content);
  });

  window.electronAPI.onFileSaved(() => {
    markSaved();
  });

  window.electronAPI.onTriggerSave(async () => {
    await saveCurrentFile();
  });

  window.electronAPI.onTriggerSaveAs(async () => {
    await saveFileAs();
  });

  window.electronAPI.onNewFile(() => {
    newFile();
  });

  // Save all unsaved files and close
  window.electronAPI.onSaveAllAndClose(async () => {
    const savePromises = [];
    openFiles.forEach((fileData, filePath) => {
      if (fileData.unsaved && !isUntitledFile(filePath)) {
        savePromises.push(window.electronAPI.saveFile(filePath, fileData.content));
      }
    });
    await Promise.all(savePromises);
    window.electronAPI.sendAllSavedClose();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+S to save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveCurrentFile();
    }
    // Ctrl+W to close current tab
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      if (activeFilePath) {
        closeFile(activeFilePath);
      }
    }
  });

  // Handle right-click context menu for AI actions
  editor.addEventListener('contextmenu', (e) => {
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);

    if (selectedText.length > 0) {
      e.preventDefault();
      window.electronAPI.showContextMenu({
        selectedText,
        selectionStart: editor.selectionStart,
        selectionEnd: editor.selectionEnd
      });
    }
  });

  // Handle plugin context menu actions
  window.pluginAPI.onContextMenuAction((data) => {
    // Dispatch event for plugin host to handle
    document.dispatchEvent(new CustomEvent('plugin:context-menu-action', { detail: data }));
  });

  // Cmd/Ctrl+K shortcut for AI Generate with prompt
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
      document.dispatchEvent(new CustomEvent('plugin:context-menu-action', {
        detail: {
          pluginId: 'ai-editor',
          actionId: 'generate',
          selectedText,
          selectionStart: editor.selectionStart,
          selectionEnd: editor.selectionEnd
        }
      }));
    }
  });

  // Handle open settings
  window.electronAPI.onOpenSettings(() => {
    document.dispatchEvent(new CustomEvent('open-settings'));
  });

  // Loading indicator handlers (small, non-blocking)
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingMessage = document.getElementById('loading-message');

  document.addEventListener('plugin:show-loading', (e) => {
    loadingMessage.textContent = e.detail.message || 'Processing...';
    loadingIndicator.classList.remove('hidden');
  });

  document.addEventListener('plugin:hide-loading', () => {
    loadingIndicator.classList.add('hidden');
  });

  // Prompt dialog handlers
  const promptDialog = document.getElementById('prompt-dialog');
  const promptDialogTitle = document.getElementById('prompt-dialog-title');
  const promptDialogInput = document.getElementById('prompt-dialog-input');
  const promptDialogCancel = document.getElementById('prompt-dialog-cancel');
  const promptDialogOk = document.getElementById('prompt-dialog-ok');
  let promptResolve = null;

  document.addEventListener('plugin:show-prompt', (e) => {
    const { title, placeholder, resolve } = e.detail;
    promptDialogTitle.textContent = title || 'Enter prompt';
    promptDialogInput.placeholder = placeholder || '';
    promptDialogInput.value = '';
    promptResolve = resolve;
    promptDialog.classList.remove('hidden');
    promptDialogInput.focus();
  });

  promptDialogCancel.addEventListener('click', () => {
    promptDialog.classList.add('hidden');
    if (promptResolve) {
      promptResolve(null);
      promptResolve = null;
    }
  });

  promptDialogOk.addEventListener('click', () => {
    promptDialog.classList.add('hidden');
    if (promptResolve) {
      promptResolve(promptDialogInput.value.trim() || null);
      promptResolve = null;
    }
  });

  // Allow Enter to submit (Shift+Enter for newline)
  promptDialogInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      promptDialogOk.click();
    } else if (e.key === 'Escape') {
      promptDialogCancel.click();
    }
  });

  // Close prompt on overlay click
  promptDialog.querySelector('.prompt-dialog-overlay').addEventListener('click', () => {
    promptDialogCancel.click();
  });

  // AI Review dialog handlers
  const aiReviewDialog = document.getElementById('ai-review-dialog');
  const aiReviewOriginal = document.getElementById('ai-review-original');
  const aiReviewGenerated = document.getElementById('ai-review-generated');
  const aiReviewClose = document.getElementById('ai-review-close');
  const aiReviewRegenerate = document.getElementById('ai-review-regenerate');
  const aiReviewReject = document.getElementById('ai-review-reject');
  const aiReviewAccept = document.getElementById('ai-review-accept');
  let aiReviewResolve = null;

  document.addEventListener('plugin:show-review', (e) => {
    const { original, generated, resolve } = e.detail;
    aiReviewOriginal.textContent = original || '(empty)';
    aiReviewGenerated.textContent = generated || '(empty)';
    aiReviewResolve = resolve;
    aiReviewDialog.classList.remove('hidden');
  });

  function closeAiReview(action) {
    aiReviewDialog.classList.add('hidden');
    if (aiReviewResolve) {
      aiReviewResolve(action);
      aiReviewResolve = null;
    }
  }

  aiReviewClose.addEventListener('click', () => closeAiReview('reject'));
  aiReviewReject.addEventListener('click', () => closeAiReview('reject'));
  aiReviewAccept.addEventListener('click', () => closeAiReview('accept'));
  aiReviewRegenerate.addEventListener('click', () => closeAiReview('regenerate'));

  aiReviewDialog.querySelector('.ai-review-overlay').addEventListener('click', () => {
    closeAiReview('reject');
  });

  // Escape key to close review dialog
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !aiReviewDialog.classList.contains('hidden')) {
      closeAiReview('reject');
    }
  });

  // Inline Diff Panel handlers
  const inlineDiffPanel = document.getElementById('inline-diff-panel');
  const inlineDiffAction = document.getElementById('inline-diff-action');
  const inlineDiffOriginal = document.getElementById('inline-diff-original');
  const inlineDiffGenerated = document.getElementById('inline-diff-generated');
  const inlineDiffReject = document.getElementById('inline-diff-reject');
  const inlineDiffAccept = document.getElementById('inline-diff-accept');

  let inlineDiffResolve = null;
  let inlineDiffOriginalText = '';
  let inlineDiffGeneratedText = '';
  let inlineDiffSelectionStart = 0;
  let inlineDiffSelectionEnd = 0;

  function positionInlineDiffPanel() {
    // Get the editor's position
    const editorRect = editor.getBoundingClientRect();

    // Position panel width - wider, but constrained to editor width
    const panelWidth = Math.min(650, Math.max(500, editorRect.width - 60));
    inlineDiffPanel.style.width = panelWidth + 'px';

    // Center horizontally relative to editor
    let left = editorRect.left + (editorRect.width - panelWidth) / 2;
    // Keep within viewport
    left = Math.max(20, Math.min(left, window.innerWidth - panelWidth - 20));
    inlineDiffPanel.style.left = left + 'px';

    // Position vertically - try to show near top of editor area
    let top = editorRect.top + 60;

    // Keep within viewport with margin
    top = Math.max(60, Math.min(top, 100));
    inlineDiffPanel.style.top = top + 'px';
  }

  function closeInlineDiff(action) {
    inlineDiffPanel.classList.add('hidden');
    inlineDiffGenerated.classList.remove('streaming');
    inlineDiffAction.classList.remove('generating');

    if (action === 'accept') {
      // Replace the selection with generated text
      editor.focus();
      editor.selectionStart = inlineDiffSelectionStart;
      editor.selectionEnd = inlineDiffSelectionEnd;
      document.execCommand('insertText', false, inlineDiffGeneratedText);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (inlineDiffResolve) {
      inlineDiffResolve(action);
      inlineDiffResolve = null;
    }
  }

  document.addEventListener('plugin:start-inline-diff', (e) => {
    const { actionLabel, originalText, resolve } = e.detail;

    // Reject any pending promise before opening new dialog
    if (inlineDiffResolve) {
      inlineDiffResolve('reject');
      inlineDiffResolve = null;
    }

    inlineDiffAction.textContent = actionLabel;
    inlineDiffAction.classList.add('generating');
    inlineDiffOriginal.textContent = originalText || '(empty)';
    inlineDiffGenerated.textContent = '';
    inlineDiffGenerated.classList.add('streaming');
    inlineDiffResolve = resolve;
    inlineDiffOriginalText = originalText;
    inlineDiffGeneratedText = '';
    inlineDiffSelectionStart = editor.selectionStart;
    inlineDiffSelectionEnd = editor.selectionEnd;

    positionInlineDiffPanel();
    inlineDiffPanel.classList.remove('hidden');
  });

  document.addEventListener('plugin:update-inline-diff', (e) => {
    const { text } = e.detail;
    inlineDiffGeneratedText = text;
    inlineDiffGenerated.textContent = text;

    // Auto-scroll to show latest content
    const body = inlineDiffPanel.querySelector('.inline-diff-body');
    body.scrollTop = body.scrollHeight;
  });

  document.addEventListener('plugin:finish-inline-diff-streaming', () => {
    inlineDiffGenerated.classList.remove('streaming');
    inlineDiffAction.classList.remove('generating');
  });

  document.addEventListener('plugin:close-inline-diff', () => {
    closeInlineDiff('reject');
  });

  inlineDiffReject.addEventListener('click', () => closeInlineDiff('reject'));
  inlineDiffAccept.addEventListener('click', () => closeInlineDiff('accept'));

  // Keyboard shortcuts for inline diff
  document.addEventListener('keydown', (e) => {
    if (inlineDiffPanel.classList.contains('hidden')) return;

    // Cmd/Ctrl + Enter to accept
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      closeInlineDiff('accept');
    }
    // Escape to reject/close
    if (e.key === 'Escape') {
      e.preventDefault();
      closeInlineDiff('reject');
    }
  });

  // Inline Prompt Input handlers
  const inlinePrompt = document.getElementById('inline-prompt');
  const inlinePromptInput = document.getElementById('inline-prompt-input');
  const inlinePromptSubmit = document.getElementById('inline-prompt-submit');
  const inlinePromptClose = document.getElementById('inline-prompt-close');
  let inlinePromptResolve = null;

  function positionInlinePrompt() {
    const editorRect = editor.getBoundingClientRect();

    // Width similar to inline diff
    const promptWidth = Math.min(550, Math.max(400, editorRect.width - 100));
    inlinePrompt.style.width = promptWidth + 'px';

    // Center horizontally relative to editor
    let left = editorRect.left + (editorRect.width - promptWidth) / 2;
    left = Math.max(20, Math.min(left, window.innerWidth - promptWidth - 20));
    inlinePrompt.style.left = left + 'px';

    // Position near top of editor
    let top = editorRect.top + 60;
    top = Math.max(60, Math.min(top, 100));
    inlinePrompt.style.top = top + 'px';
  }

  function closeInlinePrompt(value) {
    inlinePrompt.classList.add('hidden');
    inlinePromptInput.value = '';
    if (inlinePromptResolve) {
      inlinePromptResolve(value);
      inlinePromptResolve = null;
    }
  }

  document.addEventListener('plugin:show-inline-prompt', (e) => {
    const { placeholder, resolve } = e.detail;

    // Reject any pending promise before opening new dialog
    if (inlinePromptResolve) {
      inlinePromptResolve(null);
      inlinePromptResolve = null;
    }

    inlinePromptInput.placeholder = placeholder || 'Edit with AI...';
    inlinePromptResolve = resolve;
    positionInlinePrompt();
    inlinePrompt.classList.remove('hidden');
    inlinePromptInput.focus();
  });

  inlinePromptSubmit.addEventListener('click', () => {
    const value = inlinePromptInput.value.trim();
    if (value) {
      closeInlinePrompt(value);
    }
  });

  inlinePromptClose.addEventListener('click', () => {
    closeInlinePrompt(null);
  });

  // Auto-resize textarea as user types
  inlinePromptInput.addEventListener('input', () => {
    inlinePromptInput.style.height = 'auto';
    inlinePromptInput.style.height = Math.min(inlinePromptInput.scrollHeight, 150) + 'px';
  });

  inlinePromptInput.addEventListener('keydown', (e) => {
    // Enter to submit (Shift+Enter for new line)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const value = inlinePromptInput.value.trim();
      if (value) {
        closeInlinePrompt(value);
      }
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      closeInlinePrompt(null);
    }
  });

  // Notification handlers
  const notificationContainer = document.getElementById('notification-container');

  document.addEventListener('plugin:notification', (e) => {
    const { message, type } = e.detail;
    const notification = document.createElement('div');
    notification.className = `notification ${type || 'info'}`;
    notification.textContent = message;
    notificationContainer.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  });

  // Initialize plugins
  if (window.initializePlugins) {
    window.initializePlugins(editor);
  }

  // Handle drag and drop
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('drag-over');
  });

  document.body.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('drag-over');
  });

  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const validExtensions = ['.md', '.markdown', '.txt'];

      // Support dropping multiple files
      Array.from(files).forEach(file => {
        const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        if (validExtensions.includes(ext)) {
          const filePath = window.electronAPI.getPathForFile(file);
          window.electronAPI.openFilePath(filePath);
        }
      });
    }
  });
});
