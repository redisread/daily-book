// 金句滑动、点赞、分享功能
import { setupModalA11y } from './modal-a11y';
import { getBookIssueNumber } from '../data/books';

export function initQuoteSwipe() {
  const container = document.getElementById('quoteSwipeContainer');
  const track = document.getElementById('quoteSwipeTrack');
  const dotsContainer = document.getElementById('quoteSwipeDots');
  const cards = track?.querySelectorAll('.quote-card');

  if (!container || !track || !cards || cards.length === 0) return;

  // 创建指示点
  cards.forEach((_, index) => {
    const dot = document.createElement('div');
    dot.className = 'quote-swipe-dot' + (index === 0 ? ' active' : '');
    dot.addEventListener('click', () => goToSlide(index));
    dotsContainer?.appendChild(dot);
  });

  const dots = dotsContainer?.querySelectorAll('.quote-swipe-dot');
  let currentIndex = 0;
  let startX = 0;
  let currentX = 0;
  let isDragging = false;

  function goToSlide(index: number) {
    if (index < 0) index = cards!.length - 1;
    if (index >= cards!.length) index = 0;
    currentIndex = index;
    track!.style.transform = `translateX(-${index * 100}%)`;
    dots?.forEach((d, i) => d.classList.toggle('active', i === index));
  }

  // 触摸滑动
  container.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    currentX = e.touches[0].clientX;
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (!isDragging) return;
    const diff = startX - currentX;
    if (Math.abs(diff) > 50) {
      goToSlide(diff > 0 ? currentIndex + 1 : currentIndex - 1);
    }
    isDragging = false;
  });

  // 鼠标拖拽
  container.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    isDragging = true;
    container.style.cursor = 'grabbing';
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    currentX = e.clientX;
  });

  container.addEventListener('mouseup', () => {
    if (!isDragging) return;
    const diff = startX - currentX;
    if (Math.abs(diff) > 50) {
      goToSlide(diff > 0 ? currentIndex + 1 : currentIndex - 1);
    }
    isDragging = false;
    container.style.cursor = '';
  });

  container.addEventListener('mouseleave', () => {
    isDragging = false;
    container.style.cursor = '';
  });
}

export function initQuoteActions() {
  // 点赞按钮
  document.querySelectorAll('.like-btn').forEach((btn) => {
    const likeBtn = btn as HTMLElement;
    let liked = false;
    likeBtn.addEventListener('click', () => {
      liked = !liked;
      likeBtn.innerHTML = liked ? '♥' : '♡';
      likeBtn.classList.toggle('is-liked', liked);
      window.showToast?.(liked ? '已喜欢这句话' : '已取消喜欢');
    });
  });

  // 复制按钮
  document.querySelectorAll('.share-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const quote = btn.getAttribute('data-quote') || '';
      const source = btn.getAttribute('data-source') || '';
      navigator.clipboard.writeText(`${quote}\n${source}\n\n—— 来自「每日一书」`).then(() => {
        window.showToast?.('金句已复制到剪贴板');
      });
    });
  });

  // 图片生成弹窗
  const imageModal = document.getElementById('shareModal');
  const imageModalClose = document.getElementById('shareModalClose');
  const sharePreviewQuote = document.getElementById('sharePreviewQuote');
  const sharePreviewSource = document.getElementById('sharePreviewSource');
  const downloadBtn = document.getElementById('downloadShareImage');
  const copyTextBtn = document.getElementById('copyShareText');

  let currentShareQuote = '';
  let currentShareSource = '';
  // P0-4: 品牌行「daily-book · 第 XXX 期」需要 bookId → P0-1 getBookIssueNumber lookup
  let currentShareBookId: string | null = null;

  function openImageModal(quote: string, source: string, bookId: string | null) {
    currentShareQuote = quote;
    currentShareSource = source;
    currentShareBookId = bookId;
    if (sharePreviewQuote) sharePreviewQuote.textContent = quote;
    if (sharePreviewSource) sharePreviewSource.textContent = source;
    imageModal?.classList.add('active');
  }

  function closeImageModal() {
    imageModal?.classList.remove('active');
  }

  document.querySelectorAll('.image-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const quote = btn.getAttribute('data-quote') || '';
      const source = btn.getAttribute('data-source') || '';
      const bookId = btn.getAttribute('data-book-id');
      openImageModal(quote, source, bookId);
    });
  });

  imageModalClose?.addEventListener('click', closeImageModal);
  imageModal?.querySelector('.share-modal-backdrop')?.addEventListener('click', closeImageModal);

  // spec §8：Esc 关闭 + 焦点 trap + 焦点还原
  if (imageModal) setupModalA11y(imageModal, closeImageModal, imageModalClose);

  // 生成并下载图片（canvas 操作延迟到点击时）
  downloadBtn?.addEventListener('click', async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1080;
    canvas.height = 1080;

    // 背景：--bg 旧纸白（neo brutalism spec §7）
    ctx.fillStyle = '#F2F0EA';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 边框：2px 风格硬边框（放大到 1080 画布用 8px）
    ctx.strokeStyle = '#0A0A0A';
    ctx.lineWidth = 8;
    ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

    // 引用线：--accent 竖条
    ctx.fillStyle = '#C03A00';
    ctx.fillRect(100, 300, 12, 400);

    // 金句文字：--fg
    ctx.fillStyle = '#0A0A0A';
    ctx.font = '48px "Inter", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';

    const maxWidth = canvas.width - 260;
    const lineHeight = 72;
    const words = currentShareQuote.split('');
    let line = '';
    let y = canvas.height / 2 - 100;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line, canvas.width / 2 + 6, y);
        line = words[i];
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, canvas.width / 2 + 6, y);

    // 来源：--muted
    ctx.fillStyle = '#666666';
    ctx.font = '28px "JetBrains Mono", "PingFang SC", "Microsoft YaHei", monospace';
    ctx.fillText(currentShareSource, canvas.width / 2, y + 100);

    // 品牌：--accent
    // P0-4: 「daily-book · 第 XXX 期」（fallback「daily-book」当 bookId 缺失或 issueNumber 为 null）
    ctx.fillStyle = '#C03A00';
    ctx.font = '700 24px "JetBrains Mono", "PingFang SC", "Microsoft YaHei", monospace';
    const issueNumber = currentShareBookId ? getBookIssueNumber(currentShareBookId) : null;
    const brandLine = issueNumber !== null
      ? `daily-book · 第 ${issueNumber} 期`
      : 'daily-book';
    ctx.fillText(brandLine, canvas.width / 2, canvas.height - 80);

    // 下载
    const link = document.createElement('a');
    link.download = `quote-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    window.showToast?.('图片已生成并下载');
  });

  // 复制文字
  copyTextBtn?.addEventListener('click', () => {
    navigator.clipboard.writeText(`${currentShareQuote}\n${currentShareSource}\n\n—— 来自「每日一书」`).then(() => {
      window.showToast?.('文字已复制到剪贴板');
    });
  });

}
