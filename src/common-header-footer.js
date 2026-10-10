/** Shared chrome. No global styles, automatic DOM insertion, routing or tracking. */
const sharedKey = Symbol.for('common-header-footer.v1');
const shared = globalThis[sharedKey] ??= { requests: new Map() };
const themeKeys = ['accent', 'background', 'foreground', 'muted', 'border'];
const defaults = {
  brand: { label: '品牌', href: '/' },
  navigation: [],
  footer: { text: '公共页尾', links: [] },
  theme: {},
};

function resolveLink(link, base, footer = false) {
  if (!link || typeof link.label !== 'string' || typeof link.href !== 'string') {
    throw new TypeError('Each link requires a label and href string.');
  }
  const url = new URL(link.href, base);
  const allowed = footer ? ['http:', 'https:', 'mailto:', 'tel:'] : ['http:', 'https:'];
  if (!allowed.includes(url.protocol)) throw new TypeError(`Unsupported link protocol: ${url.protocol}`);
  return { label: link.label, href: url.href, id: String(link.id ?? ''), newTab: link.newTab === true };
}

function normalizeConfig(input, base = document.baseURI) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Config must be an object.');
  const navigation = input.navigation ?? defaults.navigation;
  const footerLinks = input.footer?.links ?? defaults.footer.links;
  if (!Array.isArray(navigation) || !Array.isArray(footerLinks)) throw new TypeError('Navigation and footer links must be arrays.');
  const theme = {};
  for (const key of themeKeys) {
    const value = input.theme?.[key];
    if (value !== undefined) {
      if (typeof value !== 'string' || !CSS.supports('color', value)) throw new TypeError(`Invalid theme color: ${key}`);
      theme[key] = value;
    }
  }
  return {
    brand: resolveLink({ ...defaults.brand, ...input.brand }, base),
    navigation: navigation.map(link => resolveLink(link, base)),
    footer: { text: String(input.footer?.text ?? defaults.footer.text), links: footerLinks.map(link => resolveLink(link, base, true)) },
    theme,
  };
}

async function fetchConfig(source, reload = false) {
  const url = new URL(source, document.baseURI);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('config-src must use HTTP or HTTPS.');
  if (reload) shared.requests.delete(url.href);
  let request = shared.requests.get(url.href);
  if (!request) {
    request = fetch(url.href, { credentials: 'same-origin', cache: 'no-cache', signal: AbortSignal.timeout(10_000) }).then(async response => {
      if (!response.ok) throw new Error(`Config request failed (${response.status}).`);
      return normalizeConfig(await response.json(), response.url || url.href);
    });
    shared.requests.set(url.href, request);
    request.catch(() => {
      if (shared.requests.get(url.href) === request) shared.requests.delete(url.href);
    });
  }
  return request;
}

function setTheme(node, theme) {
  for (const key of themeKeys) {
    node.style.removeProperty(`--chf-${key}`);
    if (theme[key]) node.style.setProperty(`--chf-${key}`, theme[key]);
  }
}

function linkElement(link, current) {
  const anchor = document.createElement('a');
  anchor.textContent = link.label;
  anchor.href = link.href;
  if (link.newTab) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.setAttribute('aria-label', `${link.label}（在新标签页打开）`);
  }
  const target = new URL(link.href);
  const isCurrent = current !== null
    ? Boolean(link.id) && link.id === current
    : target.origin === location.origin && target.pathname === location.pathname && target.search === location.search;
  if (isCurrent) anchor.setAttribute('aria-current', 'page');
  return anchor;
}

