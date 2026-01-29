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

  let currentFilePath = null;
  let rawContent = '';
  let hasUnsavedChanges = false;
  let isDarkMode = localStorage.getItem('darkMode') === 'true';

  // Initialize theme
  function initTheme() {
    if (isDarkMode) {
      document.body.classList.add('dark');
      themeToggle.textContent = 'Light';
    } else {
      document.body.classList.remove('dark');
      themeToggle.textContent = 'Dark';
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
    window.electronAPI.parseMarkdown(rawContent).then((html) => {
      contentDiv.innerHTML = html;
    });
  }

  function markUnsaved() {
    if (!hasUnsavedChanges) {
      hasUnsavedChanges = true;
      saveBtn.disabled = false;
      if (currentFilePath) {
        const fileName = currentFilePath.split(/[/\\]/).pop();
        fileNameSpan.textContent = fileName + ' (unsaved)';
      }
    }
  }

  function markSaved() {
    hasUnsavedChanges = false;
    saveBtn.disabled = true;
    if (currentFilePath) {
      const fileName = currentFilePath.split(/[/\\]/).pop();
      fileNameSpan.textContent = fileName;
    }
  }

  function displayMarkdown(filePath, content) {
    currentFilePath = filePath;
    rawContent = content;

    const fileName = filePath.split(/[/\\]/).pop();
    fileNameSpan.textContent = fileName;
    document.title = `${fileName} - Markdown Viewer`;

    welcomeDiv.style.display = 'none';
    editorContainer.style.display = 'flex';
    toggleGroup.style.display = 'flex';

    editor.value = content;
    updatePreview();
    markSaved();
  }

  // Editor input handler with debounced preview update
  let debounceTimer;
  editor.addEventListener('input', () => {
    rawContent = editor.value;
    markUnsaved();

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updatePreview, 150);
  });

  // Toggle buttons
  editBtn.addEventListener('click', () => setViewMode('edit'));
  previewBtn.addEventListener('click', () => setViewMode('preview'));
  splitBtn.addEventListener('click', () => setViewMode('split'));

  // Open button
  openBtn.addEventListener('click', () => {
    window.electronAPI.openFile();
  });

  // Save button
  saveBtn.addEventListener('click', () => {
    if (currentFilePath && hasUnsavedChanges) {
      window.electronAPI.saveFile(currentFilePath, rawContent);
    }
  });

  // IPC handlers
  window.electronAPI.onFileOpened((data) => {
    displayMarkdown(data.filePath, data.content);
  });

  window.electronAPI.onFileSaved(() => {
    markSaved();
  });

  window.electronAPI.onTriggerSave(() => {
    if (currentFilePath && hasUnsavedChanges) {
      window.electronAPI.saveFile(currentFilePath, rawContent);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      if (currentFilePath && hasUnsavedChanges) {
        window.electronAPI.saveFile(currentFilePath, rawContent);
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
      const file = files[0];
      const validExtensions = ['.md', '.markdown', '.txt'];
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

      if (validExtensions.includes(ext)) {
        window.electronAPI.openFilePath(file.path);
      }
    }
  });
});
