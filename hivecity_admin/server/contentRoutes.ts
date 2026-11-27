import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response, NextFunction } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { firestore, isFirestoreQuotaBackoffActive, noteFirestoreError } from "./firebaseAdmin";
import { requireAdminSession, verifyFirebaseIdToken } from "./adminAuth";
import { isAdminHidden, markAdminHidden, unmarkAdminHidden } from "./adminHiddenStore";

const LOCAL_NUTRIENTS_FILE = path.resolve(import.meta.dirname, "nutrients_store.json");
const LOCAL_MARKETPLACE_FILE = path.resolve(import.meta.dirname, "marketplace_store.json");
const LOCAL_ORDERS_FILE = path.resolve(import.meta.dirname, "marketplace_orders_store.json");
const LOCAL_REPOSTS_FILE = path.resolve(import.meta.dirname, "reposts_store.json");

export interface StoredUserRepost {
  id: string;
  originalItemId: string;
  itemType: "recipe" | "post";
  repostedBy: string;
  repostedByEmail?: string;
  repostedAt: string;
  snapshot?: Record<string, any>;
}

export interface StoredMarketplaceOrder {
  id: string;
  productId: string;
  item: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  amount: string;
  customer: string;
  userId: string;
  userEmail: string;
  status: string;
  time: string;
  createdAt: string;
}

export type BmiCategory = "Underweight" | "Normal" | "Overweight" | "Obese";
export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack" | "Post-Workout";
export type GlycemicIndex = "Low" | "Medium" | "High";

export interface StoredNutrientRecipe {
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
  createdBy: "admin" | "user" | string;
  creatorName: string;
  authorName?: string;
  authorEmail?: string;
  ownerUid?: string;
  userId?: string;
  isFeatured: boolean;
  isAdminSpecial: boolean;
  hiddenInAdmin?: boolean;
  deletedByOwner?: boolean;
  _localOnly?: boolean;
  published: boolean;
  status: string;
  sourceCollection: "recipes" | "shared_nutrition";
  sharedDocId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMarketplaceProduct {
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
  createdAt: string;
  updatedAt: string;
}

const VALID_BMI_CATEGORIES: BmiCategory[] = ["Underweight", "Normal", "Overweight", "Obese"];
const VALID_MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack", "Post-Workout"];
const VALID_GI: GlycemicIndex[] = ["Low", "Medium", "High"];

function sanitizeHttpUrl(raw: unknown): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

function sanitizeImageUrl(raw: unknown): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) {
    return trimmed.length <= 900_000 ? trimmed : "";
  }
  if (/^(assets\/|\/assets\/)/i.test(trimmed)) return trimmed;
  return sanitizeHttpUrl(trimmed);
}

function parseNonNegNumber(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(String(val).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readJsonFile<T>(filePath: string): T[] {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

function writeJsonFile<T>(filePath: string, data: T[]) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("[ContentAPI] Could not write local backup file:", err);
  }
}

function toIsoDate(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const ts = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof ts.toDate === "function") return ts.toDate().toISOString();
    const s = typeof ts.seconds === "number" ? ts.seconds : ts._seconds;
    if (typeof s === "number") return new Date(s * 1000).toISOString();
  }
  return new Date().toISOString();
}

function isTestArtifactRecord(raw: Record<string, any> | null | undefined): boolean {
  if (!raw || typeof raw !== "object") return false;
  const text = `${raw.title || ""} ${raw.name || ""} ${raw.recipeName || ""} ${raw.item || ""} ${raw.id || ""}`.toLowerCase();
  return text.includes("__verify_e2e") || text.includes("__smoke_");
}

function inferGoalFromBmi(categories: BmiCategory[], fallbackGoal?: string): string {
  if (fallbackGoal && fallbackGoal.trim()) return fallbackGoal.trim();
  if (categories.includes("Underweight") && !categories.includes("Overweight")) return "Weight Gain";
  if (categories.includes("Obese") || categories.includes("Overweight")) return "Weight Loss";
  return "Maintenance";
}

