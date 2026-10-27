(() => {
  const dialog = document.getElementById("pix-welcome");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const key = "walk_cards_pix_welcome_10_v1";
  // Product deep links and ongoing checkout flows keep their own focus.
  if (location.hash || location.search || document.querySelector("dialog[open]")) return;
  try { if (sessionStorage.getItem(key)) return; } catch {}
  const previousFocus = document.activeElement;
  dialog.querySelectorAll("[data-close-pix-welcome]").forEach(button => {
    button.addEventListener("click", () => dialog.close());
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("pix-welcome-open");
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  });
  document.getElementById("pix-welcome-explore").addEventListener("click", () => {
    dialog.close();
    const catalog = document.getElementById("catalogo");
    if (!catalog) return;
    location.hash = "catalogo";
    catalog.setAttribute("tabindex", "-1");
    catalog.focus({ preventScroll: true });
    catalog.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  });
  dialog.showModal();
  document.body.classList.add("pix-welcome-open");
  try { sessionStorage.setItem(key, "shown"); } catch {}
})();