const chromeStyle = `
  :host { display: block; min-inline-size: 0; font-family: var(--chf-font-family, system-ui, sans-serif); font-size: 14px; line-height: 1.5; }
  :host([hidden]), :host([data-chf-suspended]) { display: none !important; }
  * { box-sizing: border-box; }
  .surface { color: var(--chf-foreground, #172c28); background: var(--chf-background, #fff); }
  .inner { max-inline-size: var(--chf-max-width, 1200px); margin-inline: auto; padding: .85rem clamp(1rem, 3vw, 2rem); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .6rem 1.5rem; }
  a { color: inherit; text-decoration: none; border-radius: .25rem; overflow-wrap: anywhere; }
  a:hover { text-decoration: underline; text-underline-offset: .25em; }
  a:focus-visible { outline: 2px solid var(--chf-accent, #176b55); outline-offset: 4px; }
  a[aria-current="page"] { color: var(--chf-accent, #176b55); text-decoration: underline; text-underline-offset: .3em; }
  nav { min-inline-size: 0; }
  ul { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem 1.1rem; list-style: none; margin: 0; padding: 0; }
  li { min-inline-size: 0; max-inline-size: 100%; }
  li a { display: inline-block; padding-block: .35rem; }
  .brand { font-size: 1.05rem; font-weight: 700; letter-spacing: -.02em; min-inline-size: 0; max-inline-size: 100%; }
  header { border-block-end: 1px solid var(--chf-border, #dce6e0); }
  footer { border-block-start: 1px solid var(--chf-border, #dce6e0); }
  footer .inner { padding-block: .55rem; font-size: .8rem; color: var(--chf-muted, #52645f); }
  p { margin: 0; overflow-wrap: anywhere; min-inline-size: 0; }
  @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
`;

class ConfigurableElement extends HTMLElement {
  static observedAttributes = ['config-src', 'current'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = normalizeConfig({});
    this._loadVersion = 0;
    this._hasInlineConfig = false;
    this._pauses = new Set();
    this.ready = Promise.resolve(true);
  }

  connectedCallback() {
    // Preserve property assignments made before the module upgraded this element.
    if (Object.hasOwn(this, 'config')) {
      const value = this.config;
      delete this.config;
      this.config = value;
    }
    this._render();
    if (this.hasAttribute('config-src') && !this._hasInlineConfig) this.ready = this._loadConfig();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'config-src') {
      this._hasInlineConfig = false;
      // Invalidate a pending request even when the element is currently detached.
      this._loadVersion++;
      if (this.isConnected) this.ready = this._loadConfig();
    } else if (this.isConnected) {
      this._render();
    }
  }

  set config(value) {
    const config = normalizeConfig(value);
    this._hasInlineConfig = true;
    this._loadVersion++;
    this._config = config;
    this.ready = Promise.resolve(true);
    if (this.isConnected) this._render();
  }

  get config() { return structuredClone(this._config); }

  async _loadConfig(reload = false) {
    const version = ++this._loadVersion;
    const source = this.getAttribute('config-src');
    if (!source) return true;
    try {
      const config = await fetchConfig(source, reload);
      if (version !== this._loadVersion) return false;
      this._config = config;
      this._render();
      this.dispatchEvent(new CustomEvent('config-load', { bubbles: true, composed: true }));
      return true;
    } catch (error) {
      if (version === this._loadVersion) {
        this.dispatchEvent(new CustomEvent('config-error', { detail: { error }, bubbles: true, composed: true }));
      }
      // Keep the previous working configuration. ready resolves false on failure.
      return false;
    }
  }

  reloadConfig() {
    this._hasInlineConfig = false;
    return this.ready = this._loadConfig(true);
  }

  show() { this.hidden = false; }
  hide() { this.hidden = true; }

  suspend() {
    const token = {};
    this._pauses.add(token);
    this._syncVisibility();
    return () => {
      if (this._pauses.delete(token)) this._syncVisibility();
    };
  }

  _syncVisibility() {
    this.toggleAttribute('data-chf-suspended', this._pauses.size > 0);
  }
}

class CommonHeader extends ConfigurableElement {
  _render() {
    const style = document.createElement('style');
    style.textContent = chromeStyle;
    const header = document.createElement('header');
    header.className = 'surface';
    header.setAttribute('part', 'surface');
    setTheme(header, this._config.theme);
    const inner = document.createElement('div');
    inner.className = 'inner';
    const brand = linkElement(this._config.brand, null);
    brand.className = 'brand';
    inner.append(brand);
    if (this._config.navigation.length) {
      const nav = document.createElement('nav');
      nav.setAttribute('aria-label', '项目导航');
      const list = document.createElement('ul');
      for (const link of this._config.navigation) {
        const item = document.createElement('li');
        item.append(linkElement(link, this.getAttribute('current')));
        list.append(item);
      }
      nav.append(list);
      inner.append(nav);
    }
    header.append(inner);
    this.shadowRoot.replaceChildren(style, header);
  }
}

