import { useState, useEffect, type ChangeEvent } from "react";
import {
  CalendarDays,
  Check,
  ClipboardList,
  Image as ImageIcon,
  ShoppingBag,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { compressImageFileToDataUrl } from "../lib/imageUpload";
import { parseFeeNumber, type HiveEventStatus } from "../utils/eventLifecycle";
import type { BmiCategory } from "../data/nutrientRecipes";
import type { GlycemicIndex, MealType } from "../lib/contentStore";

export type StudioTab = "event" | "nutrient";

export interface CreateEventFormPayload {
  title: string;
  category: string;
  description: string;
  location: string;
  eventDate: string;
  endDate?: string;
  status: HiveEventStatus;
  feeAmount: number;
  termsAndConditions: string;
  bookingUrl: string;
  capacity: number;
  imageUrl: string;
}

export interface CreateNutrientFormPayload {
  title: string;
  mealType: MealType;
  prepTimeMins: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  fiberGrams: number;
  glycemicIndex: GlycemicIndex;
  suitableCategories: BmiCategory[];
  description: string;
  ingredients: string[];
  steps: string[];
  imageUrl: string;
}

export interface CreateProductFormPayload {
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  checkoutUrl: string;
  imageUrl: string;
}

const BMI_CATEGORIES: BmiCategory[] = ["Underweight", "Normal", "Overweight", "Obese"];
const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack", "Post-Workout"];
const PRODUCT_CATEGORIES = [
  "Shoes",
  "Tumblers & Bottles",
  "Fitness Gear",
  "Apparel",
  "Accessories",
  "Supplements",
  "Nutrition Packs",
  "Sportswear",
  "Equipment",
];

const textareaStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--bd)",
  background: "var(--surface)",
  color: "var(--tx)",
  font: "inherit",
  resize: "vertical" as const,
};

