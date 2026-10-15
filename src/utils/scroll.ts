/**
 * Scroll reset helper for Single Page Application navigation
 * Reliably scrolls to the top of:
 * - window
 * - document.documentElement and document.body
 * - Custom scrolling containers (.overflow-y-auto, main, #app, etc.)
 */
export function scrollToPageTop(behavior: ScrollBehavior = 'instant'): void {
  if (typeof window !== 'undefined') {
    try {
      window.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      window.scrollTo(0, 0);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    const scrollContainers = document.querySelectorAll(
      '.overflow-y-auto, main, #app, [data-scroll-container]'
    );
    scrollContainers.forEach((container) => {
      try {
        (container as HTMLElement).scrollTo({ top: 0, left: 0, behavior });
      } catch {
        (container as HTMLElement).scrollTop = 0;
      }
      (container as HTMLElement).scrollTop = 0;
    });
  }
}

/**
 * Multi-frame scroll to top helper that handles async component rendering and mobile touch momentum
 */
export function scrollToPageTopMultiFrame(): void {
  scrollToPageTop('instant');
  if (typeof window !== 'undefined') {
    requestAnimationFrame(() => {
      scrollToPageTop('instant');
    });
    setTimeout(() => {
      scrollToPageTop('instant');
    }, 50);
    setTimeout(() => {
      scrollToPageTop('instant');
    }, 150);
    setTimeout(() => {
      scrollToPageTop('instant');
    }, 300);
  }
}

