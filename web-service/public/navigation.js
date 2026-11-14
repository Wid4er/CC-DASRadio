const pages = new Map([
  ["/", { name: "radio", title: "DAS Radio · Escucha compartida" }],
  [
    "/ayuda/musica",
    { name: "music", title: "Cargar música · DAS Radio" },
  ],
  [
    "/ayuda/discord",
    { name: "discord", title: "Configurar Discord · DAS Radio" },
  ],
]);

function showPage(url, focus = false) {
  const page = pages.get(url.pathname);
  if (!page) return;
  for (const section of document.querySelectorAll("[data-page]")) {
    section.hidden = section.dataset.page !== page.name;
  }
  for (const link of document.querySelectorAll("[data-nav]")) {
    if (link.dataset.nav === page.name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.body.classList.toggle("reading-guide", page.name !== "radio");
  document.title = page.title;
  if (focus) {
    const heading = document.querySelector(
      `[data-page="${page.name}"] h1`,
    );
    heading?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

document.addEventListener("click", (event) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = event.target.closest?.("a[href]");
  if (
    !link ||
    link.hasAttribute("download") ||
    (link.target && link.target !== "_self")
  )
    return;
  const url = new URL(link.href, window.location.href);
  if (
    url.origin !== window.location.origin ||
    !pages.has(url.pathname) ||
    url.hash
  )
    return;
  event.preventDefault();
  if (url.href !== window.location.href) {
    window.history.pushState(null, "", url.href);
  }
  // Solo cambia la sección visible: el reproductor y su sesión siguen vivos.
  showPage(url, true);
});

window.addEventListener("popstate", () => {
  showPage(new URL(window.location.href), true);
});
showPage(new URL(window.location.href));
