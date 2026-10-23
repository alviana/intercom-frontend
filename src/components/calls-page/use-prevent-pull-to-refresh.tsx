import { useEffect } from "react";

export const usePreventPullToRefresh = () => {
  useEffect(() => {
    let touchStartY = 0;
    let isPullingDown = false;

    // A scrolled container (e.g. the settings modal) must still scroll back up.
    const insideScrolledElement = (target: EventTarget | null) => {
      for (let el = target as HTMLElement | null; el; el = el.parentElement) {
        if (el.scrollTop > 0) return true;
      }
      return false;
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0].clientY;
      isPullingDown =
        window.scrollY === 0 && !insideScrolledElement(event.target); // Detect if at the top
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (isPullingDown && event.touches[0].clientY > touchStartY) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      isPullingDown = false;
    };

    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return null;
};
