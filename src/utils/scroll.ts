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

/**
 * Reliably scrolls to a target section or element regardless of whether the scroll container
 * is window/body or an inner overflow-y-auto flex container (such as App.vue's publicScrollContainer).
 */
export function scrollToElement(
  elOrId: string | HTMLElement,
  behavior: ScrollBehavior = 'smooth',
  offset = 70
): boolean {
  if (typeof document === 'undefined') return false;

  const target =
    typeof elOrId === 'string'
      ? document.getElementById(elOrId.replace(/^#/, ''))
      : elOrId;

  if (!target) return false;

  let scrolled = false;

  // 1. Try native scrollIntoView first (modern browsers with CSS scroll-margin-top)
  try {
    target.scrollIntoView({ behavior, block: 'start' });
    scrolled = true;
  } catch {
    // fallback below
  }

  // 2. Identify the enclosing scrollable container (e.g. .overflow-y-auto, [ref="publicScrollContainer"], main)
  let parent = target.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      const parentRect = parent.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const scrollOffset = targetRect.top - parentRect.top + parent.scrollTop - offset;

      try {
        parent.scrollTo({ top: Math.max(0, scrollOffset), behavior });
      } catch {
        parent.scrollTop = Math.max(0, scrollOffset);
      }
      scrolled = true;
      break;
    }
    parent = parent.parentElement;
  }

  // 3. Fallback to any active .overflow-y-auto on page if parent traversal was somehow stopped
  if (!scrolled) {
    const containers = document.querySelectorAll<HTMLElement>('.overflow-y-auto');
    containers.forEach((container) => {
      if (container.contains(target)) {
        const parentRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const scrollOffset = targetRect.top - parentRect.top + container.scrollTop - offset;
        try {
          container.scrollTo({ top: Math.max(0, scrollOffset), behavior });
        } catch {
          container.scrollTop = Math.max(0, scrollOffset);
        }
        scrolled = true;
      }
    });
  }

  // 4. Window scroll fallback
  if (typeof window !== 'undefined') {
    const targetY =
      target.getBoundingClientRect().top +
      (window.scrollY || window.pageYOffset || 0) -
      offset;
    try {
      window.scrollTo({ top: Math.max(0, targetY), behavior });
    } catch {
      window.scrollTo(0, Math.max(0, targetY));
    }
  }

  return scrolled;
}

