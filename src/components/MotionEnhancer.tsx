import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const REVEAL_SELECTOR = [
  '.public-catalogue #catalogue-results article',
  '[data-reveal]',
].join(',');

export default function MotionEnhancer() {
  const location = useLocation();

  useLayoutEffect(() => {
    const documentRoot = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      documentRoot.classList.remove('ky-motion-ready');
      return;
    }

    documentRoot.classList.add('ky-motion-ready');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('ky-reveal-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.06 });

    const prepare = (element: HTMLElement) => {
      if (!element.classList.contains('ky-reveal')) element.classList.add('ky-reveal');
      if (element.classList.contains('ky-reveal-visible')) return;
      observer.observe(element);
    };

    const enrol = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.matches(REVEAL_SELECTOR)) prepare(root);
      root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(prepare);
    };

    // Remove classes left by older hot-reloaded builds. Transforms must never
    // remain on page roots because they reposition fixed dialogs and sidebars.
    document.querySelectorAll<HTMLElement>('main > div.ky-reveal, .admin-shell.ky-reveal').forEach((element) => {
      element.classList.remove('ky-reveal', 'ky-reveal-visible');
    });
    enrol(document);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        enrol(node);
      }));
    });
    mutations.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
      documentRoot.classList.remove('ky-motion-ready');
    };
  }, [location.pathname, location.search]);

  return null;
}
