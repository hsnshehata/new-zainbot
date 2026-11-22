// Safe output helpers for the public storefront. Stored store/product/category
// text is data: it is shown literally and never parsed as markup. URLs from
// stored data are only used when they are http(s), same-site relative paths,
// or (for images) data:image/* URLs.
(function(){
  const MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;', '`':'&#96;' };
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"'`]/g, ch => MAP[ch]); }
  function parse(v){
    try { return new URL(String(v).trim(), location.href); } catch (_) { return null; }
  }
  // Returns an attribute-safe URL, or the (escaped) fallback when unsafe.
  function url(v, fallback){
    const raw = v == null ? '' : String(v).trim();
    if (!raw) return esc(fallback || '');
    const u = parse(raw);
    if (u && (u.protocol === 'http:' || u.protocol === 'https:')) return esc(raw);
    return esc(fallback || '');
  }
  function img(v, fallback){
    const raw = v == null ? '' : String(v).trim();
    if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(raw)) return esc(raw);
    return url(raw, fallback);
  }
  // wa.me expects digits only; tel/mailto keep scheme fixed and escape the rest.
  function digits(v){ return esc(String(v == null ? '' : v).replace(/\D/g, '')); }
  function tel(v){ return esc(String(v == null ? '' : v).replace(/[^\d+*#,;]/g, '')); }
  function mail(v){ return esc(encodeURI(String(v == null ? '' : v).trim())); }
  // Only plain CSS colours or theme variables may reach a style attribute.
  function color(v, fallback){
    const raw = v == null ? '' : String(v).trim();
    const ok = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|var\(--[\w-]+\)|(rgb|hsl)a?\([\d\s.,%\/]+\))$/i.test(raw);
    return esc(ok ? raw : (fallback || 'var(--primary-color)'));
  }
  // Allow-list for the enumerated link-type values stored in config.
  function token(v, allowed, fallback){ const raw = String(v == null ? '' : v); return allowed.includes(raw) ? raw : (fallback || ''); }
  function inventoryNotice(){
    return /^en(?:-|$)/i.test(document.documentElement.lang || '')
      ? 'Quantity is unconfirmed in the connected store. Confirm quantity before ordering.'
      : 'الكمية غير مؤكدة في المتجر المتصل. يلزم تأكيدها قبل الشراء.';
  }
  window.StorefrontSafe = { esc, url, img, digits, tel, mail, color, token, inventoryNotice };
})();
