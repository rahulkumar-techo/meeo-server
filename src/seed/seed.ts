import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrismaClient } from '../generated/prisma/client.js';
import { uploadToImageKit, type UploadResult } from '../lib/imagekit.js';
import { createSeedPrismaClient, seedRbacAndSuperAdmin } from './seed-superadmin.js';

const PLACEHOLDER_PATH = path.resolve(process.cwd(), 'prisma', 'assets', 'meeo-placeholder.png');
const FORCE_IMAGE_REUPLOAD = process.env.FORCE_IMAGE_REUPLOAD === 'true';

let cachedPlaceholderBuffer: Buffer | null = null;

async function getPlaceholderBuffer(): Promise<Buffer> {
  if (!cachedPlaceholderBuffer) {
    cachedPlaceholderBuffer = await fs.readFile(PLACEHOLDER_PATH);
  }
  return cachedPlaceholderBuffer;
}

async function uploadPlaceholder(folder: string, fileName: string, tags: string[]): Promise<UploadResult> {
  const file = await getPlaceholderBuffer();
  return uploadToImageKit({
    file,
    fileName,
    folder,
    tags,
    useUniqueFileName: true,
    mimeType: 'image/png',
  });
}

const TAX_SEED = [
  { hsnCode: '8517', description: 'Smartphones and telecom apparatus', category: 'Electronics', rate: 18 },
  { hsnCode: '8518', description: 'Headphones, earphones, and audio speakers', category: 'Electronics', rate: 18 },
  { hsnCode: '6109', description: 'T-shirts, singlets, and knitted vests', category: 'Fashion', rate: 12 },
  { hsnCode: '6403', description: 'Footwear with outer soles of rubber or leather', category: 'Fashion', rate: 18 },
  { hsnCode: '7323', description: 'Kitchen and household stainless steel articles', category: 'Home & Kitchen', rate: 12 },
  { hsnCode: '3304', description: 'Beauty, skincare, and makeup preparations', category: 'Beauty', rate: 18 },
  { hsnCode: '9506', description: 'Sports, fitness, and gymnasium equipment', category: 'Sports', rate: 18 },
  { hsnCode: '4901', description: 'Printed books, notebooks, and stationery', category: 'Books', rate: 0 },
  { hsnCode: '9503', description: 'Toys, puzzles, and scale models', category: 'Toys', rate: 12 },
  { hsnCode: '2106', description: 'Gourmet food preparations and supplements', category: 'Grocery', rate: 18 },
];

const CATEGORY_SEED = [
  { name: 'Electronics', slug: 'electronics', description: 'Smartphones, audio gear, and smart gadgets', sortOrder: 1 },
  { name: 'Fashion', slug: 'fashion', description: 'Apparel, footwear, and everyday style', sortOrder: 2 },
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Cookware, storage, and home essentials', sortOrder: 3 },
  { name: 'Beauty & Personal Care', slug: 'beauty-personal-care', description: 'Skincare, grooming, and wellness care', sortOrder: 4 },
  { name: 'Sports & Fitness', slug: 'sports-fitness', description: 'Workout gear, yoga mats, and training accessories', sortOrder: 5 },
  { name: 'Books & Stationery', slug: 'books-stationery', description: 'Reading titles, journals, and desk supplies', sortOrder: 6 },
  { name: 'Toys & Games', slug: 'toys-games', description: 'Board games, STEM kits, and kids toys', sortOrder: 7 },
  { name: 'Grocery & Gourmet', slug: 'grocery-gourmet', description: 'Artisanal coffee, snacks, and pantry staples', sortOrder: 8 },
  { name: 'Automotive', slug: 'automotive', description: 'Car accessories, mounts, and care kits', sortOrder: 9 },
  { name: 'Health & Wellness', slug: 'health-wellness', description: 'Vitamins, hydration, and daily care', sortOrder: 10 },
];

