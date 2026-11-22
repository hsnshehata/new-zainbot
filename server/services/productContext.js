const { inventoryUnavailable } = require('./catalogInventory');
const MAX_PRODUCTS = 10;
const MAX_DESCRIPTION = 180;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'have', 'your', 'what', 'which', 'show', 'please',
  'want', 'need', 'about', 'price', 'prices', 'product', 'products', 'item', 'items',
  'any', 'are', 'you', 'how', 'much', 'do', 'does', 'is', 'a', 'an', 'of', 'to', 'in',
  'هل', 'عندك', 'عندكم', 'عايز', 'عاوز', 'محتاج', 'ممكن', 'ايه', 'إيه', 'كام', 'بكام',
  'سعر', 'اسعار', 'أسعار', 'منتج', 'منتجات', 'في', 'من', 'عن', 'على', 'هو', 'هي', 'ده',
  'دي', 'اللي', 'لو', 'مع', 'و', 'او', 'أو', 'علي', 'عند', 'لديك'
]);

function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFKC')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

function tokens(text) {
  const words = normalize(text).match(/[\p{L}\p{N}]+/gu) || [];
  return words.flatMap((word) => {
    const variants = [word];
    if (word.startsWith('ال') && word.length > 4) variants.push(word.slice(2));
    if (word.endsWith('ات') && word.length > 5) variants.push(word.slice(0, -2));
    if (word.endsWith('s') && word.length > 4) variants.push(word.replace(/(?:es|s)$/, ''));
    return variants;
  }).filter((word) =>
    !STOP_WORDS.has(word) &&
    // Single-character tokens are kept when the name has more than one word:
    // they are often the only distinguishing part (منتج أ / منتج ب). A lone
    // one-character word on its own carries no signal and is still dropped.
    (word.length > 1 || words.length > 1)
  );
}

function compact(value, limit) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

// Links must stay on this deployment. Never infer the primary domain when
// configuration is absent or malformed, and never use request Host headers.
function buildStorefrontUrl(storeLink, productId, origin = process.env.APP_URL || process.env.BASE_URL) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(storeLink || ''))) return null;
  if (productId != null && !/^[a-f\d]{24}$/i.test(String(productId))) return null;
  try {
    const base = new URL(origin);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password ||
        base.pathname !== '/' || base.search || base.hash) return null;
    const link = new URL(`/store/${storeLink}/landing`, base.origin);
    if (productId != null) link.searchParams.set('product', String(productId));
    return link.href;
  } catch { return null; }
}

function buildProductContext(products, message, storeLink, origin) {
  const active = (products || []).filter((product) => product && product.isActive !== false);
  if (!active.length) return 'لا توجد منتجات متاحة حاليًا في المتجر.\n';

  const availability = active.some(p => p.importSource) ? 'بالكتالوج' : 'متاح';
  const query = new Set(tokens(message));
  const ranked = active.map((product, index) => {
    const names = new Set(tokens(product.productName));
    const descriptions = new Set(tokens(product.description));
    let score = 0;
    for (const word of query) {
      if (names.has(word)) score += 3;
      else if (descriptions.has(word)) score += 1;
    }
    return { product, index, score };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_PRODUCTS);

  if (!ranked.length) {
    return `المتجر لديه ${active.length} منتج ${availability}، لكن لم يُعثر على منتج يطابق رسالة العميل في بيانات الكتالوج. لا تفترض وجود منتج أو سعر؛ اطلب اسم المنتج أو تفاصيل أدق ووجّه العميل لرابط المتجر.\n`;
  }

  const link = /^[a-zA-Z0-9_-]+$/.test(String(storeLink || '')) ? storeLink : null;
  const lines = ranked.map(({ product }) => {
    const basePrice = Number(product.price);
    const discountedPrice = Number(product.discountedPrice);
    const price = product.hasOffer && product.discountedPrice != null &&
      Number.isFinite(discountedPrice) && discountedPrice >= 0 ? discountedPrice : basePrice;
    const currency = ['EGP', 'USD', 'SAR'].includes(product.currency) ? product.currency : '';
    const id = String(product._id || '');
    const url = link ? buildStorefrontUrl(link, id, origin) : null;
    return `المنتج: ${compact(product.productName, 100)}، السعر: ${Number.isFinite(price) && price >= 0 ? price : 'غير متوفر'} ${currency || ''}، ` +
      `الرابط: ${url || 'غير متوفر'}، الوصف: ${compact(product.description, MAX_DESCRIPTION) || 'غير متوفر'}، ` +
       `المخزون: ${inventoryUnavailable(product) ? 'غير مؤكد، لا يمكن تأكيد الطلب قبل تسوية المخزون' : product.stockTracked === false ? 'غير متتبع' : Number.isFinite(Number(product.stock)) ? product.stock : 'غير متوفر'}.`;
  });
  const safety = active.some(p => inventoryUnavailable(p)) ? 'تنبيه: وجود المنتج في الكتالوج لا يعني توفر وحدات للبيع. الكميات غير المؤكدة لا تقبل الطلب.\n' : '';
  return safety + `${availability === 'بالكتالوج' ? 'منتجات مسجلة' : 'منتجات متاحة'} ذات صلة برسالة العميل (حتى ${MAX_PRODUCTS} من أصل ${active.length} منتج ${availability}؛ هذه ليست القائمة الكاملة). استخدم التفاصيل والأسعار والروابط أدناه فقط، ولا تفترض توفر منتج غير مذكور:\n${lines.join('\n')}\n`;
}

// Offer-aware catalog price: the only price an order may ever carry.
function effectiveProductPrice(product) {
  const basePrice = Number(product?.price);
  const discountedPrice = Number(product?.discountedPrice);
  const price = product?.hasOffer && product?.discountedPrice != null &&
    Number.isFinite(discountedPrice) && discountedPrice >= 0 ? discountedPrice : basePrice;
  return Number.isFinite(price) && price >= 0 ? price : 0;
}

module.exports = { buildProductContext, buildStorefrontUrl, effectiveProductPrice, normalize, tokens };