export function EventsHostingStudio({
  initialTab = "event",
  onCreateEvent,
  onCreateNutrient,
  onCreateProduct,
}: {
  initialTab?: StudioTab;
  onCreateEvent: (payload: CreateEventFormPayload) => Promise<void>;
  onCreateNutrient: (payload: CreateNutrientFormPayload) => Promise<void>;
  onCreateProduct: (payload: CreateProductFormPayload) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<StudioTab>(initialTab);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // --- Tab 1: Create Event State ---
  const defaultTomorrowDateTime = `${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}T07:00`;
  const [eventImageUrl, setEventImageUrl] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventCategory, setEventCategory] = useState("Running");
  const [eventDescription, setEventDescription] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDateTime, setEventDateTime] = useState(defaultTomorrowDateTime);
  const [eventFee, setEventFee] = useState("0");
  const [eventTerms, setEventTerms] = useState("");
  const [eventCapacity, setEventCapacity] = useState("100");
  const [eventBookingUrl, setEventBookingUrl] = useState("");

  // --- Tab 2: Create Nutrient Recipe & Meal Plan State ---
  const [recipeImageUrl, setRecipeImageUrl] = useState("");
  const [recipeTitle, setRecipeTitle] = useState("");
  const [recipeMealType, setRecipeMealType] = useState<MealType>("Lunch");
  const [recipePrepTime, setRecipePrepTime] = useState("20");
  const [recipeCalories, setRecipeCalories] = useState("420");
  const [recipeProtein, setRecipeProtein] = useState("28");
  const [recipeCarbs, setRecipeCarbs] = useState("38");
  const [recipeFats, setRecipeFats] = useState("12");
  const [recipeFiber, setRecipeFiber] = useState("7");
  const [recipeGi, setRecipeGi] = useState<GlycemicIndex>("Low");
  const [recipeBmiCats, setRecipeBmiCats] = useState<BmiCategory[]>(["Normal", "Overweight"]);
  const [recipeDescription, setRecipeDescription] = useState("");
  const [recipeIngredients, setRecipeIngredients] = useState("");
  const [recipeSteps, setRecipeSteps] = useState("");

  // --- Tab 3: Create Shop / Marketplace Product State ---
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("Shoes");
  const [productPrice, setProductPrice] = useState("1499");
  const [productStock, setProductStock] = useState("25");
  const [productDescription, setProductDescription] = useState("");
  const [productCheckoutUrl, setProductCheckoutUrl] = useState("");

  async function handleImagePick(
    e: ChangeEvent<HTMLInputElement>,
    setter: (dataUrl: string) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFileToDataUrl(file);
      setter(compressed);
    } catch (err: any) {
      toast.error(err?.message || "Could not process image file.");
    } finally {
      e.target.value = "";
    }
  }

  function toggleBmiCategory(cat: BmiCategory) {
    setRecipeBmiCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function submitEvent() {
    if (!eventTitle.trim()) {
      toast.error("Please enter an event title.");
      return;
    }
    if (!eventDateTime.trim()) {
      toast.error("Please choose a schedule date & time.");
      return;
    }
    setSubmitting(true);
    try {
      await onCreateEvent({
        title: eventTitle.trim(),
        category: eventCategory,
        description: eventDescription.trim(),
        location: eventLocation.trim(),
        eventDate: eventDateTime.trim(),
        status: "upcoming",
        feeAmount: parseFeeNumber(eventFee),
        termsAndConditions: eventTerms.trim(),
        bookingUrl: eventBookingUrl.trim(),
        capacity: Math.max(1, Number(eventCapacity) || 100),
        imageUrl: eventImageUrl,
      });
      setEventImageUrl("");
      setEventTitle("");
      setEventDescription("");
      setEventLocation("");
      setEventFee("0");
      setEventTerms("");
      setEventCapacity("100");
      setEventBookingUrl("");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNutrient() {
    if (!recipeTitle.trim()) {
      toast.error("Please enter a recipe / meal title.");
      return;
    }
    if (recipeBmiCats.length === 0) {
      toast.error("Please select at least one target BMI category.");
      return;
    }
    setSubmitting(true);
    try {
      await onCreateNutrient({
        title: recipeTitle.trim(),
        mealType: recipeMealType,
        prepTimeMins: Math.max(1, Number(recipePrepTime) || 20),
        calories: Math.max(0, Number(recipeCalories) || 0),
        proteinGrams: Math.max(0, Number(recipeProtein) || 0),
        carbsGrams: Math.max(0, Number(recipeCarbs) || 0),
        fatsGrams: Math.max(0, Number(recipeFats) || 0),
        fiberGrams: Math.max(0, Number(recipeFiber) || 0),
        glycemicIndex: recipeGi,
        suitableCategories: recipeBmiCats,
        description: recipeDescription.trim(),
        ingredients: recipeIngredients
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        steps: recipeSteps
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        imageUrl: recipeImageUrl,
      });
      setRecipeImageUrl("");
      setRecipeTitle("");
      setRecipeDescription("");
      setRecipeIngredients("");
      setRecipeSteps("");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitProduct() {
    if (!productName.trim()) {
      toast.error("Please enter a product name.");
      return;
    }
    const cleanUrl = productCheckoutUrl.trim();
    if (!cleanUrl) {
      toast.error("Please enter a verified direct Amazon or Flipkart product URL before publishing.");
      return;
    }
    let parsed: URL | null = null;
    try {
      parsed = new URL(cleanUrl);
    } catch {
      toast.error("Please enter a valid product URL starting with https://");
      return;
    }
    const host = parsed.hostname.toLowerCase();
    const fullPath = `${parsed.pathname}${parsed.search}`.toLowerCase();
    const isSearchPage =
      (host.includes("amazon.") && (parsed.pathname === "/s" || parsed.pathname.startsWith("/s/") || parsed.searchParams.has("k"))) ||
      (host.includes("flipkart.") && (parsed.pathname.startsWith("/search") || parsed.searchParams.has("q")));
    if (isSearchPage) {
      toast.error("Please paste a direct product page link (e.g., amazon.in/dp/<ASIN>, amzn.to/..., or flipkart.com/.../p/...), not a search results page.");
      return;
    }
    const isDirectPartnerProduct =
      /\/dp\/[a-z0-9]{10}/i.test(fullPath) ||
      /\/gp\/product\/[a-z0-9]{10}/i.test(fullPath) ||
      host.includes("amzn.to") ||
      host.includes("amzn.in") ||
      host.includes("link.amazon") ||
      /\/p\/itm/i.test(fullPath);
    if (!isDirectPartnerProduct) {
      toast.error("Please paste a direct product link (amazon.in/dp/..., amzn.to/..., link.amazon/..., or flipkart.com/.../p/...).");
      return;
    }
    setSubmitting(true);
    try {
      await onCreateProduct({
        name: productName.trim(),
        category: productCategory,
        price: Math.max(0, Number(productPrice) || 0),
        stock: Math.max(0, Number(productStock) || 0),
        description: productDescription.trim(),
        checkoutUrl: cleanUrl,
        imageUrl: productImageUrl,
      });
      setProductImageUrl("");
      setProductName("");
      setProductPrice("999");
      setProductStock("25");
      setProductDescription("");
      setProductCheckoutUrl("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="content-page">
      <div className="surface" style={{ padding: "24px 28px" }}>
        <div className="panel-header" style={{ marginBottom: 4 }}>
          <div>
            <span className="panel-eyebrow">CENTRAL CREATION STUDIO</span>
            <h2>Publish to Events &amp; Nutrients</h2>
          </div>
          <span className="status-pill published">LIVE SYNC ENABLED</span>
        </div>

        <div className="modal-tabs" role="tablist" aria-label="Creation studio modules" style={{ marginTop: 14 }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "event"}
            className={`modal-tab ${activeTab === "event" ? "active" : ""}`}
            onClick={() => setActiveTab("event")}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <CalendarDays size={14} /> Create Event
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "nutrient"}
            className={`modal-tab ${activeTab === "nutrient" ? "active" : ""}`}
            onClick={() => setActiveTab("nutrient")}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={14} /> Create Nutrient Recipe &amp; Meal Plan
            </span>
          </button>
        </div>

        {activeTab === "event" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitEvent();
            }}
          >
            <ImageUploadField
              label="Event Cover Image"
              previewUrl={eventImageUrl}
              onPick={(e) => void handleImagePick(e, setEventImageUrl)}
              onUrlChange={setEventImageUrl}
              onClear={() => setEventImageUrl("")}
              helper="Upload an image or paste an image URL — displays directly on User Events cards."
            />

            <div className="form-grid">
              <label className="field-label">
                Event Title
                <input
                  required
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="e.g. Sunset City 5K Run"
                />
              </label>
              <label className="field-label">
                Category
                <select value={eventCategory} onChange={(e) => setEventCategory(e.target.value)}>
                  <option value="Running">Running</option>
                  <option value="HIVE PLAY">HIVE PLAY</option>
                  <option value="Community">Community</option>
                </select>
              </label>
            </div>

            <div className="form-grid">
              <label className="field-label">
                Location
                <input
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder="e.g. Coimbatore, Saravanampatti"
                />
              </label>
              <label className="field-label">
                Schedule Date &amp; Time
                <input
                  type="datetime-local"
                  required
                  value={eventDateTime}
                  onChange={(e) => setEventDateTime(e.target.value)}
                />
              </label>
            </div>

            <div className="form-grid">
              <label className="field-label">
                Entry Fee (₹ — 0 for Free)
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={eventFee}
                  onChange={(e) => setEventFee(e.target.value)}
                  placeholder="e.g. 499"
                />
              </label>
              <label className="field-label">
                Max Capacity
                <input
                  type="number"
                  min={1}
                  value={eventCapacity}
                  onChange={(e) => setEventCapacity(e.target.value)}
                  placeholder="100"
                />
              </label>
            </div>

            <label className="field-label">
              External Booking URL (optional)
              <input
                type="url"
                value={eventBookingUrl}
                onChange={(e) => setEventBookingUrl(e.target.value)}
                placeholder="https://... (leave blank for instant in-app booking)"
              />
            </label>

            <label className="field-label">
              Description
              <textarea
                rows={2}
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                placeholder="Describe route distance, timing, check-in details…"
                style={textareaStyle}
              />
            </label>

            <label className="field-label">
              Terms &amp; Conditions (T&amp;C)
              <textarea
                rows={3}
                value={eventTerms}
                onChange={(e) => setEventTerms(e.target.value)}
                placeholder="Enter Terms & Conditions users must read & agree to before booking…"
                style={textareaStyle}
              />
            </label>

            <div className="modal-note">
              <ClipboardList size={15} />
              <span>
                Publishes immediately to <strong>Admin → Events</strong> and <strong>User → Activity Events</strong> (auto-moves Upcoming → Ongoing on event date).
              </span>
            </div>

            <div className="modal-actions">
              <button type="submit" className="primary-button" disabled={submitting}>
                <Check size={16} /> {submitting ? "Publishing event…" : "Publish Event"}
              </button>
            </div>
          </form>
        )}

        {activeTab === "nutrient" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitNutrient();
            }}
          >
            <ImageUploadField
              label="Recipe / Meal Image"
              previewUrl={recipeImageUrl}
              onPick={(e) => void handleImagePick(e, setRecipeImageUrl)}
              onUrlChange={setRecipeImageUrl}
              onClear={() => setRecipeImageUrl("")}
              helper="Upload an image or paste an image URL — featured inside User Nutrients → Special nutrition."
            />

            <div className="form-grid">
              <label className="field-label">
                Recipe / Meal Title
                <input
                  required
                  value={recipeTitle}
                  onChange={(e) => setRecipeTitle(e.target.value)}
                  placeholder="e.g. Grilled Paneer Quinoa Power Bowl"
                />
              </label>
              <label className="field-label">
                Meal Type
                <select
                  value={recipeMealType}
                  onChange={(e) => setRecipeMealType(e.target.value as MealType)}
                >
                  {MEAL_TYPES.map((mt) => (
                    <option key={mt} value={mt}>
                      {mt}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-grid">
              <label className="field-label">
                Prep Time (mins)
                <input
                  type="number"
                  min={1}
                  value={recipePrepTime}
                  onChange={(e) => setRecipePrepTime(e.target.value)}
                />
              </label>
              <label className="field-label">
                Glycemic Index
                <select
                  value={recipeGi}
                  onChange={(e) => setRecipeGi(e.target.value as GlycemicIndex)}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                gap: 12,
              }}
            >
              <label className="field-label">
                Calories (kcal)
                <input
                  type="number"
                  min={0}
                  value={recipeCalories}
                  onChange={(e) => setRecipeCalories(e.target.value)}
                />
              </label>
              <label className="field-label">
                Protein (g)
                <input
                  type="number"
                  min={0}
                  value={recipeProtein}
                  onChange={(e) => setRecipeProtein(e.target.value)}
                />
              </label>
              <label className="field-label">
                Carbs (g)
                <input
                  type="number"
                  min={0}
                  value={recipeCarbs}
                  onChange={(e) => setRecipeCarbs(e.target.value)}
                />
              </label>
              <label className="field-label">
                Fats (g)
                <input
                  type="number"
                  min={0}
                  value={recipeFats}
                  onChange={(e) => setRecipeFats(e.target.value)}
                />
              </label>
              <label className="field-label">
                Fiber (g)
                <input
                  type="number"
                  min={0}
                  value={recipeFiber}
                  onChange={(e) => setRecipeFiber(e.target.value)}
                />
              </label>
            </div>

            <div className="field-label">
              <span>Target BMI Categories</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {BMI_CATEGORIES.map((cat) => {
                  const active = recipeBmiCats.includes(cat);
                  return (
                    <label
                      key={cat}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 99,
                        border: `1px solid ${active ? "var(--ac)" : "var(--bd)"}`,
                        background: active
                          ? "color-mix(in srgb, var(--ac) 14%, transparent)"
                          : "var(--surface-soft)",
                        color: "var(--tx)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleBmiCategory(cat)}
                        style={{ width: "auto", margin: 0 }}
                      />
                      <span>{cat}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="field-label">
              Preparation Description
              <textarea
                rows={3}
                value={recipeDescription}
                onChange={(e) => setRecipeDescription(e.target.value)}
                placeholder="Describe nutrition benefits, flavor profile, and preparation summary…"
                style={textareaStyle}
              />
            </label>

            <div className="form-grid">
              <label className="field-label">
                Ingredients (one per line, optional)
                <textarea
                  rows={3}
                  value={recipeIngredients}
                  onChange={(e) => setRecipeIngredients(e.target.value)}
                  placeholder={"150g paneer cubes\n80g cooked quinoa\n1 cup baby spinach"}
                  style={textareaStyle}
                />
              </label>
              <label className="field-label">
                Preparation Steps (one per line, optional)
                <textarea
                  rows={3}
                  value={recipeSteps}
                  onChange={(e) => setRecipeSteps(e.target.value)}
                  placeholder={"Season and grill paneer\nToss warm quinoa with spinach\nServe with lemon dressing"}
                  style={textareaStyle}
                />
              </label>
            </div>

            <div className="modal-note">
              <Sparkles size={15} />
              <span>
                Publishes immediately to <strong>Admin → Nutrition Studio / Recipes &amp; Meal Plans</strong> and <strong>User → Nutrients</strong> (evaluated automatically by the BMI rule-based matcher).
              </span>
            </div>

            <div className="modal-actions">
              <button type="submit" className="primary-button" disabled={submitting}>
                <Check size={16} /> {submitting ? "Publishing recipe…" : "Publish Recipe / Meal Plan"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ImageUploadField({
  label,
  previewUrl,
  onPick,
  onUrlChange,
  onClear,
  helper,
}: {
  label: string;
  previewUrl: string;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  onUrlChange?: (url: string) => void;
  onClear: () => void;
  helper: string;
}) {
  const isDataUrl = previewUrl.startsWith("data:");
  return (
    <div className="field-label" style={{ marginTop: 4 }}>
      <span>{label}</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px dashed var(--bd)",
          background: "var(--surface-soft)",
        }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={label}
            style={{
              width: 84,
              height: 60,
              objectFit: "cover",
              borderRadius: 8,
              border: "1px solid var(--bd)",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 84,
              height: 60,
              borderRadius: 8,
              border: "1px solid var(--bd)",
              background: "var(--card)",
              display: "grid",
              placeItems: "center",
              color: "var(--mu)",
              flexShrink: 0,
            }}
          >
            <ImageIcon size={20} />
          </div>
        )}
        <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 200 }}>
          <input type="file" accept="image/*" onChange={onPick} style={{ fontSize: 12 }} />
          {onUrlChange && (
            <input
              type="url"
              value={isDataUrl ? "" : previewUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="Or paste an image URL (https://...)"
              style={{ fontSize: 12 }}
            />
          )}
          <small style={{ color: "var(--mu)", fontWeight: 400 }}>{helper}</small>
        </div>
        {previewUrl && (
          <button
            type="button"
            className="secondary-button small-button"
            onClick={onClear}
            style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.35)" }}
          >
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
