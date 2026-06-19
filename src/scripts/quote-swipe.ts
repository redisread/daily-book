// 金句滑动、点赞、分享功能
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
      likeBtn.style.color = liked ? '#e74c3c' : '';
      likeBtn.style.background = liked ? 'rgba(231,76,60,0.1)' : '';
      window.showToast?.(liked ? '已喜欢这句话 ♥' : '已取消喜欢');
    });
  });

  // 复制按钮
  document.querySelectorAll('.share-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const quote = btn.getAttribute('data-quote') || '';
      const source = btn.getAttribute('data-source') || '';
      navigator.clipboard.writeText(`${quote}\n${source}\n\n—— 来自「每日一书」`).then(() => {
        window.showToast?.('金句已复制到剪贴板 ✓');
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

  function openImageModal(quote: string, source: string) {
    currentShareQuote = quote;
    currentShareSource = source;
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
      openImageModal(quote, source);
    });
  });

  imageModalClose?.addEventListener('click', closeImageModal);
  imageModal?.querySelector('.share-modal-backdrop')?.addEventListener('click', closeImageModal);

  // 生成并下载图片
  downloadBtn?.addEventListener('click', async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1080;
    canvas.height = 1080;

    // 背景渐变
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 边框
    ctx.strokeStyle = 'rgba(212, 168, 83, 0.3)';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

    // 金句文字
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 48px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';

    const maxWidth = canvas.width - 160;
    const lineHeight = 72;
    const words = currentShareQuote.split('');
    let line = '';
    let y = canvas.height / 2 - 100;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line, canvas.width / 2, y);
        line = words[i];
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, canvas.width / 2, y);

    // 来源
    ctx.fillStyle = '#a0a0b0';
    ctx.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(currentShareSource, canvas.width / 2, y + 100);

    // 品牌
    ctx.fillStyle = '#d4a853';
    ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('每日一书 · Daily Book', canvas.width / 2, canvas.height - 80);

    // 下载
    const link = document.createElement('a');
    link.download = `quote-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    window.showToast?.('图片已生成并下载 ✓');
  });

  // 复制文字
  copyTextBtn?.addEventListener('click', () => {
    navigator.clipboard.writeText(`${currentShareQuote}\n${currentShareSource}\n\n—— 来自「每日一书」`).then(() => {
      window.showToast?.('文字已复制到剪贴板 ✓');
    });
  });

  // 点击迷你金句跳转到主卡片
  document.querySelectorAll('.mini-quote-card').forEach((card) => {
    card.addEventListener('click', () => {
      const text = card.getAttribute('data-quote');
      const cards = document.querySelectorAll('.quote-card');
      const container = document.getElementById('quoteSwipeContainer');
      cards.forEach((c, index) => {
        const quoteText = c.querySelector('.quote-text')?.textContent;
        if (quoteText === text && container) {
          const track = container.querySelector('.quote-swipe-track') as HTMLElement;
          const dots = container.querySelectorAll('.quote-swipe-dot');
          if (track) {
            track!.style.transform = `translateX(-${index * 100}%)`;
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
          }
          c.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
  });
}
