// localStorage 操作：标记已读、收藏
const READ_KEY = 'dailybook_read';
const COLLECTIONS_KEY = 'dailybook_collections';

function getArray(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

export function markAsRead(bookTitle: string): boolean {
  const readBooks = getArray(READ_KEY);
  if (readBooks.includes(bookTitle)) {
    return false;
  }
  readBooks.push(bookTitle);
  localStorage.setItem(READ_KEY, JSON.stringify(readBooks));
  return true;
}

export function isCollected(bookTitle: string): boolean {
  return getArray(COLLECTIONS_KEY).includes(bookTitle);
}

export function toggleCollection(bookTitle: string): boolean {
  const cols = getArray(COLLECTIONS_KEY);
  const idx = cols.indexOf(bookTitle);
  if (idx > -1) {
    cols.splice(idx, 1);
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cols));
    return false; // 已取消
  }
  cols.push(bookTitle);
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cols));
  return true; // 已收藏
}

export function initBookActions(bookTitle: string) {
  // Use data attributes to find buttons for this specific card
  const markReadBtn = document.querySelector<HTMLButtonElement>(`[data-action="markRead"][data-title="${CSS.escape(bookTitle)}"]`);
  const collectBtn = document.querySelector<HTMLButtonElement>(`[data-action="collect"][data-title="${CSS.escape(bookTitle)}"]`);

  markReadBtn?.addEventListener('click', () => {
    if (markAsRead(bookTitle)) {
      window.showToast?.(`《${bookTitle}》已标记为已读 📚`);
      markReadBtn.textContent = '✅ 已读';
      markReadBtn.disabled = true;
    } else {
      window.showToast?.('这本书已经标记过了');
    }
  });

  if (collectBtn) {
    if (isCollected(bookTitle)) {
      collectBtn.innerHTML = '♥ 已收藏';
      collectBtn.style.color = 'var(--accent)';
    }
    collectBtn.addEventListener('click', () => {
      const collected = toggleCollection(bookTitle);
      if (collected) {
        collectBtn.innerHTML = '♥ 已收藏';
        collectBtn.style.color = 'var(--accent)';
        window.showToast?.('已加入收藏 ♥');
      } else {
        collectBtn.innerHTML = '♡ 收藏';
        collectBtn.style.color = '';
        window.showToast?.('已取消收藏');
      }
    });
  }
}
