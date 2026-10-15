import { currentSection } from "../lib/current-section";

/** The desktop list and mobile summary follow the same navigation and scroll rules. */
class DocumentationContents extends HTMLElement {
  private dispose?: () => void;

  connectedCallback() {
    const controller = new AbortController();
    const { signal } = controller;
    const links = [...this.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const sections = links.flatMap(link => {
      const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      return heading ? [{ link, heading }] : [];
    });
    let destination: string | undefined;
    let restingY = scrollY;
    let settling = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;

    const render = () => {
      frame = 0;
      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const mobileHeight = document.querySelector('atomize-toc[data-mobile] summary')?.getBoundingClientRect().height ?? 0;
      const atBottom = scrollY > 0 && Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2;
      const id = currentSection(sections.map(({ heading }) => ({ id: heading.id, top: heading.getBoundingClientRect().top })), headerHeight + mobileHeight + 32, atBottom, destination);
      for (const { link, heading } of sections) {
        if (heading.id === id) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
      const label = this.querySelector("[data-current-label]");
      if (label) label.textContent = sections.find(section => section.heading.id === id)?.link.textContent ?? "";
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
    const settle = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => { restingY = scrollY; settling = false; }, 150);
    };
    const navigate = (id: string) => {
      destination = sections.some(section => section.heading.id === id) ? id : undefined;
      settling = true;
      settle();
      schedule();
    };
    const clearDestination = () => { destination = undefined; schedule(); };
    window.addEventListener("scroll", () => {
      if (!settling && scrollY !== restingY) destination = undefined;
      schedule();
      settle();
    }, { passive: true, signal });
    window.addEventListener("resize", schedule, { signal });
    window.addEventListener("wheel", clearDestination, { passive: true, signal });
    window.addEventListener("touchstart", clearDestination, { passive: true, signal });
    window.addEventListener("keydown", event => {
      if ((event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) clearDestination();
      if (event.key === "Escape") {
        const details = this.querySelector("details");
        if (details?.open) { details.open = false; this.querySelector("summary")?.focus(); }
      }
    }, { signal });
    window.addEventListener("hashchange", () => navigate(decodeURIComponent(location.hash.slice(1))), { signal });
    document.addEventListener("click", event => {
      const link = (event.target as Element)?.closest<HTMLAnchorElement>('atomize-toc a[href^="#"]');
      if (link && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) navigate(decodeURIComponent(link.hash.slice(1)));
      const details = this.querySelector("details");
      if (details && (link || !this.contains(event.target as Node))) details.open = false;
    }, { signal });
    navigate(decodeURIComponent(location.hash.slice(1)));
    this.dispose = () => { controller.abort(); clearTimeout(settleTimer); cancelAnimationFrame(frame); };
  }

  disconnectedCallback() { this.dispose?.(); }
}

if (!customElements.get("atomize-toc")) customElements.define("atomize-toc", DocumentationContents);