function normalizeNutrientRecord(
  id: string,
  raw: Record<string, any>,
  defaults?: { creatorRole?: "Admin" | "User"; sourceCollection?: "recipes" | "shared_nutrition"; sharedDocId?: string }
): StoredNutrientRecipe {
  const title = String(raw.title || raw.name || raw.recipeName || "Nutrient Recipe").trim();
  const rawMealType = String(raw.mealType || raw.category || "Lunch").trim();
  const mealType = (VALID_MEAL_TYPES.find((m) => m.toLowerCase() === rawMealType.toLowerCase()) || "Lunch") as MealType;
  const rawGi = String(raw.glycemicIndex || "Low").trim();
  const glycemicIndex = (VALID_GI.find((g) => g.toLowerCase() === rawGi.toLowerCase()) || "Low") as GlycemicIndex;

  const rawSuitable = Array.isArray(raw.suitableCategories)
    ? raw.suitableCategories
    : Array.isArray(raw.bmiCategories)
      ? raw.bmiCategories
      : [];
  const suitableCategories = rawSuitable
    .map((c: unknown) => VALID_BMI_CATEGORIES.find((v) => v.toLowerCase() === String(c || "").trim().toLowerCase()))
    .filter((c): c is BmiCategory => Boolean(c));

  const calories = Math.round(parseNonNegNumber(raw.calories, 0));
  const proteinGrams = Math.round(parseNonNegNumber(raw.proteinGrams ?? raw.protein, 0));
  const carbsGrams = Math.round(parseNonNegNumber(raw.carbsGrams ?? raw.carbs, 0));
  const fatsGrams = Math.round(parseNonNegNumber(raw.fatsGrams ?? raw.fat, 0));
  const fiberGrams = Math.round(parseNonNegNumber(raw.fiberGrams ?? raw.fiber, 0));
  const prepTimeMins = Math.max(1, Math.round(parseNonNegNumber(raw.prepTimeMins ?? raw.prepTime, 20)));

  const rawImageList = Array.isArray(raw.images)
    ? raw.images.map((u: unknown) => sanitizeImageUrl(u)).filter(Boolean)
    : Array.isArray(raw.imageUrls)
      ? raw.imageUrls.map((u: unknown) => sanitizeImageUrl(u)).filter(Boolean)
      : [];
  const primaryImage =
    sanitizeImageUrl(raw.coverImage || raw.imageUrl || raw.image || raw.recipeImage) || rawImageList[0] || "";
  const imageUrls = (
    primaryImage
      ? [primaryImage, ...rawImageList.filter((u) => u !== primaryImage)]
      : rawImageList
  ).slice(0, 3);

  const rawCreatorRole = String(raw.creatorRole || defaults?.creatorRole || (raw.isCustom || raw.ownerUid || raw.userId ? "User" : "Admin"));
  const creatorRole: "Admin" | "User" = rawCreatorRole.toLowerCase() === "user" ? "User" : "Admin";
  const creatorName = String(
    raw.creatorName ||
      raw.authorName ||
      (creatorRole === "Admin" ? "Hivecity Admin" : "Hivecity Athlete")
  ).trim();
  const authorEmail = raw.authorEmail ? String(raw.authorEmail).trim() : undefined;
  const resolvedUid = raw.ownerUid || raw.userId ? String(raw.ownerUid || raw.userId) : undefined;

  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map((x: unknown) => String(x || "").trim()).filter(Boolean)
    : typeof raw.ingredients === "string"
      ? raw.ingredients.split("\n").map((x) => x.trim()).filter(Boolean)
      : [];
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((x: unknown) => String(x || "").trim()).filter(Boolean)
    : Array.isArray(raw.instructions)
      ? raw.instructions.map((x: unknown) => String(x || "").trim()).filter(Boolean)
      : typeof raw.steps === "string"
        ? raw.steps.split("\n").map((x) => x.trim()).filter(Boolean)
        : [];

  const finalBmiCats: BmiCategory[] = suitableCategories.length > 0 ? suitableCategories : ["Normal"];
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t: unknown) => String(t || "").trim()).filter(Boolean)
    : [mealType.toLowerCase(), `${glycemicIndex.toLowerCase()}-gi`];

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
    goal: inferGoalFromBmi(finalBmiCats, raw.goal),
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
    suitableCategories: finalBmiCats,
    tags,
    ingredients,
    steps,
    image: primaryImage,
    imageUrl: primaryImage,
    coverImage: primaryImage,
    imageUrls,
    images: imageUrls,
    creatorRole,
    createdBy,
    creatorName,
    authorName: creatorName,
    authorEmail,
    ownerUid: resolvedUid,
    userId: resolvedUid,
    isFeatured,
    isAdminSpecial,
    deletedByOwner: Boolean(raw.deletedByOwner),
    published: raw.published !== false,
    status: String(raw.status || "published"),
    sourceCollection: defaults?.sourceCollection || (raw.sourceCollection === "shared_nutrition" ? "shared_nutrition" : "recipes"),
    sharedDocId: defaults?.sharedDocId || (raw.sharedDocId ? String(raw.sharedDocId) : undefined),
    createdAt: toIsoDate(raw.createdAt),
    updatedAt: toIsoDate(raw.updatedAt),
  };
}

function normalizeMarketplaceProduct(id: string, raw: Record<string, any>): StoredMarketplaceProduct {
  const name = String(raw.name || raw.title || "Hivecity Product").trim();
  const price = Math.round(parseNonNegNumber(raw.price ?? raw.pr, 0));
  const stock = Math.max(0, Math.round(parseNonNegNumber(raw.stock ?? raw.stockQuantity, 10)));
  return {
    id,
    name,
    title: name,
    category: String(raw.category || "Fitness Gear").trim(),
    price,
    stock,
    status: stock > 0 ? "In Stock" : "Out of Stock",
    description: String(raw.description || "").trim(),
    imageUrl: sanitizeImageUrl(raw.imageUrl || raw.image || ""),
    checkoutUrl: sanitizeHttpUrl(raw.checkoutUrl || raw.bookingUrl || ""),
    creatorRole: "Admin",
    creatorName: String(raw.creatorName || "Hivecity Admin").trim(),
    brand: String(raw.brand || "HIVE").trim(),
    createdAt: toIsoDate(raw.createdAt),
    updatedAt: toIsoDate(raw.updatedAt),
  };
}

function applyContentCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

export function registerContentRoutes(app: Express) {
  app.use("/api/nutrients", applyContentCors);
  app.use("/api/marketplace", applyContentCors);
  app.use("/api/reposts", applyContentCors);

  // =========================================================================
  // NUTRIENT RECIPES & MEAL PLANS (Admin-hosted + User-created unified)
  // =========================================================================

  app.get("/api/nutrients", async (_req: Request, res: Response) => {
    try {
      const map: Record<string, StoredNutrientRecipe> = {};
      let loadedFromFirestore = false;

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          // 1. Admin-hosted & studio recipes in "recipes"
          const recipesSnap = await firestore.collection("recipes").get();
          recipesSnap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            if (isTestArtifactRecord({ ...d, id: docSnap.id })) return;
            map[docSnap.id] = normalizeNutrientRecord(docSnap.id, d, {
              creatorRole: d.creatorRole === "User" || d.ownerUid ? "User" : "Admin",
              sourceCollection: "recipes",
            });
          });

          // 2. User-created recipes in "shared_nutrition"
          const sharedSnap = await firestore.collection("shared_nutrition").get();
          sharedSnap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            const embedded = (d.recipe && typeof d.recipe === "object" ? d.recipe : {}) as Record<string, any>;
            const recipeId = String(d.recipeId || embedded.id || docSnap.id);
            if (isTestArtifactRecord({ ...d, ...embedded, id: recipeId })) return;
            if (!map[recipeId]) {
              const resolvedImages = Array.isArray(embedded.images) && embedded.images.length > 0
                ? embedded.images
                : Array.isArray(embedded.imageUrls) && embedded.imageUrls.length > 0
                  ? embedded.imageUrls
                  : Array.isArray(d.recipeImages) && d.recipeImages.length > 0
                    ? d.recipeImages
                    : d.recipeImage
                      ? [d.recipeImage]
                      : [];
              const cover =
                embedded.coverImage ||
                embedded.imageUrl ||
                embedded.image ||
                resolvedImages[0] ||
                d.recipeImage ||
                "";
              map[recipeId] = normalizeNutrientRecord(
                recipeId,
                {
                  ...embedded,
                  title: embedded.title || embedded.name || d.recipeName || "User Recipe",
                  name: embedded.name || embedded.title || d.recipeName || "User Recipe",
                  image: cover,
                  coverImage: cover,
                  imageUrl: cover,
                  images: resolvedImages,
                  imageUrls: resolvedImages,
                  ownerUid: embedded.ownerUid || embedded.userId || d.uid || d.userId || "",
                  userId: embedded.userId || embedded.ownerUid || d.userId || d.uid || "",
                  authorEmail: embedded.authorEmail || d.authorEmail || "",
                  authorName: embedded.authorName || embedded.creatorName || d.authorName || "",
                  creatorName:
                    embedded.creatorName ||
                    embedded.authorName ||
                    d.authorName ||
                    (Array.isArray(embedded.imageSources) && embedded.imageSources[0]?.name) ||
                    "Community User",
                  createdAt: embedded.createdAt || d.createdAt,
                },
                {
                  creatorRole: "User",
                  sourceCollection: "shared_nutrition",
                  sharedDocId: docSnap.id,
                }
              );
            }
          });
          loadedFromFirestore = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[ContentAPI] Firestore nutrients read fallback:", fsErr);
          }
        }
      }

      const localItems = readJsonFile<StoredNutrientRecipe>(LOCAL_NUTRIENTS_FILE);
      for (const item of localItems) {
        if (!item?.id || isTestArtifactRecord(item)) continue;
        if (!loadedFromFirestore || (item._localOnly && !map[item.id])) {
          map[item.id] = normalizeNutrientRecord(item.id, item);
        }
      }

      const recipes = Object.values(map)
        .filter((r) => !isTestArtifactRecord(r))
        .map((r) => ({
          ...r,
          hiddenInAdmin: isAdminHidden("nutrients", r.id),
          deletedByOwner: Boolean(r.deletedByOwner),
        }))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      res.json({ recipes, count: recipes.length });
    } catch (error) {
      console.error("[ContentAPI] GET /api/nutrients failed:", error);
      res.status(500).json({ error: "Failed to load nutrient recipes" });
    }
  });

