import type { BmiCategory } from "../data/nutrientRecipes";

export const SHARED_NUTRIENTS_STORAGE_KEY = "hivecity_shared_nutrients";
export const NUTRIENTS_UPDATED_EVENT = "hivecity:nutrients-updated";

export const SHARED_MARKETPLACE_STORAGE_KEY = "hivecity_shared_marketplace";
export const MARKETPLACE_UPDATED_EVENT = "hivecity:marketplace-updated";

export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack" | "Post-Workout";
export type GlycemicIndex = "Low" | "Medium" | "High";

export interface UnifiedNutrientRecipe {
  id: string;
  title: string;
  name: string;
  description: string;
  mealType: MealType;
  category: string;
  goal: string;
  prepTimeMins: number;
  prepTime: number;
  calories: number;
  proteinGrams: number;
  protein: number;
  carbsGrams: number;
  carbs: number;
  fatsGrams: number;
  fat: number;
  fiberGrams: number;
  fiber: number;
  glycemicIndex: GlycemicIndex;
  suitableCategories: BmiCategory[];
  tags: string[];
  ingredients: string[];
  steps: string[];
  image: string;
  imageUrl: string;
  coverImage: string;
  imageUrls: string[];
  images: string[];
  creatorRole: "Admin" | "User";
  createdBy?: string;
  creatorName: string;
  authorName?: string;
  authorEmail?: string;
  ownerUid?: string;
  userId?: string;
  isFeatured?: boolean;
  isAdminSpecial?: boolean;
  hiddenInAdmin?: boolean;
  deletedByOwner?: boolean;
  sourceCollection?: "recipes" | "shared_nutrition";
  sharedDocId?: string;
  createdAt?: string;
}

export interface UnifiedMarketplaceProduct {
  id: string;
  name: string;
  title: string;
  category: string;
  price: number;
  stock: number;
  status: "In Stock" | "Out of Stock";
  description: string;
  imageUrl: string;
  checkoutUrl: string;
  creatorRole: "Admin";
  creatorName: string;
  brand: string;
  hiddenInAdmin?: boolean;
  createdAt?: string;
}

const VALID_BMI: BmiCategory[] = ["Underweight", "Normal", "Overweight", "Obese"];
const VALID_MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack", "Post-Workout"];
const VALID_GI: GlycemicIndex[] = ["Low", "Medium", "High"];

function isTestArtifactRecord(raw: Record<string, any> | null | undefined): boolean {
  if (!raw || typeof raw !== "object") return false;
  const text = `${raw.title || ""} ${raw.name || ""} ${raw.recipeName || ""} ${raw.id || ""}`.toLowerCase();
  return text.includes("__verify_e2e") || text.includes("__smoke_");
}

