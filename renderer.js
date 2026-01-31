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
  const wordCountSpan = document.getElementById('word-count');
  const charCountSpan = document.getElementById('char-count');
  const lineCountSpan = document.getElementById('line-count');
  const toggleLineNumbersBtn = document.getElementById('toggle-line-numbers');
  const toggleWordWrapBtn = document.getElementById('toggle-word-wrap');
  const sidebar = document.getElementById('sidebar');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const fileList = document.getElementById('file-list');
  const tabsBar = document.getElementById('tabs-bar');
  const rightSidebar = document.getElementById('right-sidebar');
  const toggleRightSidebarBtn = document.getElementById('toggle-right-sidebar');
  const outlineToggleBtn = document.getElementById('outline-toggle-btn');
  const outlineList = document.getElementById('outline-list');
  const currentFilePathSpan = document.getElementById('current-file-path');

  // Multi-file state management
  let openFiles = new Map(); // Map of filePath -> { content, unsaved, cursorPos, scrollPos }
  let activeFilePath = null;
  let untitledCounter = 1;
  let isDarkMode = localStorage.getItem('darkMode') === 'true';
  let showLineNumbers = localStorage.getItem('showLineNumbers') !== 'false';
  let sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  let wordWrap = localStorage.getItem('wordWrap') !== 'false'; // Default to true
  let rightSidebarHidden = localStorage.getItem('rightSidebarHidden') === 'true';

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

  // Right Sidebar (Outline) functionality
  function initRightSidebar() {
    if (rightSidebarHidden) {
      rightSidebar.classList.add('hidden');
      outlineToggleBtn.classList.remove('active');
    } else {
      rightSidebar.classList.remove('hidden');
      outlineToggleBtn.classList.add('active');
    }
  }

  function toggleRightSidebar() {
    rightSidebarHidden = !rightSidebarHidden;
    localStorage.setItem('rightSidebarHidden', rightSidebarHidden);
    initRightSidebar();
  }

  // Parse headings from markdown content
  function parseHeadings(content) {
    const headings = [];
    const lines = content.split('\n');
    let lineIndex = 0;
    let charIndex = 0;

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          line: lineIndex,
          charIndex: charIndex
        });
      }
      charIndex += line.length + 1; // +1 for newline
      lineIndex++;
    }

    return headings;
  }

  // Render the document outline
  function renderOutline() {
    if (!activeFilePath || !openFiles.has(activeFilePath)) {
      outlineList.innerHTML = '<li class="outline-empty">No document open</li>';
      return;
    }

    const fileData = openFiles.get(activeFilePath);
    const headings = parseHeadings(fileData.content);

    if (headings.length === 0) {
      outlineList.innerHTML = '<li class="outline-empty">No headings found</li>';
      return;
    }

    outlineList.innerHTML = headings.map((heading, index) => `
      <li data-level="${heading.level}" data-index="${index}" data-char="${heading.charIndex}" title="${heading.text}">
        <span class="outline-text">${heading.text}</span>
      </li>
    `).join('');

    // Add click handlers for navigation
    outlineList.querySelectorAll('li[data-char]').forEach((li) => {
      li.addEventListener('click', () => {
        const charIndex = parseInt(li.dataset.char, 10);
        const headingIndex = parseInt(li.dataset.index, 10);

        // Set cursor at the beginning of the heading line
        editor.focus();
        editor.setSelectionRange(charIndex, charIndex);

        // Calculate scroll position accounting for word wrap
        const scrollPosition = calculateScrollPositionForLine(charIndex);
        editor.scrollTop = scrollPosition;
        syncLineNumbersScroll();

        // Scroll preview to the corresponding heading (by index)
        scrollPreviewToHeading(headingIndex);

        // Update active state
        outlineList.querySelectorAll('li').forEach(item => item.classList.remove('active'));
        li.classList.add('active');

        updateCursorPosition();
      });
    });
  }

  // Calculate the scroll position needed to show a given character position at the top
  function calculateScrollPositionForLine(charIndex) {
    const lines = editor.value.substring(0, charIndex).split('\n');
    const targetLineIndex = lines.length - 1;
    const allLines = editor.value.split('\n');
    const lineHeight = getLineHeight();

    if (!wordWrap) {
      // Simple calculation without word wrap
      return targetLineIndex * lineHeight;
    }

    // With word wrap, measure actual heights of lines before target
    const measure = getMeasureElement();
    const editorWidth = editor.clientWidth - 40; // Subtract padding
    measure.style.width = editorWidth + 'px';

    let totalHeight = 0;
    for (let i = 0; i < targetLineIndex; i++) {
      measure.textContent = allLines[i] || ' ';
      const height = measure.offsetHeight;
      const visualLines = Math.max(1, Math.round(height / lineHeight));
      totalHeight += visualLines * lineHeight;
    }

    return totalHeight;
  }

  // Scroll preview pane to show the heading at the top
  function scrollPreviewToHeading(index) {
    // Get all headings in the preview in document order
    const allHeadings = contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');

    if (index >= 0 && index < allHeadings.length) {
      const targetHeading = allHeadings[index];

      // Get positions using getBoundingClientRect for accuracy
      const paneRect = previewPane.getBoundingClientRect();
      const headingRect = targetHeading.getBoundingClientRect();

      // Calculate how far the heading is from the top of the visible pane area
      const offsetFromPaneTop = headingRect.top - paneRect.top;

      // Add that offset to current scroll position, minus a small margin
      previewPane.scrollTop = previewPane.scrollTop + offsetFromPaneTop - 16;
    }
  }

  // Update active outline item based on cursor position
  function updateActiveOutlineItem() {
    if (!activeFilePath || !openFiles.has(activeFilePath)) return;

    const cursorPos = editor.selectionStart;
    const items = outlineList.querySelectorAll('li[data-char]');

    let activeItem = null;
    items.forEach(item => {
      item.classList.remove('active');
      const charIndex = parseInt(item.dataset.char, 10);
      if (charIndex <= cursorPos) {
        activeItem = item;
      }
    });

    if (activeItem) {
      activeItem.classList.add('active');
      // Scroll outline list to show active item
      const listRect = outlineList.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  initRightSidebar();
  toggleRightSidebarBtn.addEventListener('click', toggleRightSidebar);
  outlineToggleBtn.addEventListener('click', toggleRightSidebar);

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

  // Inline Formatting Toolbar in Header
  const formattingToolbarInline = document.getElementById('formatting-toolbar-inline');

  // Check if selected text has specific formatting
  function checkFormatting(text, before, after) {
    if (!text || text.length === 0) return false;
    return text.startsWith(before) && text.endsWith(after) && text.length >= before.length + after.length;
  }

  // Check if lines have a specific prefix
  function checkLinePrefix(text, prefix) {
    if (!text) return false;
    const lines = text.split('\n');
    return lines.every(line => line.startsWith(prefix) || line.trim() === '');
  }

  // Check if text is a numbered list
  function checkNumberedList(text) {
    if (!text) return false;
    const lines = text.split('\n');
    return lines.every((line, i) => {
      const match = line.match(/^(\d+)\.\s/);
      return match || line.trim() === '';
    });
  }

  // Update button active states based on selection
  function updateToolbarState() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;
    const selectedText = value.substring(start, end);

    // Get extended selection to check for surrounding markers
    const extStart = Math.max(0, start - 3);
    const extEnd = Math.min(value.length, end + 3);
    const extendedContext = value.substring(extStart, extEnd);

    // Check inline formatting by looking at what surrounds the selection
    const beforeSel = value.substring(Math.max(0, start - 2), start);
    const afterSel = value.substring(end, Math.min(value.length, end + 2));

    // Bold: check for ** around selection
    const isBold = (beforeSel.endsWith('**') && afterSel.startsWith('**')) ||
                   checkFormatting(selectedText, '**', '**');
    document.getElementById('fmt-bold').classList.toggle('active', isBold);

    // Italic: check for * around selection (but not **)
    const isItalic = (beforeSel.endsWith('*') && !beforeSel.endsWith('**') &&
                      afterSel.startsWith('*') && !afterSel.startsWith('**')) ||
                     (checkFormatting(selectedText, '*', '*') && !checkFormatting(selectedText, '**', '**'));
    document.getElementById('fmt-italic').classList.toggle('active', isItalic);

    // Strikethrough
    const isStrike = (beforeSel.endsWith('~~') && afterSel.startsWith('~~')) ||
                     checkFormatting(selectedText, '~~', '~~');
    document.getElementById('fmt-strikethrough').classList.toggle('active', isStrike);

    // Inline code
    const isCode = (beforeSel.endsWith('`') && !beforeSel.endsWith('``') &&
                    afterSel.startsWith('`') && !afterSel.startsWith('``')) ||
                   (checkFormatting(selectedText, '`', '`') && !checkFormatting(selectedText, '```', '```'));
    document.getElementById('fmt-code').classList.toggle('active', isCode);

    // Get full lines for line-based formatting
    let lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;
    const fullLines = value.substring(lineStart, lineEnd);

    // Heading - check specific levels
    const headingMatch = fullLines.match(/^(#{1,6})\s/);
    const headingLevel = headingMatch ? headingMatch[1].length : 0;
    document.getElementById('fmt-h1').classList.toggle('active', headingLevel === 1);
    document.getElementById('fmt-h2').classList.toggle('active', headingLevel === 2);
    document.getElementById('fmt-h3').classList.toggle('active', headingLevel === 3);
    document.getElementById('fmt-h4').classList.toggle('active', headingLevel === 4);
    document.getElementById('fmt-h5').classList.toggle('active', headingLevel === 5);
    document.getElementById('fmt-h6').classList.toggle('active', headingLevel === 6);

    // Bullet list
    const isBullet = checkLinePrefix(fullLines, '- ') || checkLinePrefix(fullLines, '* ');
    document.getElementById('fmt-ul').classList.toggle('active', isBullet);

    // Numbered list
    const isNumbered = checkNumberedList(fullLines);
    document.getElementById('fmt-ol').classList.toggle('active', isNumbered);

    // Quote
    const isQuote = checkLinePrefix(fullLines, '> ');
    document.getElementById('fmt-quote').classList.toggle('active', isQuote);

    // Link - check if selection or surrounding is a link
    const linkRegex = /\[([^\]]*)\]\([^)]*\)/;
    const isLink = linkRegex.test(selectedText) || linkRegex.test(extendedContext);
    document.getElementById('fmt-link').classList.toggle('active', isLink);

    // Code block
    const isCodeBlock = selectedText.startsWith('```') && selectedText.endsWith('```');
    document.getElementById('fmt-codeblock').classList.toggle('active', isCodeBlock);
  }


  // Toggle formatting (add or remove)
  function toggleWrapFormatting(before, after) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;
    const selectedText = value.substring(start, end);

    // Check if formatting already exists around selection
    const beforeSel = value.substring(Math.max(0, start - before.length), start);
    const afterSel = value.substring(end, Math.min(value.length, end + after.length));

    editor.focus();

    if (beforeSel === before && afterSel === after) {
      // Remove formatting from around selection
      editor.selectionStart = start - before.length;
      editor.selectionEnd = end + after.length;
      document.execCommand('insertText', false, selectedText);
      editor.selectionStart = start - before.length;
      editor.selectionEnd = end - before.length;
    } else if (checkFormatting(selectedText, before, after)) {
      // Remove formatting from within selection
      const inner = selectedText.substring(before.length, selectedText.length - after.length);
      document.execCommand('insertText', false, inner);
      editor.selectionStart = start;
      editor.selectionEnd = start + inner.length;
    } else {
      // Add formatting
      const replacement = before + selectedText + after;
      document.execCommand('insertText', false, replacement);
      editor.selectionStart = start;
      editor.selectionEnd = start + replacement.length;
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    updateToolbarState();
  }

  function toggleLinePrefix(prefix) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;

    // Find line boundaries
    let lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;

    const selectedLines = value.substring(lineStart, lineEnd);
    const lines = selectedLines.split('\n');

    // Check if all lines have the prefix
    const allHavePrefix = lines.every(line => line.startsWith(prefix) || line.trim() === '');

    let newLines;
    if (allHavePrefix) {
      // Remove prefix
      newLines = lines.map(line => {
        if (line.startsWith(prefix)) {
          return line.substring(prefix.length);
        }
        return line;
      }).join('\n');
    } else {
      // Add prefix
      newLines = lines.map(line => prefix + line).join('\n');
    }

    editor.focus();
    editor.selectionStart = lineStart;
    editor.selectionEnd = lineEnd;
    document.execCommand('insertText', false, newLines);

    editor.selectionStart = lineStart;
    editor.selectionEnd = lineStart + newLines.length;

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    updateToolbarState();
  }

  function toggleNumberedList() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;

    let lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;

    const selectedLines = value.substring(lineStart, lineEnd);
    const lines = selectedLines.split('\n');

    const isNumbered = checkNumberedList(selectedLines);

    let newLines;
    if (isNumbered) {
      // Remove numbering
      newLines = lines.map(line => {
        return line.replace(/^\d+\.\s/, '');
      }).join('\n');
    } else {
      // Add numbering
      newLines = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
    }

    editor.focus();
    editor.selectionStart = lineStart;
    editor.selectionEnd = lineEnd;
    document.execCommand('insertText', false, newLines);

    editor.selectionStart = lineStart;
    editor.selectionEnd = lineStart + newLines.length;

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    updateToolbarState();
  }

  function toggleHeading(targetLevel) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;

    let lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;

    const line = value.substring(lineStart, lineEnd);

    // Check current heading level
    const headingMatch = line.match(/^(#{1,6})\s/);
    const currentLevel = headingMatch ? headingMatch[1].length : 0;

    let newLine;
    if (currentLevel === targetLevel) {
      // Same level - remove heading
      newLine = line.replace(/^#{1,6}\s/, '');
    } else if (currentLevel > 0) {
      // Different level - replace with target level
      const hashes = '#'.repeat(targetLevel);
      newLine = line.replace(/^#{1,6}\s/, hashes + ' ');
    } else {
      // No heading - add target level
      const hashes = '#'.repeat(targetLevel);
      newLine = hashes + ' ' + line;
    }

    editor.focus();
    editor.selectionStart = lineStart;
    editor.selectionEnd = lineEnd;
    document.execCommand('insertText', false, newLine);

    editor.selectionStart = lineStart;
    editor.selectionEnd = lineStart + newLine.length;

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    updateToolbarState();
    closeHeadingDropdown();
  }

  // Heading dropdown handling
  function toggleLink() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;
    const selectedText = value.substring(start, end);

    // Check if it's already a link
    const linkMatch = selectedText.match(/^\[([^\]]*)\]\(([^)]*)\)$/);

    editor.focus();

    if (linkMatch) {
      // Remove link formatting, keep just the text
      document.execCommand('insertText', false, linkMatch[1]);
      editor.selectionStart = start;
      editor.selectionEnd = start + linkMatch[1].length;
    } else {
      // Add link formatting
      const replacement = `[${selectedText}](url)`;
      document.execCommand('insertText', false, replacement);
      // Select 'url' for easy replacement
      const urlStart = start + selectedText.length + 3;
      editor.selectionStart = urlStart;
      editor.selectionEnd = urlStart + 3;
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    updateToolbarState();
  }

  function toggleCodeBlock() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;
    const selectedText = value.substring(start, end);

    editor.focus();

    // Check if already a code block
    if (selectedText.startsWith('```') && selectedText.endsWith('```')) {
      // Remove code block
      let inner = selectedText.substring(3, selectedText.length - 3);
      // Remove first line if it's the language specifier
      if (inner.startsWith('\n')) {
        inner = inner.substring(1);
      } else {
        const firstNewline = inner.indexOf('\n');
        if (firstNewline !== -1) {
          inner = inner.substring(firstNewline + 1);
        }
      }
      if (inner.endsWith('\n')) {
        inner = inner.substring(0, inner.length - 1);
      }
      document.execCommand('insertText', false, inner);
      editor.selectionStart = start;
      editor.selectionEnd = start + inner.length;
    } else {
      // Add code block
      const replacement = '```\n' + selectedText + '\n```';
      document.execCommand('insertText', false, replacement);
      editor.selectionStart = start;
      editor.selectionEnd = start + replacement.length;
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    updateToolbarState();
  }

  // Formatting toolbar button event listeners
  document.getElementById('fmt-bold').addEventListener('click', () => toggleWrapFormatting('**', '**'));
  document.getElementById('fmt-italic').addEventListener('click', () => toggleWrapFormatting('*', '*'));
  document.getElementById('fmt-strikethrough').addEventListener('click', () => toggleWrapFormatting('~~', '~~'));
  document.getElementById('fmt-code').addEventListener('click', () => toggleWrapFormatting('`', '`'));
  document.getElementById('fmt-h1').addEventListener('click', () => toggleHeading(1));
  document.getElementById('fmt-h2').addEventListener('click', () => toggleHeading(2));
  document.getElementById('fmt-h3').addEventListener('click', () => toggleHeading(3));
  document.getElementById('fmt-h4').addEventListener('click', () => toggleHeading(4));
  document.getElementById('fmt-h5').addEventListener('click', () => toggleHeading(5));
  document.getElementById('fmt-h6').addEventListener('click', () => toggleHeading(6));
  document.getElementById('fmt-link').addEventListener('click', toggleLink);
  document.getElementById('fmt-ul').addEventListener('click', () => toggleLinePrefix('- '));
  document.getElementById('fmt-ol').addEventListener('click', toggleNumberedList);
  document.getElementById('fmt-quote').addEventListener('click', () => toggleLinePrefix('> '));
  document.getElementById('fmt-codeblock').addEventListener('click', toggleCodeBlock);

  // Update toolbar button active states on selection change
  editor.addEventListener('select', updateToolbarState);
  editor.addEventListener('click', updateToolbarState);
  editor.addEventListener('keyup', updateToolbarState);

  // Keyboard shortcuts for formatting
  editor.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          toggleWrapFormatting('**', '**');
          break;
        case 'i':
          e.preventDefault();
          toggleWrapFormatting('*', '*');
          break;
      }
    }
  });

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

  // Word, character, and line count tracking
  function updateWordCount() {
    const text = editor.value;
    const trimmedText = text.trim();
    const words = trimmedText ? trimmedText.split(/\s+/).length : 0;
    const chars = text.length;
    const lines = text ? text.split('\n').length : 0;
    wordCountSpan.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    charCountSpan.textContent = `${chars} char${chars !== 1 ? 's' : ''}`;
    lineCountSpan.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
  }

  // Update cursor position on various events
  editor.addEventListener('keyup', () => {
    updateCursorPosition();
    updateActiveOutlineItem();
  });
  editor.addEventListener('click', () => {
    updateCursorPosition();
    updateActiveOutlineItem();
  });
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
      // Strip frontmatter (YAML between --- markers at the start)
      let content = fileData.content;
      const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n?/;
      content = content.replace(frontmatterRegex, '');

      window.electronAPI.parseMarkdown(content).then((html) => {
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

  function getParentFolder(filePath) {
    if (filePath.startsWith('untitled:')) {
      return '';
    }
    const parts = filePath.split(/[/\\]/);
    if (parts.length >= 2) {
      // Return parent folder name
      return parts[parts.length - 2];
    }
    return '';
  }

  function updateCurrentFilePath() {
    if (!activeFilePath || activeFilePath.startsWith('untitled:')) {
      currentFilePathSpan.textContent = '';
      currentFilePathSpan.title = '';
      return;
    }
    currentFilePathSpan.textContent = activeFilePath;
    currentFilePathSpan.title = activeFilePath;
  }

  // Render the file list in sidebar
  function renderFileList() {
    fileList.innerHTML = '';
    openFiles.forEach((fileData, filePath) => {
      const li = document.createElement('li');
      li.className = filePath === activeFilePath ? 'active' : '';
      li.title = filePath;
      const parentFolder = getParentFolder(filePath);
      li.innerHTML = `
        <span class="file-icon">📄</span>
        <div class="file-info">
          <span class="file-name">${getFileName(filePath)}</span>
          ${parentFolder ? `<span class="file-path">${parentFolder}</span>` : ''}
        </div>
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
      const parentFolder = getParentFolder(filePath);
      tab.innerHTML = `
        <div class="tab-info">
          <span class="tab-name">${getFileName(filePath)}</span>
          ${parentFolder ? `<span class="tab-path">${parentFolder}</span>` : ''}
        </div>
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

    // Close any open AI panels to prevent inserting into wrong file
    document.dispatchEvent(new CustomEvent('plugin:close-inline-diff'));
    document.dispatchEvent(new CustomEvent('plugin:close-inline-prompt'));

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
    document.title = `${fileName} - Markdown Editor`;

    saveBtn.disabled = !fileData.unsaved;

    updatePreview();
    updateLineNumbers();
    updateCursorPosition();
    updateWordCount();
    syncLineNumbersScroll();
    renderFileList();
    renderTabs();
    renderOutline();
    updateCurrentFilePath();
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
      formattingToolbarInline.style.display = 'none';
      fileNameSpan.textContent = '';
      document.title = 'Markdown Editor';
      editor.value = '';
      contentDiv.innerHTML = '';
      renderOutline();
      updateCurrentFilePath();
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

    // Close any open AI panels to prevent inserting into wrong file
    document.dispatchEvent(new CustomEvent('plugin:close-inline-diff'));
    document.dispatchEvent(new CustomEvent('plugin:close-inline-prompt'));

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
    formattingToolbarInline.style.display = 'flex';
    setViewMode('split');

    editor.value = content;
    editor.selectionStart = 0;
    editor.selectionEnd = 0;
    editor.scrollTop = 0;

    updatePreview();
    updateLineNumbers();
    updateCursorPosition();
    updateWordCount();
    renderFileList();
    renderTabs();
    renderOutline();
    updateCurrentFilePath();
  }

  function newFile() {
    // Close any open AI panels to prevent inserting into wrong file
    document.dispatchEvent(new CustomEvent('plugin:close-inline-diff'));
    document.dispatchEvent(new CustomEvent('plugin:close-inline-prompt'));

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
    formattingToolbarInline.style.display = 'flex';
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
    updateWordCount();
    renderFileList();
    renderTabs();
    renderOutline();
    updateCurrentFilePath();

    editor.focus();
  }

  function isUntitledFile(filePath) {
    return filePath && filePath.startsWith('untitled:');
  }

  // Editor input handler with debounced preview update
  let debounceTimer;
  let outlineDebounceTimer;
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
    updateWordCount();

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

    // Debounced outline update (longer delay since structure changes less frequently)
    clearTimeout(outlineDebounceTimer);
    outlineDebounceTimer = setTimeout(renderOutline, 300);
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

  // Open links in preview pane in external browser
  contentDiv.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href) {
      e.preventDefault();
      window.electronAPI.openExternal(link.href);
    }
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

  // Handle right-click context menu
  editor.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.electronAPI.showContextMenu({
      selectedText: editor.value.substring(editor.selectionStart, editor.selectionEnd),
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd
    });
  });

  // Handle cut, copy, paste from context menu
  window.electronAPI.onEditorCut(() => {
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      editor.focus();
      document.execCommand('insertText', false, '');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  window.electronAPI.onEditorCopy(() => {
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
    }
  });

  window.electronAPI.onEditorPaste(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editor.focus();
        document.execCommand('insertText', false, text);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  });

  // Handle plugin context menu actions
  window.pluginAPI.onContextMenuAction((data) => {
    // Dispatch event for plugin host to handle
    document.dispatchEvent(new CustomEvent('plugin:context-menu-action', { detail: data }));
  });

  // Handle AI actions from context menu
  window.electronAPI.onAIAction((data) => {
    const { actionId, selectedText, selectionStart, selectionEnd } = data;
    // Restore selection in editor
    editor.focus();
    editor.setSelectionRange(selectionStart, selectionEnd);
    // Dispatch to plugin
    document.dispatchEvent(new CustomEvent('plugin:context-menu-action', {
      detail: {
        pluginId: 'ai-editor',
        actionId,
        selectedText,
        selectionStart,
        selectionEnd
      }
    }));
  });

  // Cmd/Ctrl+K shortcut for AI Generate with prompt
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();

      // Check if the AI plugin is loaded/enabled
      if (!window.pluginHost || !window.pluginHost.getPlugin('ai-editor')) {
        return;
      }

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
  let inlineDiffOnAbort = null;
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

    // Re-enable editor and accept button for next use
    editor.readOnly = false;
    inlineDiffAccept.disabled = false;

    // Abort the stream if rejecting
    if (action === 'reject' && inlineDiffOnAbort) {
      inlineDiffOnAbort();
      inlineDiffOnAbort = null;
    }

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
    const { actionLabel, originalText, resolve, onAbort } = e.detail;

    // Reject any pending promise before opening new dialog
    if (inlineDiffResolve) {
      if (inlineDiffOnAbort) inlineDiffOnAbort();
      inlineDiffResolve('reject');
      inlineDiffResolve = null;
      inlineDiffOnAbort = null;
    }

    inlineDiffAction.textContent = actionLabel;
    inlineDiffAction.classList.add('generating');
    inlineDiffOriginal.textContent = originalText || '(empty)';
    inlineDiffGenerated.textContent = '';
    inlineDiffGenerated.classList.add('streaming');
    inlineDiffResolve = resolve;
    inlineDiffOnAbort = onAbort;
    inlineDiffOriginalText = originalText;
    inlineDiffGeneratedText = '';
    inlineDiffSelectionStart = editor.selectionStart;
    inlineDiffSelectionEnd = editor.selectionEnd;

    // Make editor read-only while diff panel is open to preserve selection positions
    editor.readOnly = true;

    // Disable Accept button until generation completes
    inlineDiffAccept.disabled = true;

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
    // Enable Accept button now that generation is complete
    inlineDiffAccept.disabled = false;
  });

  document.addEventListener('plugin:close-inline-diff', () => {
    closeInlineDiff('reject');
  });

  document.addEventListener('plugin:set-inline-diff-abort', (e) => {
    inlineDiffOnAbort = e.detail.abort;
  });

  inlineDiffReject.addEventListener('click', () => closeInlineDiff('reject'));
  inlineDiffAccept.addEventListener('click', () => closeInlineDiff('accept'));

  // Close panel when clicking outside of it (allows clicking tabs, sidebar, etc.)
  document.addEventListener('mousedown', (e) => {
    if (inlineDiffPanel.classList.contains('hidden')) return;
    if (!inlineDiffPanel.contains(e.target)) {
      closeInlineDiff('reject');
    }
  });

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

  document.addEventListener('plugin:close-inline-prompt', () => {
    closeInlinePrompt(null);
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
