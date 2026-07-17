// 封面灯箱：点击封面放大查看
import { setupModalA11y } from './modal-a11y';

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

  // spec §8：Esc 关闭 + 焦点 trap + 焦点还原（keydown 由 helper 统一接管）
  setupModalA11y(lightbox, closeLightbox, closeBtn);
}