class CommonFooter extends ConfigurableElement {
  _render() {
    const style = document.createElement('style');
    style.textContent = chromeStyle;
    const footer = document.createElement('footer');
    footer.className = 'surface';
    footer.setAttribute('part', 'surface');
    setTheme(footer, this._config.theme);
    const inner = document.createElement('div');
    inner.className = 'inner';
    const text = document.createElement('p');
    text.textContent = this._config.footer.text;
    inner.append(text);
    if (this._config.footer.links.length) {
      const nav = document.createElement('nav');
      nav.setAttribute('aria-label', '页尾链接');
      const list = document.createElement('ul');
      for (const link of this._config.footer.links) {
        const item = document.createElement('li');
        item.append(linkElement(link, null));
        list.append(item);
      }
      nav.append(list);
      inner.append(nav);
    }
    footer.append(inner);
    this.shadowRoot.replaceChildren(style, footer);
  }
}

class CommonShell extends ConfigurableElement {
  static observedAttributes = [...ConfigurableElement.observedAttributes, 'hide-header', 'hide-footer'];

  constructor() {
    super();
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; block-size: 100%; min-block-size: 0; min-inline-size: 0; }
        :host([hidden]) { display: none !important; }
        .frame { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; block-size: 100%; min-block-size: 0; min-inline-size: 0; }
        common-header { grid-row: 1; }
        .content { grid-row: 2; min-block-size: 0; min-inline-size: 0; }
        common-footer { grid-row: 3; }
      </style>
      <div class="frame">
        <common-header></common-header>
        <div class="content" part="content"><slot></slot></div>
        <common-footer></common-footer>
      </div>`;
    this._header = this.shadowRoot.querySelector('common-header');
    this._footer = this.shadowRoot.querySelector('common-footer');
    this._content = this.shadowRoot.querySelector('.content');
    this._observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      this.dispatchEvent(new CustomEvent('content-resize', {
        detail: { width, height }, bubbles: true, composed: true,
      }));
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this._observer.observe(this._content);
  }

  disconnectedCallback() { this._observer.disconnect(); }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'hide-header' || name === 'hide-footer') {
      if (oldValue !== newValue && this._header) this._syncVisibility();
    } else {
      super.attributeChangedCallback(name, oldValue, newValue);
    }
  }

  _render() {
    this._header.config = this._config;
    this._footer.config = this._config;
    if (this.hasAttribute('current')) this._header.setAttribute('current', this.getAttribute('current'));
    else this._header.removeAttribute('current');
    this._syncVisibility();
  }

  setVisibility(next) {
    for (const part of ['header', 'footer']) {
      if (Object.hasOwn(next, part)) {
        if (typeof next[part] !== 'boolean') throw new TypeError(`${part} visibility must be boolean.`);
      }
    }
    // Update both preferences before sending one visibility-change event.
    this._batchVisibility = true;
    for (const part of ['header', 'footer']) {
      if (Object.hasOwn(next, part)) this.toggleAttribute(`hide-${part}`, !next[part]);
    }
    this._batchVisibility = false;
    this._syncVisibility();
  }

  _setPart(part, visible) {
    if (!['header', 'footer', 'both'].includes(part)) throw new TypeError('Choose header, footer or both.');
    this.setVisibility(part === 'both' ? { header: visible, footer: visible } : { [part]: visible });
  }

  show(part = 'both') { this._setPart(part, true); }
  hide(part = 'both') { this._setPart(part, false); }

  getVisibility() {
    return { header: !this.hasAttribute('hide-header') && this._pauses.size === 0,
      footer: !this.hasAttribute('hide-footer') && this._pauses.size === 0 };
  }

  _syncVisibility() {
    if (this._batchVisibility) return;
    const visibility = this.getVisibility();
    this._header.hidden = !visibility.header;
    this._footer.hidden = !visibility.footer;
    const signature = JSON.stringify(visibility);
    if (signature !== this._lastVisibility) {
      this._lastVisibility = signature;
      this.dispatchEvent(new CustomEvent('visibility-change', { detail: visibility, bubbles: true, composed: true }));
    }
  }

  getContentRect() { return this._content.getBoundingClientRect(); }
}

// Multiple script URLs/bundles may register the same library; first registration wins.
for (const [name, constructor] of [
  ['common-header', CommonHeader], ['common-footer', CommonFooter], ['common-shell', CommonShell],
]) {
  if (!customElements.get(name)) customElements.define(name, constructor);
}
