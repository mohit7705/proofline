import { useEffect, useRef } from "react";

/** Elements that rise into view, in order, as the page scrolls. */
const REVEAL = [
  ".section-title",
  ".section-lede",
  ".split-head p",
  ".step",
  ".role-card",
  ".verdict-row",
  ".layers li",
  ".models li",
  ".use-cases li",
  ".trust-list li",
  ".limits",
  ".live-demo-copy",
  ".demo-result-card",
].join(",");

const TILT = ".role-card, .models li";

/**
 * Motion for the landing page. Adds classes and CSS variables only; all looks
 * live in landing3d.css. Without JavaScript, or with reduced motion, the page
 * is simply the normal static page.
 */
export function useLandingMotion() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    root.classList.add("motion-ready");

    const seen = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            seen.unobserve(entry.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    root.querySelectorAll<HTMLElement>(REVEAL).forEach((el) => {
      const index = Array.from(el.parentElement?.children ?? []).indexOf(el);
      el.style.setProperty("--i", String(Math.max(0, Math.min(index, 6))));
      el.setAttribute("data-reveal", "");
      seen.observe(el);
    });
    root.querySelectorAll<HTMLElement>(TILT).forEach((el) => el.setAttribute("data-tilt", ""));

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        root.style.setProperty("--scroll", String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
        root.style.setProperty("--sy", String(Math.min(window.scrollY, 900)));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const hero = root.querySelector<HTMLElement>(".hero-3d-wrap");
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (hero) {
        const box = hero.getBoundingClientRect();
        const px = ((event.clientX - box.left) / box.width - 0.5) * 2;
        const py = ((event.clientY - box.top) / box.height - 0.5) * 2;
        const near = Math.abs(px) < 1.6 && Math.abs(py) < 1.6;
        hero.style.setProperty("--px", near ? px.toFixed(3) : "0");
        hero.style.setProperty("--py", near ? py.toFixed(3) : "0");
        hero.style.setProperty("--ry", near ? `${(px * 9).toFixed(2)}deg` : "0deg");
        hero.style.setProperty("--rx", near ? `${(-py * 6).toFixed(2)}deg` : "0deg");
      }
      const card = (event.target as HTMLElement).closest<HTMLElement>("[data-tilt]");
      if (card) {
        const box = card.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        card.style.setProperty("--ty", `${(x * 10).toFixed(2)}deg`);
        card.style.setProperty("--tx", `${(-y * 8).toFixed(2)}deg`);
      }
    };
    const onLeave = (event: PointerEvent) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>("[data-tilt]");
      card?.style.setProperty("--ty", "0deg");
      card?.style.setProperty("--tx", "0deg");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerout", onLeave);

    return () => {
      seen.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerout", onLeave);
      if (frame) cancelAnimationFrame(frame);
      root.classList.remove("motion-ready");
    };
  }, []);

  return ref;
}