const BRAND_SEED = [
  { name: 'Meeo Originals', slug: 'meeo-originals', description: 'Flagship in-house lifestyle and tech products' },
  { name: 'NovaTech', slug: 'novatech', description: 'Precision consumer electronics and audio' },
  { name: 'UrbanThread', slug: 'urbanthread', description: 'Contemporary organic cotton apparel' },
  { name: 'ChefCraft', slug: 'chefcraft', description: 'Durable stainless steel kitchenware' },
  { name: 'GlowPure', slug: 'glowpure', description: 'Dermatologist-tested clean skincare' },
  { name: 'PulseFit', slug: 'pulsefit', description: 'Performance fitness and training equipment' },
  { name: 'PaperLeaf', slug: 'paperleaf', description: 'Fountain-pen friendly notebooks and stationery' },
  { name: 'PlaySpark', slug: 'playspark', description: 'Creative educational toys and puzzles' },
  { name: 'RoastHaven', slug: 'roasthaven', description: 'Small-batch specialty coffee and gourmet treats' },
  { name: 'DriveCore', slug: 'drivecore', description: 'Smart automotive mounts and travel gear' },
];

const ATTRIBUTE_SEED = [
  { name: 'Color', values: ['Midnight Black', 'Meeo Purple', 'Arctic White'] },
  { name: 'Size', values: ['Small', 'Medium', 'Large'] },
  { name: 'Storage', values: ['64GB', '128GB', '256GB'] },
  { name: 'Material', values: ['Stainless Steel', 'Organic Cotton', 'Silicone'] },
  { name: 'Weight', values: ['250g', '500g', '1kg'] },
  { name: 'Style', values: ['Classic', 'Minimal', 'Sport'] },
  { name: 'Edition', values: ['Standard', 'Pro', 'Limited'] },
  { name: 'Capacity', values: ['500ml', '750ml', '1L'] },
  { name: 'Flavor', values: ['Classic Roast', 'Vanilla', 'Hazelnut'] },
  { name: 'Warranty', values: ['6 Months', '1 Year', '2 Years'] },
];

