// 封面灯箱：点击封面放大查看
export function initLightbox() {
  const cover = document.getElementById('bookCover');
  const lightbox = document.getElementById('coverLightbox');
  const closeBtn = document.getElementById('lightboxClose');

  if (!cover || !lightbox) return;

  function openLightbox() {
    lightbox!.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox!.classList.remove('active');
    document.body.style.overflow = '';
  }

  cover.addEventListener('click', openLightbox);
  closeBtn?.addEventListener('click', closeLightbox);
  lightbox.querySelector('.lightbox-backdrop')?.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) {
      closeLightbox();
    }
  });
}
