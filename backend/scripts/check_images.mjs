import mongoose from 'mongoose';
import 'dotenv/config';
import Product from './models/Product.js';
import Brand from './models/Brand.js';

await mongoose.connect(process.env.MONGODB_URI);
const brand = await Brand.findOne({ name: /acwo/i });
if (!brand) { console.log('not found'); process.exit(1); }

const brandImages = brand.dna?.brandImages || [];
console.log('BRAND_IMAGES:', brandImages.length);
for (const img of brandImages.slice(0, 5)) {
  console.log('  URL:', (img.url || '').substring(0, 130));
  console.log('  Alt:', img.alt, '| Source:', img.source);
}

const products = await Product.find({ brand: brand._id, status: 'active' }).lean();
console.log('\nPRODUCTS:', products.length);
for (const p of products.slice(0, 5)) {
  console.log('  Title:', p.title, '| ImgCount:', (p.images || []).length);
  for (const img of (p.images || []).slice(0, 2)) {
    console.log('    ImgURL:', (img.url || '').substring(0, 140));
  }
}

// Test first brand image accessibility
if (brandImages.length > 0 && brandImages[0].url) {
  try {
    const r = await fetch(brandImages[0].url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
    console.log('\nBRAND_IMG_TEST:', r.status, r.ok ? 'OK' : 'BROKEN');
  } catch (e) { console.log('\nBRAND_IMG_ERR:', e.message); }
}

// Test first product image accessibility
const pWithImg = products.find(p => p.images?.length > 0);
if (pWithImg) {
  try {
    const r = await fetch(pWithImg.images[0].url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
    console.log('PRODUCT_IMG_TEST:', r.status, r.ok ? 'OK' : 'BROKEN', '|', pWithImg.images[0].url.substring(0, 100));
  } catch (e) { console.log('PRODUCT_IMG_ERR:', e.message, '|', pWithImg.images[0].url?.substring(0, 100)); }
}

await mongoose.disconnect();
process.exit(0);