const PRODUCT_SEED = [
  {
    name: 'NovaTech AirBuds Pro ANC',
    slug: 'novatech-airbuds-pro-anc',
    description: 'Active noise cancelling wireless earbuds with 36-hour battery life and low-latency mode.',
    categorySlug: 'electronics',
    brandSlug: 'novatech',
    hsnCode: '8518',
    isFeatured: true,
    sku: 'SKU-MEEO-001',
    barcode: '8901000000011',
    price: 2999,
    compareAtPrice: 3999,
    costPrice: 1650,
    stock: 120,
    reorderLevel: 20,
    attributes: [
      { name: 'Color', value: 'Midnight Black' },
      { name: 'Warranty', value: '1 Year' },
    ],
    specifications: { Battery: '36 Hours', Bluetooth: '5.3', WaterResistance: 'IPX5' },
  },
  {
    name: 'Meeo Smart Phone Stand',
    slug: 'meeo-smart-phone-stand',
    description: 'CNC aluminum foldable desk stand with 360-degree rotation for phones and tablets.',
    categorySlug: 'electronics',
    brandSlug: 'meeo-originals',
    hsnCode: '8517',
    isFeatured: true,
    sku: 'SKU-MEEO-002',
    barcode: '8901000000028',
    price: 799,
    compareAtPrice: 1199,
    costPrice: 380,
    stock: 200,
    reorderLevel: 30,
    attributes: [
      { name: 'Color', value: 'Meeo Purple' },
      { name: 'Edition', value: 'Pro' },
    ],
    specifications: { Material: 'Aluminum Alloy', Compatibility: '4 to 11 inch devices' },
  },
  {
    name: 'UrbanThread Essential Crew Tee',
    slug: 'urbanthread-essential-crew-tee',
    description: '240 GSM combed organic cotton t-shirt with a relaxed everyday fit.',
    categorySlug: 'fashion',
    brandSlug: 'urbanthread',
    hsnCode: '6109',
    isFeatured: true,
    sku: 'SKU-MEEO-003',
    barcode: '8901000000035',
    price: 699,
    compareAtPrice: 999,
    costPrice: 310,
    stock: 150,
    reorderLevel: 25,
    attributes: [
      { name: 'Size', value: 'Medium' },
      { name: 'Material', value: 'Organic Cotton' },
    ],
    specifications: { Fabric: '100% Organic Cotton', GSM: '240', Fit: 'Relaxed' },
  },
  {
    name: 'ChefCraft Insulated Flask',
    slug: 'chefcraft-insulated-flask',
    description: 'Double-wall vacuum insulated stainless steel bottle that keeps drinks cold 24h or hot 12h.',
    categorySlug: 'home-kitchen',
    brandSlug: 'chefcraft',
    hsnCode: '7323',
    isFeatured: false,
    sku: 'SKU-MEEO-004',
    barcode: '8901000000042',
    price: 899,
    compareAtPrice: 1299,
    costPrice: 420,
    stock: 90,
    reorderLevel: 15,
    attributes: [
      { name: 'Capacity', value: '750ml' },
      { name: 'Material', value: 'Stainless Steel' },
    ],
    specifications: { Grade: '304 Stainless Steel', Insulation: '24h Cold / 12h Hot' },
  },
  {
    name: 'GlowPure Vitamin C Serum',
    slug: 'glowpure-vitamin-c-serum',
    description: '15% L-Ascorbic Acid brightening facial serum with hyaluronic acid and ferulic acid.',
    categorySlug: 'beauty-personal-care',
    brandSlug: 'glowpure',
    hsnCode: '3304',
    isFeatured: true,
    sku: 'SKU-MEEO-005',
    barcode: '8901000000059',
    price: 649,
    compareAtPrice: 849,
    costPrice: 260,
    stock: 180,
    reorderLevel: 30,
    attributes: [
      { name: 'Edition', value: 'Standard' },
      { name: 'Style', value: 'Minimal' },
    ],
    specifications: { Volume: '30ml', SkinType: 'All Skin Types', ParabenFree: true },
  },
  {
    name: 'PulseFit Pro Yoga Mat 6mm',
    slug: 'pulsefit-pro-yoga-mat-6mm',
    description: 'High-density non-slip TPE exercise mat with alignment lines and carrying strap.',
    categorySlug: 'sports-fitness',
    brandSlug: 'pulsefit',
    hsnCode: '9506',
    isFeatured: false,
    sku: 'SKU-MEEO-006',
    barcode: '8901000000066',
    price: 1299,
    compareAtPrice: 1799,
    costPrice: 600,
    stock: 75,
    reorderLevel: 15,
    attributes: [
      { name: 'Style', value: 'Sport' },
      { name: 'Color', value: 'Meeo Purple' },
    ],
    specifications: { Thickness: '6mm', Dimensions: '183cm x 61cm', Material: 'Eco TPE' },
  },
  {
    name: 'PaperLeaf Hardcover Dotted Journal',
    slug: 'paperleaf-hardcover-dotted-journal',
    description: 'A5 120 GSM acid-free dotted notebook with lay-flat binding and ribbon bookmark.',
    categorySlug: 'books-stationery',
    brandSlug: 'paperleaf',
    hsnCode: '4901',
    isFeatured: false,
    sku: 'SKU-MEEO-007',
    barcode: '8901000000073',
    price: 399,
    compareAtPrice: 549,
    costPrice: 160,
    stock: 250,
    reorderLevel: 40,
    attributes: [
      { name: 'Size', value: 'Medium' },
      { name: 'Style', value: 'Classic' },
    ],
    specifications: { Format: 'A5', Pages: 192, PaperWeight: '120 GSM' },
  },
  {
    name: 'PlaySpark Magnetic STEM Tiles',
    slug: 'playspark-magnetic-stem-tiles',
    description: '60-piece translucent magnetic building blocks set for creative 3D geometry play.',
    categorySlug: 'toys-games',
    brandSlug: 'playspark',
    hsnCode: '9503',
    isFeatured: true,
    sku: 'SKU-MEEO-008',
    barcode: '8901000000080',
    price: 1499,
    compareAtPrice: 1999,
    costPrice: 720,
    stock: 60,
    reorderLevel: 10,
    attributes: [
      { name: 'Edition', value: 'Limited' },
      { name: 'Weight', value: '1kg' },
    ],
    specifications: { Pieces: 60, AgeGroup: '3+ Years', Material: 'BPA-Free ABS' },
  },
  {
    name: 'RoastHaven Arabica Whole Beans',
    slug: 'roasthaven-arabica-whole-beans',
    description: '100% single-origin Chikmagalur Arabica medium roast coffee beans with cocoa notes.',
    categorySlug: 'grocery-gourmet',
    brandSlug: 'roasthaven',
    hsnCode: '2106',
    isFeatured: false,
    sku: 'SKU-MEEO-009',
    barcode: '8901000000097',
    price: 549,
    compareAtPrice: 699,
    costPrice: 240,
    stock: 110,
    reorderLevel: 20,
    attributes: [
      { name: 'Weight', value: '250g' },
      { name: 'Flavor', value: 'Classic Roast' },
    ],
    specifications: { Origin: 'Chikmagalur, India', Roast: 'Medium', Grind: 'Whole Bean' },
  },
  {
    name: 'DriveCore MagSafe Car Mount',
    slug: 'drivecore-magsafe-car-mount',
    description: 'Strong N52 neodymium magnetic dashboard and air-vent phone holder for cars.',
    categorySlug: 'automotive',
    brandSlug: 'drivecore',
    hsnCode: '8517',
    isFeatured: false,
    sku: 'SKU-MEEO-010',
    barcode: '8901000000103',
    price: 999,
    compareAtPrice: 1499,
    costPrice: 430,
    stock: 85,
    reorderLevel: 15,
    attributes: [
      { name: 'Color', value: 'Midnight Black' },
      { name: 'Warranty', value: '2 Years' },
    ],
    specifications: { Magnets: 'N52 Array', Mounting: 'Dashboard & Vent' },
  },
];