function stripUndefined(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

  // POST /api/nutrients — Admin-protected creation from Events Hosting Studio
  app.post("/api/nutrients", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    try {
      const body = req.body || {};
      const requestedId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
      const docRef = requestedId
        ? firestore.collection("recipes").doc(requestedId)
        : firestore.collection("recipes").doc();
      const recipeId = docRef.id;

      const normalized = normalizeNutrientRecord(
        recipeId,
        {
          ...body,
          creatorRole: "Admin",
          createdBy: "admin",
          creatorName: body.creatorName || admin.name || "Hivecity Admin",
          isFeatured: body.isFeatured !== false,
          isAdminSpecial: body.isAdminSpecial !== false,
          published: true,
          status: "published",
        },
        { creatorRole: "Admin", sourceCollection: "recipes" }
      );

      let firestoreSaved = false;
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await docRef.set(
            {
              ...stripUndefined(normalized),
              updatedAt: FieldValue.serverTimestamp(),
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          firestoreSaved = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[ContentAPI] Firestore nutrient write fallback:", fsErr);
          }
        }
      }

      unmarkAdminHidden("nutrients", recipeId);
      const localRecord: StoredNutrientRecipe = firestoreSaved
        ? normalized
        : { ...normalized, _localOnly: true };
      const local = readJsonFile<StoredNutrientRecipe>(LOCAL_NUTRIENTS_FILE).filter((r) => r.id !== recipeId);
      local.unshift(localRecord);
      writeJsonFile(LOCAL_NUTRIENTS_FILE, local);

      res.status(201).json({ success: true, recipe: normalized, persistedToFirestore: firestoreSaved });
    } catch (error) {
      console.error("[ContentAPI] POST /api/nutrients failed:", error);
      res.status(500).json({ error: "Failed to publish nutrient recipe" });
    }
  });

  // POST /api/nutrients/user — Records or updates a user-created recipe into shared_nutrition so Admin showcases it
  app.post("/api/nutrients/user", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const ownerUid = String(body.ownerUid || body.userId || "community-user").trim();
      const recipeId =
        typeof body.id === "string" && body.id.trim()
          ? body.id.trim()
          : `user-rec-${ownerUid.replace(/[^a-zA-Z0-9_-]/g, "")}-${Date.now()}`;
      const sharedDocId = `${ownerUid.replace(/[^a-zA-Z0-9_-]/g, "")}_${recipeId}`;

      const existingLocal = readJsonFile<StoredNutrientRecipe>(LOCAL_NUTRIENTS_FILE).find(
        (r) => r.id === recipeId
      );
      const preservedCreatedAt =
        existingLocal?.createdAt ||
        (typeof body.createdAt === "string" && body.createdAt.trim() ? body.createdAt.trim() : new Date().toISOString());

      const normalized = normalizeNutrientRecord(
        recipeId,
        {
          ...body,
          ownerUid,
          creatorRole: "User",
          createdBy: ownerUid || "user",
          creatorName: body.creatorName || existingLocal?.creatorName || "Community Athlete",
          createdAt: preservedCreatedAt,
          updatedAt: new Date().toISOString(),
          isFeatured: false,
          isAdminSpecial: false,
          published: true,
          status: "published",
        },
        { creatorRole: "User", sourceCollection: "shared_nutrition", sharedDocId }
      );

      let firestoreSaved = false;
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore.collection("shared_nutrition").doc(sharedDocId).set(
            {
              uid: ownerUid,
              userId: ownerUid,
              authorName: normalized.authorName || normalized.creatorName,
              authorEmail: normalized.authorEmail || "",
              recipeId,
              recipeName: normalized.title,
              recipeImage: normalized.coverImage || normalized.imageUrl || normalized.image,
              recipeImages: normalized.images,
              recipe: stripUndefined(normalized),
              summary: `${normalized.proteinGrams}g protein · ${normalized.prepTimeMins} min`,
              createdAt: existingLocal ? preservedCreatedAt : FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          firestoreSaved = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[ContentAPI] Firestore user nutrient write fallback:", fsErr);
          }
        }
      }

      const localRecord: StoredNutrientRecipe = firestoreSaved
        ? normalized
        : { ...normalized, _localOnly: true };
      const local = readJsonFile<StoredNutrientRecipe>(LOCAL_NUTRIENTS_FILE).filter((r) => r.id !== recipeId);
      local.unshift(localRecord);
      writeJsonFile(LOCAL_NUTRIENTS_FILE, local);

      res.status(201).json({ success: true, recipe: normalized, persistedToFirestore: firestoreSaved });
    } catch (error) {
      console.error("[ContentAPI] POST /api/nutrients/user failed:", error);
      res.status(500).json({ error: "Failed to save user recipe" });
    }
  });

  // DELETE /api/nutrients/user/:id — Owner-authenticated deletion of a user-created recipe
  app.delete("/api/nutrients/user/:id", async (req: Request, res: Response) => {
    try {
      const recipeId = String(req.params.id || "").trim();
      if (!recipeId) {
        res.status(400).json({ error: "Recipe ID is required" });
        return;
      }

      const authHeader = req.headers.authorization || "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
      let verifiedUid = "";
      if (bearerToken) {
        const verified = await verifyFirebaseIdToken(bearerToken);
        if (!verified?.uid) {
          res.status(401).json({ error: "Invalid or expired Firebase ID token" });
          return;
        }
        verifiedUid = verified.uid;
      }

      const localList = readJsonFile<StoredNutrientRecipe>(LOCAL_NUTRIENTS_FILE);
      const existing = localList.find((r) => r.id === recipeId);

      // Protect Admin-created recipes from deletion via the user endpoint
      if (existing && String(existing.creatorRole || "Admin").toLowerCase() === "admin") {
        res.status(403).json({ error: "Only administrators can delete Admin-hosted recipes." });
        return;
      }

      const requestedUid = String(req.query.uid || req.body?.uid || "").trim();
      const actorUid = verifiedUid || requestedUid;
      if (!actorUid) {
        res.status(401).json({ error: "Authentication required to delete a user recipe." });
        return;
      }

      if (existing) {
        const ownerCandidates = [existing.ownerUid, existing.userId, existing.createdBy]
          .filter(Boolean)
          .map((v) => String(v));
        const isOwner =
          ownerCandidates.includes(actorUid) ||
          recipeId.startsWith(`user-rec-${actorUid.replace(/[^a-zA-Z0-9_-]/g, "")}-`);
        if (!isOwner) {
          res.status(403).json({ error: "You can only delete recipes you created." });
          return;
        }
      }

      const hardDelete = String(req.query.hard || "").toLowerCase() === "true";
      const sharedDocId = `${actorUid.replace(/[^a-zA-Z0-9_-]/g, "")}_${recipeId}`;

      if (!hardDelete) {
        // User-scoped soft delete: marks deletedByOwner so the owner's Profile/personal feed hides it
        // without breaking shared references in Admin views or other users' reposts.
        const updatedLocal = localList.map((r) =>
          r.id === recipeId
            ? { ...r, deletedByOwner: true, updatedAt: new Date().toISOString() }
            : r
        );
        writeJsonFile(LOCAL_NUTRIENTS_FILE, updatedLocal);

        if (!isFirestoreQuotaBackoffActive()) {
          try {
            await firestore.collection("shared_nutrition").doc(sharedDocId).set(
              {
                deletedByOwner: true,
                recipe: { deletedByOwner: true },
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          } catch (fsErr) {
            noteFirestoreError(fsErr);
          }
        }

        res.json({ success: true, id: recipeId, deletedByOwner: true, deleted: true });
        return;
      }

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore.collection("shared_nutrition").doc(sharedDocId).delete();
          await firestore.collection("shared_nutrition").doc(recipeId).delete();
          const byRecipeId = await firestore
            .collection("shared_nutrition")
            .where("recipeId", "==", recipeId)
            .get();
          await Promise.all(
            byRecipeId.docs
              .filter((d) => {
                const data = d.data() || {};
                return !data.uid || data.uid === actorUid || data.userId === actorUid;
              })
              .map((d) => d.ref.delete())
          );
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      const nextLocal = localList.filter((r) => r.id !== recipeId);
      writeJsonFile(LOCAL_NUTRIENTS_FILE, nextLocal);

      res.json({ success: true, id: recipeId, deleted: true, hardDeleted: true });
    } catch (error) {
      console.error("[ContentAPI] DELETE /api/nutrients/user/:id failed:", error);
      res.status(500).json({ error: "Failed to delete user recipe" });
    }
  });

  // =========================================================================
  // USER REPOSTS (Recipes & Posts — Unified persistence + duplicate protection)
  // =========================================================================

  app.get("/api/reposts", async (req: Request, res: Response) => {
    try {
      const uid = String(req.query.uid || "").trim();
      const map: Record<string, StoredUserRepost> = {};
      let loadedFromFirestore = false;

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const col = firestore.collection("reposts");
          const snap = uid ? await col.where("repostedBy", "==", uid).get() : await col.limit(200).get();
          snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            if (!d.originalItemId || !d.repostedBy) return;
            const key = `${d.repostedBy}_${d.originalItemId}`;
            map[key] = {
              id: docSnap.id,
              originalItemId: String(d.originalItemId),
              itemType: d.itemType === "post" ? "post" : "recipe",
              repostedBy: String(d.repostedBy),
              repostedByEmail: d.repostedByEmail ? String(d.repostedByEmail) : undefined,
              repostedAt: toIsoDate(d.repostedAt || d.createdAt),
              snapshot: d.snapshot && typeof d.snapshot === "object" ? d.snapshot : undefined,
            };
          });
          loadedFromFirestore = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      const localReposts = readJsonFile<StoredUserRepost>(LOCAL_REPOSTS_FILE);
      for (const rep of localReposts) {
        if (!rep?.originalItemId || !rep?.repostedBy) continue;
        if (uid && rep.repostedBy !== uid) continue;
        const key = `${rep.repostedBy}_${rep.originalItemId}`;
        if (!loadedFromFirestore || !map[key]) {
          map[key] = rep;
        }
      }

      const reposts = Object.values(map).sort((a, b) =>
        (b.repostedAt || "").localeCompare(a.repostedAt || "")
      );
      res.json({ reposts, count: reposts.length });
    } catch (error) {
      console.error("[ContentAPI] GET /api/reposts failed:", error);
      res.status(500).json({ error: "Failed to load reposts" });
    }
  });

  app.post("/api/reposts/toggle", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const originalItemId = String(body.originalItemId || "").trim();
      if (!originalItemId) {
        res.status(400).json({ error: "originalItemId is required" });
        return;
      }

      const authHeader = req.headers.authorization || "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
      let repostedBy = String(body.repostedBy || "").trim();
      let repostedByEmail = String(body.repostedByEmail || "").trim();
      if (bearerToken) {
        const verified = await verifyFirebaseIdToken(bearerToken);
        if (!verified?.uid) {
          res.status(401).json({ error: "Invalid Firebase ID token" });
          return;
        }
        repostedBy = verified.uid;
        repostedByEmail = verified.email || repostedByEmail;
      }

      if (!repostedBy) {
        res.status(400).json({ error: "repostedBy user ID is required" });
        return;
      }

      const docId = `${repostedBy.replace(/[^a-zA-Z0-9_-]/g, "")}_${originalItemId}`;
      const localList = readJsonFile<StoredUserRepost>(LOCAL_REPOSTS_FILE);
      const existingIdx = localList.findIndex(
        (r) => r.repostedBy === repostedBy && r.originalItemId === originalItemId
      );

      // Optional explicit action ("add" / "remove") or automatic toggle
      const desiredAction = String(body.action || "toggle").toLowerCase();
      const shouldRemove =
        desiredAction === "remove" || (desiredAction !== "add" && existingIdx >= 0);

      if (shouldRemove) {
        const nextList = localList.filter(
          (r) => !(r.repostedBy === repostedBy && r.originalItemId === originalItemId)
        );
        writeJsonFile(LOCAL_REPOSTS_FILE, nextList);
        if (!isFirestoreQuotaBackoffActive()) {
          try {
            await firestore.collection("reposts").doc(docId).delete();
          } catch (fsErr) {
            noteFirestoreError(fsErr);
          }
        }
        res.json({ success: true, reposted: false, originalItemId, repostedBy });
        return;
      }

      const record: StoredUserRepost = {
        id: docId,
        originalItemId,
        itemType: body.itemType === "post" ? "post" : "recipe",
        repostedBy,
        repostedByEmail: repostedByEmail || undefined,
        repostedAt: new Date().toISOString(),
        snapshot: body.snapshot && typeof body.snapshot === "object" ? body.snapshot : undefined,
      };

      const nextList = localList.filter(
        (r) => !(r.repostedBy === repostedBy && r.originalItemId === originalItemId)
      );
      nextList.unshift(record);
      writeJsonFile(LOCAL_REPOSTS_FILE, nextList);

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore.collection("reposts").doc(docId).set(
            {
              ...stripUndefined(record),
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      res.status(201).json({ success: true, reposted: true, repost: record });
    } catch (error) {
      console.error("[ContentAPI] POST /api/reposts/toggle failed:", error);
      res.status(500).json({ error: "Failed to toggle repost" });
    }
  });

  // DELETE /api/nutrients/:id — Admin-scoped soft-hide (does NOT delete from User pages unless ?hard=true)
  app.delete("/api/nutrients/:id", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    try {
      const recipeId = String(req.params.id || "").trim();
      const sharedDocId = String(req.query.sharedDocId || req.body?.sharedDocId || "").trim();
      if (!recipeId) {
        res.status(400).json({ error: "Recipe ID is required" });
        return;
      }

      const hardDelete = String(req.query.hard || "").toLowerCase() === "true";
      if (!hardDelete) {
        markAdminHidden("nutrients", recipeId);
        res.json({ success: true, id: recipeId, hiddenInAdmin: true, deleted: true });
        return;
      }

      unmarkAdminHidden("nutrients", recipeId);
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore.collection("recipes").doc(recipeId).delete();
          if (sharedDocId) {
            await firestore.collection("shared_nutrition").doc(sharedDocId).delete();
          }
          await firestore.collection("shared_nutrition").doc(recipeId).delete();
          const sharedByRecipeId = await firestore
            .collection("shared_nutrition")
            .where("recipeId", "==", recipeId)
            .get();
          await Promise.all(sharedByRecipeId.docs.map((d) => d.ref.delete()));
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[ContentAPI] Firestore nutrient delete fallback:", fsErr);
          }
        }
      }

      const nextLocal = readJsonFile<StoredNutrientRecipe>(LOCAL_NUTRIENTS_FILE).filter((r) => r.id !== recipeId);
      writeJsonFile(LOCAL_NUTRIENTS_FILE, nextLocal);

      res.json({ success: true, id: recipeId, deleted: true, hardDeleted: true });
    } catch (error) {
      console.error("[ContentAPI] DELETE /api/nutrients/:id failed:", error);
      res.status(500).json({ error: "Failed to delete nutrient recipe" });
    }
  });

  // =========================================================================
  // MARKETPLACE / SHOP PRODUCTS (Admin-hosted -> User Shop live sync)
  // =========================================================================

  app.get("/api/marketplace", async (_req: Request, res: Response) => {
    try {
      const map: Record<string, StoredMarketplaceProduct> = {};
      let loadedFromFirestore = false;

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const snap = await firestore.collection("marketplace_products").get();
          snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            if (isTestArtifactRecord({ ...d, id: docSnap.id })) return;
            map[docSnap.id] = normalizeMarketplaceProduct(docSnap.id, d);
          });
          loadedFromFirestore = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[ContentAPI] Firestore marketplace read fallback:", fsErr);
          }
        }
      }

      const localProducts = readJsonFile<StoredMarketplaceProduct & { _localOnly?: boolean }>(LOCAL_MARKETPLACE_FILE);
      for (const item of localProducts) {
        if (!item?.id || isTestArtifactRecord(item)) continue;
        if (!loadedFromFirestore || (item._localOnly && !map[item.id])) {
          map[item.id] = normalizeMarketplaceProduct(item.id, item);
        }
      }

      const products = Object.values(map)
        .filter((p) => !isTestArtifactRecord(p))
        .map((p) => ({
          ...p,
          hiddenInAdmin: isAdminHidden("marketplace", p.id),
        }))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      res.json({ products, count: products.length });
    } catch (error) {
      console.error("[ContentAPI] GET /api/marketplace failed:", error);
      res.status(500).json({ error: "Failed to load marketplace products" });
    }
  });

  // POST /api/marketplace — Admin-protected product creation from Events Hosting Studio
  app.post("/api/marketplace", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    try {
      const body = req.body || {};
      const requestedId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
      const docRef = requestedId
        ? firestore.collection("marketplace_products").doc(requestedId)
        : firestore.collection("marketplace_products").doc();
      const productId = docRef.id;

      const normalized = normalizeMarketplaceProduct(productId, {
        ...body,
        creatorRole: "Admin",
        creatorName: body.creatorName || admin.name || "Hivecity Admin",
      });

      let firestoreSaved = false;
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await docRef.set(
            {
              ...normalized,
              updatedAt: FieldValue.serverTimestamp(),
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          firestoreSaved = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[ContentAPI] Firestore marketplace write fallback:", fsErr);
          }
        }
      }

      unmarkAdminHidden("marketplace", productId);
      const localRecord = firestoreSaved ? normalized : { ...normalized, _localOnly: true };
      const local = readJsonFile<StoredMarketplaceProduct>(LOCAL_MARKETPLACE_FILE).filter((p) => p.id !== productId);
      local.unshift(localRecord);
      writeJsonFile(LOCAL_MARKETPLACE_FILE, local);

      res.status(201).json({ success: true, product: normalized, persistedToFirestore: firestoreSaved });
    } catch (error) {
      console.error("[ContentAPI] POST /api/marketplace failed:", error);
      res.status(500).json({ error: "Failed to create marketplace product" });
    }
  });

  // DELETE /api/marketplace/:id — Permanent delete everywhere (Admin + User Shop)
  app.delete("/api/marketplace/:id", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    try {
      const productId = String(req.params.id || "").trim();
      if (!productId) {
        res.status(400).json({ error: "Product ID is required" });
        return;
      }

      unmarkAdminHidden("marketplace", productId);
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore.collection("marketplace_products").doc(productId).delete();
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
        try {
          await firestore.collection("products").doc(productId).delete();
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      const nextLocal = readJsonFile<StoredMarketplaceProduct>(LOCAL_MARKETPLACE_FILE).filter((p) => p.id !== productId);
      writeJsonFile(LOCAL_MARKETPLACE_FILE, nextLocal);

      res.json({ success: true, id: productId, deleted: true, hardDeleted: true });
    } catch (error) {
      console.error("[ContentAPI] DELETE /api/marketplace/:id failed:", error);
      res.status(500).json({ error: "Failed to delete marketplace product" });
    }
  });

  // GET /api/marketplace/orders — List recorded user shop orders
  app.get("/api/marketplace/orders", async (_req: Request, res: Response) => {
    try {
      const map: Record<string, StoredMarketplaceOrder> = {};
      let loadedFromFirestore = false;
      try {
        const snap = await firestore.collection("marketplace_orders").get();
        snap.forEach((docSnap) => {
          const d = docSnap.data() || {};
          const total = Math.round(parseNonNegNumber(d.totalAmount ?? d.unitPrice, 0));
          const created = toIsoDate(d.createdAt);
          map[docSnap.id] = {
            id: docSnap.id,
            productId: String(d.productId || ""),
            item: String(d.item || d.productName || "Hivecity Product"),
            category: String(d.category || "Marketplace"),
            quantity: Math.max(1, Math.round(parseNonNegNumber(d.quantity, 1))),
            unitPrice: Math.round(parseNonNegNumber(d.unitPrice, total)),
            totalAmount: total,
            amount: `₹${total.toLocaleString("en-IN")}`,
            customer: String(d.customer || d.userName || "Hive Athlete"),
            userId: String(d.userId || "guest-athlete"),
            userEmail: String(d.userEmail || ""),
            status: String(d.status || "Confirmed"),
            time: new Date(created).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
            createdAt: created,
          };
        });
        loadedFromFirestore = true;
      } catch {}

      if (!loadedFromFirestore) {
        for (const ord of readJsonFile<StoredMarketplaceOrder>(LOCAL_ORDERS_FILE)) {
          if (ord?.id) map[ord.id] = ord;
        }
      }

      const orders = Object.values(map).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      res.json({ orders, count: orders.length });
    } catch (error) {
      console.error("[ContentAPI] GET /api/marketplace/orders failed:", error);
      res.status(500).json({ error: "Failed to load orders" });
    }
  });

  // POST /api/marketplace/:id/buy — In-app Buy Now purchase (decrements stock & records order)
  app.post("/api/marketplace/:id/buy", async (req: Request, res: Response) => {
    try {
      const productId = String(req.params.id || "").trim();
      const body = req.body || {};
      const qty = Math.max(1, Math.round(parseNonNegNumber(body.quantity, 1)));
      if (!productId) {
        res.status(400).json({ error: "Product ID is required" });
        return;
      }

      let currentProduct: StoredMarketplaceProduct | null = null;
      try {
        const snap = await firestore.collection("marketplace_products").doc(productId).get();
        if (snap.exists) {
          currentProduct = normalizeMarketplaceProduct(snap.id, snap.data() || {});
        }
      } catch {}

      const localProducts = readJsonFile<StoredMarketplaceProduct>(LOCAL_MARKETPLACE_FILE);
      if (!currentProduct) {
        const found = localProducts.find((p) => p.id === productId);
        if (found) currentProduct = normalizeMarketplaceProduct(found.id, found);
      }

      if (!currentProduct) {
        res.status(404).json({ error: "Product not found" });
        return;
      }

      if (currentProduct.stock < qty) {
        res.status(409).json({
          error: currentProduct.stock === 0 ? "This product is out of stock." : `Only ${currentProduct.stock} item(s) left in stock.`,
          remainingStock: currentProduct.stock,
        });
        return;
      }

      const nextStock = Math.max(0, currentProduct.stock - qty);
      const updatedProduct: StoredMarketplaceProduct = {
        ...currentProduct,
        stock: nextStock,
        status: nextStock > 0 ? "In Stock" : "Out of Stock",
        updatedAt: new Date().toISOString(),
      };

      const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const unitPrice = currentProduct.price;
      const totalAmount = unitPrice * qty;
      const nowIso = new Date().toISOString();
      const order: StoredMarketplaceOrder = {
        id: orderId,
        productId,
        item: qty > 1 ? `${currentProduct.name} × ${qty}` : currentProduct.name,
        category: currentProduct.category,
        quantity: qty,
        unitPrice,
        totalAmount,
        amount: `₹${totalAmount.toLocaleString("en-IN")}`,
        customer: String(body.userName || "Hive Athlete").trim(),
        userId: String(body.userId || "guest-athlete").trim(),
        userEmail: String(body.userEmail || "").trim(),
        status: "Confirmed",
        time: new Date(nowIso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        createdAt: nowIso,
      };

      try {
        await firestore.collection("marketplace_products").doc(productId).set(
          {
            stock: nextStock,
            status: updatedProduct.status,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        await firestore.collection("marketplace_orders").doc(orderId).set({
          ...order,
          productName: currentProduct.name,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (fsErr) {
        console.warn("[ContentAPI] Firestore buy fallback:", fsErr);
      }

      const nextLocalProducts = [updatedProduct, ...localProducts.filter((p) => p.id !== productId)];
      writeJsonFile(LOCAL_MARKETPLACE_FILE, nextLocalProducts);
      const localOrders = readJsonFile<StoredMarketplaceOrder>(LOCAL_ORDERS_FILE);
      writeJsonFile(LOCAL_ORDERS_FILE, [order, ...localOrders]);

      res.status(201).json({
        success: true,
        order,
        remainingStock: nextStock,
        product: updatedProduct,
      });
    } catch (error) {
      console.error("[ContentAPI] POST /api/marketplace/:id/buy failed:", error);
      res.status(500).json({ error: "Failed to process purchase" });
    }
  });
}
