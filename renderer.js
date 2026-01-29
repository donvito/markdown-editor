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

  function updateLineNumbers() {
    const lines = editor.value.split('\n').length;
    const lineNumbersHtml = Array.from({ length: lines }, (_, i) => `<span>${i + 1}</span>`).join('');
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

  // Initialize line numbers
  initLineNumbers();

  // Line numbers toggle button
  toggleLineNumbersBtn.addEventListener('click', toggleLineNumbersVisibility);

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
  editor.addEventListener('input', () => {
    if (activeFilePath && openFiles.has(activeFilePath)) {
      openFiles.get(activeFilePath).content = editor.value;
    }
    markUnsaved();
    updateLineNumbers();
    updateCursorPosition();

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updatePreview, 150);
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
          window.electronAPI.openFilePath(file.path);
        }
      });
    }
  });
});