const COUPON_SEED = [
  { code: 'MEEO10', type: 'PERCENTAGE' as const, value: 10, minimumOrderAmount: 499, maximumDiscountAmount: 500, usageLimit: 1000, usageLimitPerUser: 3 },
  { code: 'WELCOME15', type: 'PERCENTAGE' as const, value: 15, minimumOrderAmount: 999, maximumDiscountAmount: 750, usageLimit: 500, usageLimitPerUser: 1 },
  { code: 'SAVE100', type: 'FIXED_AMOUNT' as const, value: 100, minimumOrderAmount: 799, maximumDiscountAmount: null, usageLimit: 1000, usageLimitPerUser: 2 },
  { code: 'FLAT250', type: 'FIXED_AMOUNT' as const, value: 250, minimumOrderAmount: 1999, maximumDiscountAmount: null, usageLimit: 500, usageLimitPerUser: 2 },
  { code: 'FREESHIP', type: 'FREE_SHIPPING' as const, value: 0, minimumOrderAmount: 299, maximumDiscountAmount: null, usageLimit: 2000, usageLimitPerUser: 5 },
  { code: 'TECH20', type: 'PERCENTAGE' as const, value: 20, minimumOrderAmount: 2499, maximumDiscountAmount: 1000, usageLimit: 300, usageLimitPerUser: 1 },
  { code: 'VIP500', type: 'FIXED_AMOUNT' as const, value: 500, minimumOrderAmount: 3999, maximumDiscountAmount: null, usageLimit: 200, usageLimitPerUser: 1 },
  { code: 'FLASH5', type: 'PERCENTAGE' as const, value: 5, minimumOrderAmount: 199, maximumDiscountAmount: 200, usageLimit: 5000, usageLimitPerUser: 5 },
  { code: 'FIT150', type: 'FIXED_AMOUNT' as const, value: 150, minimumOrderAmount: 1199, maximumDiscountAmount: null, usageLimit: 400, usageLimitPerUser: 2 },
  { code: 'FESTIVE25', type: 'PERCENTAGE' as const, value: 25, minimumOrderAmount: 2999, maximumDiscountAmount: 1500, usageLimit: 250, usageLimitPerUser: 1 },
];

