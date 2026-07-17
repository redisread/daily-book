// 弹窗可访问性（spec §8）：Esc 关闭、焦点 trap、焦点还原
// 适用于以 .active class 控制显隐的弹窗（coverLightbox / shareModal）
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function setupModalA11y(
  modal: HTMLElement,
  close: () => void,
  initialFocus?: HTMLElement | null,
) {
  let previousFocus: HTMLElement | null = null;

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('active')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;

    // 焦点 trap：Tab 在弹窗内循环
    const focusables = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    // 兜底：焦点落在弹窗外（极端路径，如程序化管理焦点）时先拉回弹窗内
    if (!modal.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // 打开时移入焦点，关闭时还原焦点
  const observer = new MutationObserver(() => {
    if (modal.classList.contains('active')) {
      previousFocus = document.activeElement as HTMLElement | null;
      // visibility 过渡在 p=0 仍是 hidden，此时 focus() 会被静默忽略；
      // 打开后短间隔重试聚焦，直到焦点真正落入弹窗（上限 ~250ms，覆盖过渡时长）
      const target = initialFocus ?? modal.querySelector<HTMLElement>(FOCUSABLE);
      let attempts = 0;
      const tryFocus = () => {
        if (!modal.classList.contains('active')) return;
        target?.focus();
        if (document.activeElement !== target && attempts++ < 5) {
          setTimeout(tryFocus, 50);
        }
      };
      tryFocus();
    } else if (previousFocus && document.contains(previousFocus)) {
      previousFocus.focus();
      previousFocus = null;
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}
