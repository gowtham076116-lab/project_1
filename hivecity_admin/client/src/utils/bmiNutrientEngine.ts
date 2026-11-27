import { BmiCategory, NutrientRecipe, SEED_NUTRIENT_RECIPES } from '../data/nutrientRecipes';

export type HeightUnit = 'cm' | 'ft';
export type WeightUnit = 'kg' | 'lbs';
export type Gender = 'male' | 'female' | 'other';
export type GoalStrategy =
  | 'calorie_surplus'
  | 'balanced_maintenance'
  | 'calorie_deficit'
  | 'low_glycemic_high_fiber';

export type HeartRateZone = 'Resting' | 'Warm-Up' | 'Fat Burn' | 'Cardio' | 'Peak';

export interface UserBmiProfile {
  height: number;
  heightUnit: HeightUnit;
  feet?: number;
  inches?: number;
  heightCm: number;
  weight: number;
  weightUnit: WeightUnit;
  weightKg: number;
  age: number;
  gender: Gender;
  bmi: number;
  bmiCategory: BmiCategory;
  dailyCalorieTarget: number;
  goalStrategy: GoalStrategy;
  updatedAt: string;
}

export interface RecommendedRecipeItem {
  recipe: NutrientRecipe;
  matchReason: string;
  isPrimaryFit: boolean;
}

export const BMI_STORAGE_KEY = 'hivecity_user_bmi_profile';

/**
 * Normalizes height to centimeters.
 * If ft/in: (feet * 12 + inches) * 2.54
 */
export function normalizeHeightToCm(
  height: number,
  unit: HeightUnit,
  feet?: number,
  inches: number = 0
): number {
  if (unit === 'ft') {
    const totalInches = (feet !== undefined ? feet : height) * 12 + (inches || 0);
    return Number((totalInches * 2.54).toFixed(2));
  }
  return Number(height.toFixed(2));
}

/**
 * Normalizes weight to kilograms.
 * If lbs: lbs * 0.45359237
 */
export function normalizeWeightToKg(weight: number, unit: WeightUnit): number {
  if (unit === 'lbs') {
    return Number((weight * 0.45359237).toFixed(2));
  }
  return Number(weight.toFixed(2));
}

/**
 * Computes Body Mass Index (BMI).
 * BMI = weightKg / ((heightCm / 100) ** 2) rounded to 2 decimal places.
 */
export function calculateBmi(weightKg: number, heightCm: number): number {
  if (heightCm <= 0 || weightKg <= 0) return 0;
  const heightM = heightCm / 100;
  const bmiVal = weightKg / (heightM * heightM);
  return Number(bmiVal.toFixed(2));
}

/**
 * Classifies BMI score into standard clinical categories:
 * < 18.5 => Underweight
 * 18.5 - 24.9 => Normal
 * 25.0 - 29.9 => Overweight
 * >= 30.0 => Obese
 */
export function classifyBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25.0) return 'Normal';
  if (bmi < 30.0) return 'Overweight';
  return 'Obese';
}

/**
 * Determines daily calorie target and macro/dietary strategy based on BMI category.
 */
export function getCalorieTargetAndStrategy(
  category: BmiCategory,
  weightKg: number
): { dailyCalorieTarget: number; goalStrategy: GoalStrategy } {
  switch (category) {
    case 'Underweight':
      return {
        dailyCalorieTarget: Math.round(weightKg * 36),
        goalStrategy: 'calorie_surplus'
      };
    case 'Normal':
      return {
        dailyCalorieTarget: Math.round(weightKg * 30),
        goalStrategy: 'balanced_maintenance'
      };
    case 'Overweight':
      return {
        dailyCalorieTarget: Math.max(1400, Math.round(weightKg * 24)),
        goalStrategy: 'calorie_deficit'
      };
    case 'Obese':
      return {
        dailyCalorieTarget: Math.max(1300, Math.round(weightKg * 21)),
        goalStrategy: 'low_glycemic_high_fiber'
      };
  }
}

/**
 * Constructs a validated UserBmiProfile object from user input.
 */
export function buildUserBmiProfile(params: {
  height: number;
  heightUnit: HeightUnit;
  feet?: number;
  inches?: number;
  weight: number;
  weightUnit: WeightUnit;
  age: number;
  gender: Gender;
}): UserBmiProfile {
  const heightCm = normalizeHeightToCm(
    params.height,
    params.heightUnit,
    params.feet,
    params.inches
  );
  const weightKg = normalizeWeightToKg(params.weight, params.weightUnit);
  const bmi = calculateBmi(weightKg, heightCm);
  const bmiCategory = classifyBmi(bmi);
  const { dailyCalorieTarget, goalStrategy } = getCalorieTargetAndStrategy(
    bmiCategory,
    weightKg
  );

  return {
    height: params.height,
    heightUnit: params.heightUnit,
    feet: params.feet,
    inches: params.inches,
    heightCm,
    weight: params.weight,
    weightUnit: params.weightUnit,
    weightKg,
    age: params.age || 25,
    gender: params.gender || 'other',
    bmi,
    bmiCategory,
    dailyCalorieTarget,
    goalStrategy,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Saves BMI profile to localStorage and notifies listeners.
 */
export function saveUserBmiProfile(profile: UserBmiProfile): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(BMI_STORAGE_KEY, JSON.stringify(profile));
    window.dispatchEvent(
      new CustomEvent('hivecity:bmi-updated', { detail: profile })
    );
  }
}