export async function runSeed(prisma: PrismaClient) {
  console.log('🌱 Starting complete Meeo database seed...\n');

  const superAdmin = await seedRbacAndSuperAdmin(prisma);

  console.log('\n🧾 Seeding 10 Tax Classifications & GST Rules...');
  const taxMap = new Map<string, { id: string; rate: number }>();
  const now = new Date();
  for (const t of TAX_SEED) {
    const tc = await prisma.taxClassification.upsert({
      where: { hsnCode: t.hsnCode },
      update: {
        description: t.description,
        category: t.category,
        verificationStatus: 'VERIFIED',
        verifiedAt: now,
        verifiedById: superAdmin.id,
      },
      create: {
        hsnCode: t.hsnCode,
        description: t.description,
        category: t.category,
        verificationStatus: 'VERIFIED',
        verifiedAt: now,
        verifiedById: superAdmin.id,
      },
    });
    taxMap.set(t.hsnCode, { id: tc.id, rate: t.rate });

    const existingRule = await prisma.gstRule.findFirst({
      where: { taxClassificationId: tc.id, status: 'ACTIVE' },
    });
    if (!existingRule) {
      const halfRate = t.rate / 2;
      await prisma.gstRule.create({
        data: {
          taxClassificationId: tc.id,
          hsnCode: t.hsnCode,
          taxTreatment: t.rate === 0 ? 'ZERO_RATED' : 'TAXABLE',
          cgstRate: halfRate,
          sgstRate: halfRate,
          igstRate: t.rate,
          cessRate: 0,
          effectiveFrom: new Date('2025-01-01T00:00:00Z'),
          jurisdiction: 'IN',
          status: 'ACTIVE',
          version: 1,
          createdById: superAdmin.id,
          approvedById: superAdmin.id,
          publishedById: superAdmin.id,
          approvedAt: now,
          publishedAt: now,
        },
      });
    }
  }
  console.log('✅ Seeded 10 Tax Classifications & 10 GST Rules.');

  console.log('\n📂 Seeding 10 Categories (uploading images via ImageKit)...');
  const categoryMap = new Map<string, string>();
  for (const c of CATEGORY_SEED) {
    const existing = await prisma.category.findUnique({ where: { slug: c.slug } });
    let imageUrl = existing?.imageUrl ?? null;

    if (!imageUrl || FORCE_IMAGE_REUPLOAD) {
      const uploaded = await uploadPlaceholder('/seed/categories', `category-${c.slug}.png`, ['seed', 'category', c.slug]);
      imageUrl = uploaded.url;
    }

    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        description: c.description,
        sortOrder: c.sortOrder,
        imageUrl,
        status: 'ACTIVE',
      },
      create: {
        name: c.name,
        slug: c.slug,
        description: c.description,
        sortOrder: c.sortOrder,
        imageUrl,
        status: 'ACTIVE',
        createdById: superAdmin.id,
      },
    });
    categoryMap.set(c.slug, cat.id);
  }
  console.log('✅ Seeded 10 Categories.');

  console.log('\n🏷️ Seeding 10 Brands (uploading logos via ImageKit)...');
  const brandMap = new Map<string, string>();
  for (const b of BRAND_SEED) {
    const existing = await prisma.brand.findUnique({ where: { slug: b.slug } });
    let logoUrl = existing?.logoUrl ?? null;

    if (!logoUrl || FORCE_IMAGE_REUPLOAD) {
      const uploaded = await uploadPlaceholder('/seed/brands', `brand-${b.slug}.png`, ['seed', 'brand', b.slug]);
      logoUrl = uploaded.url;
    }

    const brand = await prisma.brand.upsert({
      where: { slug: b.slug },
      update: {
        name: b.name,
        description: b.description,
        logoUrl,
        status: 'ACTIVE',
      },
      create: {
        name: b.name,
        slug: b.slug,
        description: b.description,
        logoUrl,
        status: 'ACTIVE',
        createdById: superAdmin.id,
      },
    });
    brandMap.set(b.slug, brand.id);
  }
  console.log('✅ Seeded 10 Brands.');

  console.log('\n🎨 Seeding 10 Product Attributes & Values...');
  const attrValueMap = new Map<string, string>();
  for (const attrDef of ATTRIBUTE_SEED) {
    const attr = await prisma.productAttribute.upsert({
      where: { name: attrDef.name },
      update: { isGlobal: true, status: 'ACTIVE' },
      create: { name: attrDef.name, isGlobal: true, status: 'ACTIVE' },
    });

    for (const val of attrDef.values) {
      const attrVal = await prisma.productAttributeValue.upsert({
        where: { attributeId_value: { attributeId: attr.id, value: val } },
        update: {},
        create: { attributeId: attr.id, value: val },
      });
      attrValueMap.set(`${attrDef.name}:${val}`, attrVal.id);
    }
  }
  console.log('✅ Seeded 10 Product Attributes & Values.');

  console.log('\n📦 Seeding 10 Products, 10 SKUs, ImageKit Images & Inventory...');
  const productMap = new Map<string, string>();

  for (const p of PRODUCT_SEED) {
    const categoryId = categoryMap.get(p.categorySlug) ?? null;
    const brandId = brandMap.get(p.brandSlug) ?? null;
    const taxInfo = taxMap.get(p.hsnCode);

    const existingProduct = await prisma.product.findUnique({
      where: { slug: p.slug },
      include: { images: true },
    });

    let bannerImage = existingProduct?.bannerImage as Record<string, unknown> | null;
    if (!bannerImage || !bannerImage.fileId || FORCE_IMAGE_REUPLOAD) {
      const bannerUpload = await uploadPlaceholder(
        `/seed/products/${p.slug}`,
        `banner-${p.slug}.png`,
        ['seed', 'product', 'banner', p.slug]
      );
      bannerImage = {
        fileId: bannerUpload.fileId,
        url: bannerUpload.url,
        thumbnailUrl: bannerUpload.thumbnailUrl ?? bannerUpload.url,
        altText: `${p.name} Banner`,
      };
    }

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        categoryId,
        brandId,
        status: 'ACTIVE',
        isFeatured: p.isFeatured,
        seoTitle: p.name.slice(0, 70),
        seoDescription: p.description.slice(0, 160),
        taxRate: taxInfo?.rate ?? 18,
        hsnCode: p.hsnCode,
        taxClassificationId: taxInfo?.id ?? null,
        bannerImage: bannerImage as any,
        specifications: p.specifications,
        deletedAt: null,
      },
      create: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        categoryId,
        brandId,
        createdById: superAdmin.id,
        status: 'ACTIVE',
        isFeatured: p.isFeatured,
        seoTitle: p.name.slice(0, 70),
        seoDescription: p.description.slice(0, 160),
        taxRate: taxInfo?.rate ?? 18,
        hsnCode: p.hsnCode,
        taxClassificationId: taxInfo?.id ?? null,
        bannerImage: bannerImage as any,
        specifications: p.specifications,
      },
    });
    productMap.set(p.slug, product.id);

    const hasProductImage = existingProduct?.images.some((img) => Boolean(img.fileId));
    if (!hasProductImage || FORCE_IMAGE_REUPLOAD) {
      const imgUpload = await uploadPlaceholder(
        `/products/${product.id}`,
        `product-${p.slug}.png`,
        ['seed', 'product', product.id]
      );
      await prisma.image.create({
        data: {
          productId: product.id,
          fileId: imgUpload.fileId,
          url: imgUpload.url,
          thumbnailUrl: imgUpload.thumbnailUrl ?? null,
          altText: p.name,
          sortOrder: 0,
          width: imgUpload.width ?? null,
          height: imgUpload.height ?? null,
          size: imgUpload.size ?? null,
        },
      });
    }

    const existingVariant = await prisma.productVariant.findUnique({
      where: { sku: p.sku },
      include: { images: true, inventory: true },
    });

    const variant = await prisma.productVariant.upsert({
      where: { sku: p.sku },
      update: {
        productId: product.id,
        barcode: p.barcode,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        costPrice: p.costPrice,
        status: 'ACTIVE',
      },
      create: {
        productId: product.id,
        sku: p.sku,
        barcode: p.barcode,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        costPrice: p.costPrice,
        status: 'ACTIVE',
      },
    });

    for (const a of p.attributes) {
      const attrValId = attrValueMap.get(`${a.name}:${a.value}`);
      if (attrValId) {
        await prisma.variantAttributeValue.upsert({
          where: {
            variantId_attributeValueId: {
              variantId: variant.id,
              attributeValueId: attrValId,
            },
          },
          update: {},
          create: {
            variantId: variant.id,
            attributeValueId: attrValId,
          },
        });
      }
    }

    const hasVariantImage = existingVariant?.images.some((img) => Boolean(img.fileId));
    if (!hasVariantImage || FORCE_IMAGE_REUPLOAD) {
      const varUpload = await uploadPlaceholder(
        `/variants/${variant.id}`,
        `sku-${p.sku}.png`,
        ['seed', 'variant', variant.id]
      );
      await prisma.image.create({
        data: {
          productVariantId: variant.id,
          fileId: varUpload.fileId,
          url: varUpload.url,
          thumbnailUrl: varUpload.thumbnailUrl ?? null,
          altText: `${p.name} (${p.sku})`,
          sortOrder: 0,
          width: varUpload.width ?? null,
          height: varUpload.height ?? null,
          size: varUpload.size ?? null,
        },
      });
    }

    await prisma.inventory.upsert({
      where: { variantId: variant.id },
      update: {
        availableQuantity: p.stock,
        reorderLevel: p.reorderLevel,
      },
      create: {
        variantId: variant.id,
        availableQuantity: p.stock,
        reservedQuantity: 0,
        reorderLevel: p.reorderLevel,
      },
    });

    if (!existingVariant?.inventory) {
      await prisma.inventoryTransaction.create({
        data: {
          variantId: variant.id,
          type: 'STOCK_ADDED',
          quantity: p.stock,
          referenceType: 'SEED',
          referenceId: variant.id,
          note: 'Initial seed stock',
        },
      });
    }
  }
  console.log('✅ Seeded 10 Products, 10 SKUs, ImageKit Images & 10 Inventory records.');

  console.log('\n🎟️ Seeding 10 Coupons...');
  const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  for (const c of COUPON_SEED) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: {
        type: c.type,
        value: c.value,
        minimumOrderAmount: c.minimumOrderAmount,
        maximumDiscountAmount: c.maximumDiscountAmount,
        usageLimit: c.usageLimit,
        usageLimitPerUser: c.usageLimitPerUser,
        startsAt: now,
        expiresAt: futureDate,
        status: 'ACTIVE',
      },
      create: {
        code: c.code,
        type: c.type,
        value: c.value,
        minimumOrderAmount: c.minimumOrderAmount,
        maximumDiscountAmount: c.maximumDiscountAmount,
        usageLimit: c.usageLimit,
        usageLimitPerUser: c.usageLimitPerUser,
        startsAt: now,
        expiresAt: futureDate,
        status: 'ACTIVE',
      },
    });
  }
  console.log('✅ Seeded 10 Coupons.');

  console.log('\n📣 Seeding 10 Promotions...');
  const electronicsId = categoryMap.get('electronics')!;
  const fashionId = categoryMap.get('fashion')!;
  const novaTechId = brandMap.get('novatech')!;
  const urbanThreadId = brandMap.get('urbanthread')!;
  const featuredProductId = productMap.get('novatech-airbuds-pro-anc')!;

  const PROMOTION_SEED = [
    { name: 'Mega Electronics Flash Sale', slug: 'mega-electronics-flash-sale', type: 'FLASH_SALE' as const, discountValue: 20, targetCategoryIds: [electronicsId], isAutomatic: true, priority: 10 },
    { name: 'Fashion Week 15% Off', slug: 'fashion-week-15-off', type: 'CATEGORY_DISCOUNT' as const, discountValue: 15, targetCategoryIds: [fashionId], isAutomatic: true, priority: 8 },
    { name: 'NovaTech Brand Spotlight', slug: 'novatech-brand-spotlight', type: 'BRAND_DISCOUNT' as const, discountValue: 10, targetBrandIds: [novaTechId], isAutomatic: true, priority: 7 },
    { name: 'UrbanThread Flat 100 Off', slug: 'urbanthread-flat-100-off', type: 'FIXED_DISCOUNT' as const, discountValue: 100, targetBrandIds: [urbanThreadId], minOrderSubtotal: 699, isAutomatic: false, code: 'URBAN100', priority: 6 },
    { name: 'AirBuds Pro Launch Deal', slug: 'airbuds-pro-launch-deal', type: 'PRODUCT_DISCOUNT' as const, discountValue: 300, targetProductIds: [featuredProductId], isAutomatic: true, priority: 9 },
    { name: 'Buy 2 Get 1 Free Basics', slug: 'buy-2-get-1-free-basics', type: 'BUY_X_GET_Y' as const, buyXQuantity: 2, getYQuantity: 1, getYDiscountPercentage: 100, targetCategoryIds: [fashionId], isAutomatic: true, priority: 5 },
    { name: 'Free Express Shipping', slug: 'free-express-shipping', type: 'FREE_SHIPPING' as const, minOrderSubtotal: 499, isAutomatic: true, priority: 4 },
    { name: 'First Order Welcome 12%', slug: 'first-order-welcome-12', type: 'PERCENTAGE' as const, discountValue: 12, firstOrderOnly: true, customerSegment: 'FIRST_TIME_BUYER' as const, isAutomatic: true, priority: 11 },
    { name: 'VIP Member Exclusive 18%', slug: 'vip-member-exclusive-18', type: 'PERCENTAGE' as const, discountValue: 18, customerSegment: 'VIP' as const, code: 'VIPMEEO18', isAutomatic: false, priority: 12 },
    { name: 'Weekend Cart Saver', slug: 'weekend-cart-saver', type: 'FIXED_DISCOUNT' as const, discountValue: 150, minOrderSubtotal: 1499, daysOfWeek: [0, 6], isAutomatic: true, priority: 3 },
  ];

  for (const promo of PROMOTION_SEED) {
    await prisma.promotion.upsert({
      where: { slug: promo.slug },
      update: {
        name: promo.name,
        type: promo.type,
        status: 'ACTIVE',
        priority: promo.priority,
        isAutomatic: promo.isAutomatic,
        code: promo.code ?? null,
        discountValue: promo.discountValue ?? null,
        minOrderSubtotal: promo.minOrderSubtotal ?? null,
        buyXQuantity: promo.buyXQuantity ?? null,
        getYQuantity: promo.getYQuantity ?? null,
        getYDiscountPercentage: promo.getYDiscountPercentage ?? null,
        firstOrderOnly: promo.firstOrderOnly ?? false,
        customerSegment: promo.customerSegment ?? 'ALL',
        daysOfWeek: promo.daysOfWeek ?? [],
        targetCategoryIds: promo.targetCategoryIds ?? [],
        targetBrandIds: promo.targetBrandIds ?? [],
        targetProductIds: promo.targetProductIds ?? [],
        startsAt: now,
        endsAt: futureDate,
      },
      create: {
        name: promo.name,
        slug: promo.slug,
        description: `${promo.name} promotional campaign`,
        type: promo.type,
        status: 'ACTIVE',
        priority: promo.priority,
        isAutomatic: promo.isAutomatic,
        code: promo.code ?? null,
        discountValue: promo.discountValue ?? null,
        minOrderSubtotal: promo.minOrderSubtotal ?? null,
        buyXQuantity: promo.buyXQuantity ?? null,
        getYQuantity: promo.getYQuantity ?? null,
        getYDiscountPercentage: promo.getYDiscountPercentage ?? null,
        firstOrderOnly: promo.firstOrderOnly ?? false,
        customerSegment: promo.customerSegment ?? 'ALL',
        daysOfWeek: promo.daysOfWeek ?? [],
        targetCategoryIds: promo.targetCategoryIds ?? [],
        targetBrandIds: promo.targetBrandIds ?? [],
        targetProductIds: promo.targetProductIds ?? [],
        startsAt: now,
        endsAt: futureDate,
        createdById: superAdmin.id,
      },
    });
  }
  console.log('✅ Seeded 10 Promotions.');

  console.log('\n🎉 All seed data created successfully!');
}

const isDirectRun =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]!).href === import.meta.url;

if (isDirectRun) {
  createSeedPrismaClient()
    .then(async (prisma) => {
      try {
        await runSeed(prisma);
      } finally {
        await prisma.$disconnect();
      }
    })
    .catch((e) => {
      console.error('❌ Seed failed:', e);
      process.exit(1);
    });
}