export function normalizeUnifiedNutrient(id: string, raw: Record<string, any>): UnifiedNutrientRecipe {
  const title = String(raw.title || raw.name || "Nutrient Recipe").trim();
  const mealType = (VALID_MEAL_TYPES.find(
    (m) => m.toLowerCase() === String(raw.mealType || raw.category || "Lunch").trim().toLowerCase()
  ) || "Lunch") as MealType;
  const glycemicIndex = (VALID_GI.find(
    (g) => g.toLowerCase() === String(raw.glycemicIndex || "Low").trim().toLowerCase()
  ) || "Low") as GlycemicIndex;

  const rawCats = Array.isArray(raw.suitableCategories) ? raw.suitableCategories : [];
  const suitableCategories = rawCats
    .map((c: unknown) => VALID_BMI.find((v) => v.toLowerCase() === String(c || "").trim().toLowerCase()))
    .filter((c): c is BmiCategory => Boolean(c));

  const rawImageList = Array.isArray(raw.images) && raw.images.length > 0
    ? raw.images.filter(Boolean)
    : Array.isArray(raw.imageUrls) && raw.imageUrls.length > 0
      ? raw.imageUrls.filter(Boolean)
      : [];
  const primaryImage = String(
    raw.coverImage || raw.imageUrl || raw.image || rawImageList[0] || ""
  ).trim();
  const imageUrls = (
    primaryImage
      ? [primaryImage, ...rawImageList.filter((u: string) => u !== primaryImage)]
      : rawImageList
  ).slice(0, 3);

  const calories = Math.max(0, Math.round(Number(raw.calories) || 0));
  const proteinGrams = Math.max(0, Math.round(Number(raw.proteinGrams ?? raw.protein) || 0));
  const carbsGrams = Math.max(0, Math.round(Number(raw.carbsGrams ?? raw.carbs) || 0));
  const fatsGrams = Math.max(0, Math.round(Number(raw.fatsGrams ?? raw.fat) || 0));
  const fiberGrams = Math.max(0, Math.round(Number(raw.fiberGrams ?? raw.fiber) || 0));
  const prepTimeMins = Math.max(1, Math.round(Number(raw.prepTimeMins ?? raw.prepTime) || 20));
  const creatorRole: "Admin" | "User" =
    String(raw.creatorRole || (raw.ownerUid || raw.userId || raw.isCustom ? "User" : "Admin")).toLowerCase() === "user"
      ? "User"
      : "Admin";
  const creatorName = String(
    raw.creatorName || raw.authorName || (creatorRole === "Admin" ? "Hivecity Admin" : "Community User")
  ).trim();
  const resolvedUid = raw.ownerUid || raw.userId ? String(raw.ownerUid || raw.userId) : undefined;

  const isAdminSpecial = raw.isAdminSpecial !== undefined ? Boolean(raw.isAdminSpecial) : creatorRole === "Admin";
  const isFeatured = raw.isFeatured !== undefined ? Boolean(raw.isFeatured) : isAdminSpecial;
  const createdBy = String(
    raw.createdBy || (creatorRole === "Admin" ? "admin" : resolvedUid || "user")
  ).trim();

  return {
    id,
    title,
    name: title,
    description: String(raw.description || "").trim(),
    mealType,
    category: String(raw.category || mealType).trim(),
    goal: String(raw.goal || "Maintenance").trim(),
    prepTimeMins,
    prepTime: prepTimeMins,
    calories,
    proteinGrams,
    protein: proteinGrams,
    carbsGrams,
    carbs: carbsGrams,
    fatsGrams,
    fat: fatsGrams,
    fiberGrams,
    fiber: fiberGrams,
    glycemicIndex,
    suitableCategories: suitableCategories.length > 0 ? suitableCategories : ["Normal"],
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [mealType.toLowerCase()],
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.map(String) : [],
    steps: Array.isArray(raw.steps) ? raw.steps.map(String) : [],
    image: primaryImage,
    imageUrl: primaryImage,
    coverImage: primaryImage,
    imageUrls,
    images: imageUrls,
    creatorRole,
    createdBy,
    creatorName,
    authorName: creatorName,
    authorEmail: raw.authorEmail ? String(raw.authorEmail).trim() : undefined,
    ownerUid: resolvedUid,
    userId: resolvedUid,
    isFeatured,
    isAdminSpecial,
    hiddenInAdmin: Boolean(raw.hiddenInAdmin),
    deletedByOwner: Boolean(raw.deletedByOwner),
    sourceCollection: raw.sourceCollection === "shared_nutrition" ? "shared_nutrition" : "recipes",
    sharedDocId: raw.sharedDocId ? String(raw.sharedDocId) : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

export function normalizeUnifiedProduct(id: string, raw: Record<string, any>): UnifiedMarketplaceProduct {
  const name = String(raw.name || raw.title || "Hivecity Product").trim();
  const price = Math.max(0, Math.round(Number(raw.price ?? raw.pr) || 0));
  const stock = Math.max(0, Math.round(Number(raw.stock ?? raw.stockQuantity) || 0));
  return {
    id,
    name,
    title: name,
    category: String(raw.category || "Fitness Gear").trim(),
    price,
    stock,
    status: stock > 0 ? "In Stock" : "Out of Stock",
    description: String(raw.description || "").trim(),
    imageUrl: String(raw.imageUrl || raw.image || "").trim(),
    checkoutUrl: String(raw.checkoutUrl || raw.bookingUrl || "").trim(),
    creatorRole: "Admin",
    creatorName: String(raw.creatorName || "Hivecity Admin").trim(),
    brand: String(raw.brand || "HIVE").trim(),
    hiddenInAdmin: Boolean(raw.hiddenInAdmin),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

// --- Nutrients Store ---

export function readCachedLocalNutrients(): UnifiedNutrientRecipe[] {
  try {
    const raw = localStorage.getItem(SHARED_NUTRIENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const cleaned = parsed
      .filter((item: any) => item && !isTestArtifactRecord(item))
      .map((item, idx) => normalizeUnifiedNutrient(String(item.id || `nut-${idx}`), item));
    if (cleaned.length !== parsed.length) {
      try {
        localStorage.setItem(SHARED_NUTRIENTS_STORAGE_KEY, JSON.stringify(cleaned));
      } catch {}
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function writeCachedLocalNutrients(recipes: UnifiedNutrientRecipe[]): void {
  try {
    const cleaned = (Array.isArray(recipes) ? recipes : []).filter((r) => !isTestArtifactRecord(r));
    localStorage.setItem(SHARED_NUTRIENTS_STORAGE_KEY, JSON.stringify(cleaned));
    window.dispatchEvent(new CustomEvent(NUTRIENTS_UPDATED_EVENT, { detail: cleaned }));
  } catch {}
}

export async function getAllNutrients(): Promise<UnifiedNutrientRecipe[]> {
  try {
    const res = await fetch("/api/nutrients", { credentials: "include", cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const list = (Array.isArray(data.recipes) ? data.recipes : [])
        .filter((item: any) => item?.id && !isTestArtifactRecord(item))
        .map((item: any) => normalizeUnifiedNutrient(String(item.id), item));
      writeCachedLocalNutrients(list);
      return list;
    }
  } catch {}
  return readCachedLocalNutrients();
}

export async function createNutrientOnServer(payload: Record<string, any>): Promise<UnifiedNutrientRecipe | null> {
  const res = await fetch("/api/nutrients", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.recipe?.id ? normalizeUnifiedNutrient(String(data.recipe.id), data.recipe) : null;
}

export async function deleteNutrientOnServer(recipeId: string, sharedDocId?: string): Promise<void> {
  const qs = sharedDocId ? `?sharedDocId=${encodeURIComponent(sharedDocId)}` : "";
  const res = await fetch(`/api/nutrients/${encodeURIComponent(recipeId)}${qs}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
}

// --- Marketplace Store ---

export function readCachedLocalMarketplaceProducts(): UnifiedMarketplaceProduct[] {
  try {
    const raw = localStorage.getItem(SHARED_MARKETPLACE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, idx) => normalizeUnifiedProduct(String(item.id || `prod-${idx}`), item));
  } catch {
    return [];
  }
}

export function writeCachedLocalMarketplaceProducts(products: UnifiedMarketplaceProduct[]): void {
  try {
    localStorage.setItem(SHARED_MARKETPLACE_STORAGE_KEY, JSON.stringify(products));
    window.dispatchEvent(new CustomEvent(MARKETPLACE_UPDATED_EVENT, { detail: products }));
  } catch {}
}

export async function getAllMarketplaceProducts(): Promise<UnifiedMarketplaceProduct[]> {
  try {
    const res = await fetch("/api/marketplace", { credentials: "include", cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const list = (Array.isArray(data.products) ? data.products : [])
        .filter((item: any) => item?.id)
        .map((item: any) => normalizeUnifiedProduct(String(item.id), item));
      writeCachedLocalMarketplaceProducts(list);
      return list;
    }
  } catch {}
  return readCachedLocalMarketplaceProducts();
}

export async function createMarketplaceProductOnServer(
  payload: Record<string, any>
): Promise<UnifiedMarketplaceProduct | null> {
  const res = await fetch("/api/marketplace", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.product?.id ? normalizeUnifiedProduct(String(data.product.id), data.product) : null;
}

export async function deleteMarketplaceProductOnServer(productId: string): Promise<void> {
  const res = await fetch(`/api/marketplace/${encodeURIComponent(productId)}?hard=true`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
}

export async function getAllMarketplaceOrders(): Promise<
  Array<{
    id: string;
    customer: string;
    item: string;
    amount: string;
    status: string;
    time: string;
  }>
> {
  try {
    const res = await fetch("/api/marketplace/orders", { credentials: "include", cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.orders) ? data.orders : [];
    }
  } catch {}
  return [];
}
