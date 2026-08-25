// ================================================
// Cookie Reader - popup.js
// Salveaza cookie-urile si cauta fereastra existenta
// ================================================

// -----------------------------------------------
// STORAGE: salveaza/incarca cookie-uri per domeniu
// -----------------------------------------------
async function saveCookies(domain, cookies) {
  const existing = await chrome.storage.local.get("cookieStore");
  const store = existing.cookieStore || {};

  store[domain] = {
    cookies,
    savedAt: new Date().toISOString(),
    url: domain,
  };

  await chrome.storage.local.set({ cookieStore: store });
  console.log(`[Storage] Salvat ${cookies.length} cookie-uri pentru: ${domain}`);
}

async function loadSavedCookies(domain) {
  const existing = await chrome.storage.local.get("cookieStore");
  const store = existing.cookieStore || {};
  return store[domain] || null;
}

async function getAllSavedDomains() {
  const existing = await chrome.storage.local.get("cookieStore");
  return existing.cookieStore || {};
}

// -----------------------------------------------
// GASESTE fereastra/tab-ul deja deschis al unui site
// -----------------------------------------------
async function findExistingTab(domain) {
  // Cauta in toate ferestrele si tab-urile
  const tabs = await chrome.tabs.query({});

  const match = tabs.find((tab) => {
    if (!tab.url) return false;
    try {
      const tabDomain = new URL(tab.url).hostname;
      // Potrivire exacta sau subdomain
      return tabDomain === domain || tabDomain.endsWith("." + domain);
    } catch {
      return false;
    }
  });

  return match || null;
}

// -----------------------------------------------
// CITESTE cookie-urile dintr-un tab specific
// -----------------------------------------------
async function readCookiesFromTab(tab) {
  const url = new URL(tab.url);
  const domain = url.hostname;

  const cookies = await chrome.cookies.getAll({ url: tab.url });

  console.log(`=== COOKIE READER ===`);
  console.log(`Tab gasit: "${tab.title}" (ID: ${tab.id})`);
  console.log(`URL: ${tab.url}`);
  console.log(`Total cookie-uri: ${cookies.length}`);
  console.table(cookies);

  // Salveaza in storage
  await saveCookies(domain, cookies);

  return { cookies, domain, tab };
}

// -----------------------------------------------
// MAIN: init popup
// -----------------------------------------------
let currentCookies = [];
let currentDomain = "";

async function init() {
  // 1. Ia tab-ul activ
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.url || activeTab.url.startsWith("chrome://")) {
    showEmpty("Nu se pot citi cookie-uri pe aceasta pagina.");
    renderSavedDomains(); // arata domeniile salvate anterior
    return;
  }

  const activeDomain = new URL(activeTab.url).hostname;

  // 2. Cauta daca exista deja un tab deschis pentru acest domeniu
  const foundTab = await findExistingTab(activeDomain);
  const targetTab = foundTab || activeTab;

  // Afiseaza info despre tab-ul gasit
  document.getElementById("domain").textContent = new URL(targetTab.url).hostname;

  if (foundTab && foundTab.id !== activeTab.id) {
    showTabBadge(`Tab existent gasit: "${foundTab.title}"`);
  }

  // 3. Citeste si salveaza cookie-urile
  try {
    const result = await readCookiesFromTab(targetTab);
    currentCookies = result.cookies;
    currentDomain = result.domain;
    render(result.cookies, result.domain);
  } catch (err) {
    showEmpty("Eroare: " + err.message);
  }
}

// -----------------------------------------------
// RENDER: afiseaza cookie-urile
// -----------------------------------------------
function render(cookies, domain) {
  const output = document.getElementById("output");
  const countEl = document.getElementById("count");
  const rawEl = document.getElementById("raw");

  countEl.textContent = `${cookies.length} cookie${cookies.length !== 1 ? "-uri" : ""}`;

  if (cookies.length === 0) {
    showEmpty("Niciun cookie gasit pe acest site.");
    rawEl.textContent = "[]";
    return;
  }

  output.innerHTML = `<div class="section-title">📍 ${domain}</div>`;

  cookies.forEach((c) => {
    const card = document.createElement("div");
    card.className = "cookie-card";

    const expires = c.expirationDate
      ? new Date(c.expirationDate * 1000).toLocaleString("ro-RO")
      : null;

    const badges = [
      c.httpOnly ? `<span class="badge httponly">HttpOnly</span>` : "",
      c.secure   ? `<span class="badge secure">Secure</span>`   : "",
      !expires   ? `<span class="badge session">Session</span>` : "",
    ].join("");

    card.innerHTML = `
      <div class="cookie-name">${escHtml(c.name)} ${badges}</div>
      <div class="cookie-row">
        <span class="label">Valoare:</span>
        <span class="val value-field">${escHtml(c.value) || "<gol>"}</span>
      </div>
      <div class="cookie-row">
        <span class="label">Domeniu:</span>
        <span class="val">${escHtml(c.domain)}</span>
      </div>
      <div class="cookie-row">
        <span class="label">Cale:</span>
        <span class="val">${escHtml(c.path)}</span>
      </div>
      <div class="cookie-row">
        <span class="label">Expira:</span>
        <span class="val">${expires || "La inchiderea sesiunii"}</span>
      </div>
      <div class="cookie-row">
        <span class="label">SameSite:</span>
        <span class="val">${c.sameSite || "unspecified"}</span>
      </div>
    `;

    output.appendChild(card);
  });

  rawEl.textContent = JSON.stringify(cookies, null, 2);
}

// Afiseaza domeniile salvate anterior in storage
async function renderSavedDomains() {
  const store = await getAllSavedDomains();
  const domains = Object.keys(store);
  if (domains.length === 0) return;

  const output = document.getElementById("output");
  output.innerHTML += `<div class="section-title" style="margin-top:10px">💾 Salvate anterior</div>`;

  domains.forEach((domain) => {
    const entry = store[domain];
    const div = document.createElement("div");
    div.className = "saved-domain";
    div.innerHTML = `
      <span class="saved-name">${escHtml(domain)}</span>
      <span class="saved-meta">${entry.cookies.length} cookie-uri · ${new Date(entry.savedAt).toLocaleString("ro-RO")}</span>
    `;
    div.addEventListener("click", () => {
      currentCookies = entry.cookies;
      currentDomain = domain;
      render(entry.cookies, domain);
    });
    output.appendChild(div);
  });
}

function showEmpty(msg) {
  document.getElementById("output").innerHTML = `<div id="empty">${msg}</div>`;
}

function showTabBadge(msg) {
  const badge = document.createElement("div");
  badge.className = "tab-badge";
  badge.textContent = msg;
  document.getElementById("controls").appendChild(badge);
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// -----------------------------------------------
// Butoane
// -----------------------------------------------
document.getElementById("btn-refresh").addEventListener("click", init);

document.getElementById("btn-copy").addEventListener("click", async () => {
  const btn = document.getElementById("btn-copy");
  await navigator.clipboard.writeText(JSON.stringify(currentCookies, null, 2));
  btn.textContent = "✓ Copiat!";
  setTimeout(() => (btn.textContent = "⎘ Copiaza JSON"), 1500);
});

// -----------------------------------------------
// Start
// -----------------------------------------------
init();