/**
 * Retrieves the stored BMI profile, or null if none exists.
 */
export function getUserBmiProfile(): UserBmiProfile | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(BMI_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserBmiProfile;
  } catch (err) {
    console.error('Failed to parse BMI profile from localStorage', err);
    return null;
  }
}

/**
 * Heart Rate calculations
 */
export function calculateMaxHeartRate(age: number): number {
  const cleanAge = age > 0 ? age : 25;
  return 220 - cleanAge;
}

export function getHeartRateZone(bpm: number, maxHR: number): HeartRateZone {
  if (maxHR <= 0) return 'Resting';
  const ratio = bpm / maxHR;
  if (ratio < 0.5) return 'Resting';
  if (ratio < 0.6) return 'Warm-Up';
  if (ratio < 0.7) return 'Fat Burn';
  if (ratio < 0.85) return 'Cardio';
  return 'Peak';
}

/**
 * Recommends and scores recipes according to user's BMI profile and target calories.
 */
export function getRecommendedRecipesForBmi(
  recipes: NutrientRecipe[] = SEED_NUTRIENT_RECIPES,
  profile: UserBmiProfile | null
): RecommendedRecipeItem[] {
  if (!profile) {
    return recipes.map(r => ({
      recipe: r,
      matchReason: 'General Healthy Plate',
      isPrimaryFit: false
    }));
  }

  const { bmiCategory, dailyCalorieTarget } = profile;
  const maxMealCalories = Math.round(dailyCalorieTarget * 0.4);

  return recipes
    .map(recipe => {
      let isPrimaryFit = false;
      let matchReason = '';

      if (bmiCategory === 'Underweight') {
        const hitsSurplus = recipe.calories >= 500 && recipe.proteinGrams >= 25;
        const hitsCategory = recipe.suitableCategories.includes('Underweight');
        if (hitsSurplus || hitsCategory) {
          isPrimaryFit = true;
          matchReason = `High Energy Density (${recipe.calories} kcal) & High Protein (${recipe.proteinGrams}g)`;
        } else {
          matchReason = `Nutrient Dense Addition (${recipe.calories} kcal)`;
        }
      } else if (bmiCategory === 'Normal') {
        const hitsMaintenance =
          recipe.calories >= 350 &&
          recipe.calories <= 650 &&
          recipe.proteinGrams >= 20 &&
          recipe.fiberGrams >= 5;
        const hitsCategory = recipe.suitableCategories.includes('Normal');
        if (hitsMaintenance || hitsCategory) {
          isPrimaryFit = true;
          matchReason = `Balanced Macro Fit (${recipe.proteinGrams}g Protein, ${recipe.fiberGrams}g Fiber)`;
        } else {
          matchReason = 'Maintenance Variety';
        }
      } else if (bmiCategory === 'Overweight') {
        const hitsDeficit =
          recipe.calories <= maxMealCalories &&
          recipe.proteinGrams >= 22 &&
          recipe.fiberGrams >= 6;
        const hitsCategory = recipe.suitableCategories.includes('Overweight');
        if (hitsDeficit || hitsCategory) {
          isPrimaryFit = true;
          matchReason = `Calorie Deficit Fit (≤${maxMealCalories} kcal) • ${recipe.proteinGrams}g Protein • High Satiety`;
        } else {
          matchReason = `Moderate Calorie Fit (${recipe.calories} kcal)`;
        }
      } else {
        // Obese
        const hitsLowGiHighFiber =
          recipe.calories <= 450 &&
          recipe.carbsGrams <= 38 &&
          recipe.proteinGrams >= 25 &&
          recipe.fiberGrams >= 7 &&
          recipe.glycemicIndex === 'Low';
        const hitsCategory = recipe.suitableCategories.includes('Obese');
        if (hitsLowGiHighFiber || hitsCategory) {
          isPrimaryFit = true;
          matchReason = `Low Glycemic Index • ${recipe.fiberGrams}g Fiber • ${recipe.proteinGrams}g Protein`;
        } else {
          matchReason = `Calorie Controlled (${recipe.calories} kcal)`;
        }
      }

      return {
        recipe,
        matchReason,
        isPrimaryFit
      };
    })
    .sort((a, b) => {
      if (a.isPrimaryFit && !b.isPrimaryFit) return -1;
      if (!a.isPrimaryFit && b.isPrimaryFit) return 1;
      return 0;
    });
}

/**
 * Returns the top N (default 3) BMI-matched nutrient recipes for immediate preview cards.
 */
export function getTopRecommendedRecipes(
  profile: UserBmiProfile | null,
  recipes: NutrientRecipe[] = SEED_NUTRIENT_RECIPES,
  limit: number = 3
): RecommendedRecipeItem[] {
  if (!profile) return [];
  const all = getRecommendedRecipesForBmi(recipes, profile);
  const primary = all.filter(item => item.isPrimaryFit);
  return (primary.length >= limit ? primary : all).slice(0, limit);
}
