import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateBmi,
  classifyBmi,
  normalizeHeightToCm,
  normalizeWeightToKg,
  buildUserBmiProfile,
  getCalorieTargetAndStrategy,
  calculateMaxHeartRate,
  getHeartRateZone,
  getRecommendedRecipesForBmi,
  getTopRecommendedRecipes,
  saveUserBmiProfile,
  getUserBmiProfile,
  BMI_STORAGE_KEY
} from './bmiNutrientEngine';
import { SEED_NUTRIENT_RECIPES } from '../data/nutrientRecipes';

describe('BMI & Nutrient Recipe Engine', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage = {};

    const localStorageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      }
    };

    if (typeof window === 'undefined') {
      const mockWin = {
        localStorage: localStorageMock,
        dispatchEvent: vi.fn()
      };
      (globalThis as any).window = mockWin;
      (globalThis as any).localStorage = localStorageMock;
    } else {
      Object.defineProperty(window, 'localStorage', {
        value: localStorageMock,
        writable: true
      });
    }
  });

  describe('Mandatory Verification Case', () => {
    it('accurately computes 60 kg and 5 ft to BMI = 25.83 (Overweight)', () => {
      // 5 feet = 5 * 12 * 2.54 = 152.4 cm
      const heightCm = normalizeHeightToCm(5, 'ft', 5, 0);
      expect(heightCm).toBe(152.4);

      const weightKg = normalizeWeightToKg(60, 'kg');
      expect(weightKg).toBe(60);

      const bmi = calculateBmi(weightKg, heightCm);
      // 60 / (1.524^2) = 60 / 2.322576 = 25.8333... => 25.83
      expect(bmi).toBe(25.83);

      const category = classifyBmi(bmi);
      expect(category).toBe('Overweight');

      const { dailyCalorieTarget, goalStrategy } = getCalorieTargetAndStrategy(category, weightKg);
      // 60 * 24 = 1440 kcal
      expect(dailyCalorieTarget).toBe(1440);
      expect(goalStrategy).toBe('calorie_deficit');

      const profile = buildUserBmiProfile({
        height: 5,
        heightUnit: 'ft',
        feet: 5,
        inches: 0,
        weight: 60,
        weightUnit: 'kg',
        age: 26,
        gender: 'female'
      });

      expect(profile.bmi).toBe(25.83);
      expect(profile.bmiCategory).toBe('Overweight');
      expect(profile.dailyCalorieTarget).toBe(1440);
      expect(profile.goalStrategy).toBe('calorie_deficit');
    });
  });

  describe('Unit Conversions & BMI Classification', () => {
    it('converts lbs to kg correctly', () => {
      // 150 lbs = 68.04 kg
      expect(normalizeWeightToKg(150, 'lbs')).toBe(68.04);
      expect(normalizeWeightToKg(70, 'kg')).toBe(70);
    });

    it('converts feet and inches to cm correctly', () => {
      // 5 ft 10 in = 70 in * 2.54 = 177.8 cm
      expect(normalizeHeightToCm(0, 'ft', 5, 10)).toBe(177.8);
      expect(normalizeHeightToCm(175, 'cm')).toBe(175);
    });

    it('classifies all standard BMI categories correctly', () => {
      expect(classifyBmi(17.8)).toBe('Underweight');
      expect(classifyBmi(18.5)).toBe('Normal');
      expect(classifyBmi(22.4)).toBe('Normal');
      expect(classifyBmi(24.9)).toBe('Normal');
      expect(classifyBmi(25.0)).toBe('Overweight');
      expect(classifyBmi(29.9)).toBe('Overweight');
      expect(classifyBmi(30.0)).toBe('Obese');
      expect(classifyBmi(35.2)).toBe('Obese');
    });

    it('calculates targets for underweight, normal, and obese', () => {
      // Underweight: weight * 36
      const under = getCalorieTargetAndStrategy('Underweight', 45);
      expect(under.dailyCalorieTarget).toBe(1620);
      expect(under.goalStrategy).toBe('calorie_surplus');

      // Normal: weight * 30
      const norm = getCalorieTargetAndStrategy('Normal', 65);
      expect(norm.dailyCalorieTarget).toBe(1950);
      expect(norm.goalStrategy).toBe('balanced_maintenance');

      // Obese: max(1300, weight * 21)
      const obese = getCalorieTargetAndStrategy('Obese', 90);
      expect(obese.dailyCalorieTarget).toBe(1890);
      expect(obese.goalStrategy).toBe('low_glycemic_high_fiber');
    });
  });

  describe('Heart Rate Zones', () => {
    it('computes max HR based on 220 - age', () => {
      expect(calculateMaxHeartRate(20)).toBe(200);
      expect(calculateMaxHeartRate(30)).toBe(190);
      expect(calculateMaxHeartRate(0)).toBe(195); // default fallback age 25
    });

    it('categorizes heart rate zones accurately', () => {
      const maxHR = 200;
      expect(getHeartRateZone(90, maxHR)).toBe('Resting'); // 45%
      expect(getHeartRateZone(110, maxHR)).toBe('Warm-Up'); // 55%
      expect(getHeartRateZone(130, maxHR)).toBe('Fat Burn'); // 65%
      expect(getHeartRateZone(160, maxHR)).toBe('Cardio'); // 80%
      expect(getHeartRateZone(180, maxHR)).toBe('Peak'); // 90%
    });
  });

  describe('Recipe Recommendations', () => {
    it('prioritizes recipes fitting calorie deficit for overweight profile', () => {
      const profile = buildUserBmiProfile({
        height: 5,
        heightUnit: 'ft',
        feet: 5,
        inches: 0,
        weight: 60,
        weightUnit: 'kg',
        age: 26,
        gender: 'female'
      });

      const recommendations = getRecommendedRecipesForBmi(SEED_NUTRIENT_RECIPES, profile);
      expect(recommendations.length).toBe(SEED_NUTRIENT_RECIPES.length);

      // First items should be primary fits
      expect(recommendations[0].isPrimaryFit).toBe(true);
      expect(recommendations[0].recipe.suitableCategories).toContain('Overweight');

      // Top 3 preview picks for Activity page
      const top3 = getTopRecommendedRecipes(profile, SEED_NUTRIENT_RECIPES, 3);
      expect(top3.length).toBe(3);
      top3.forEach(item => {
        expect(item.isPrimaryFit).toBe(true);
      });
    });

    it('returns general recommendations when no profile is present', () => {
      const recommendations = getRecommendedRecipesForBmi(SEED_NUTRIENT_RECIPES, null);
      expect(recommendations.length).toBe(SEED_NUTRIENT_RECIPES.length);
      expect(recommendations[0].matchReason).toBe('General Healthy Plate');
      expect(recommendations[0].isPrimaryFit).toBe(false);
    });
  });

  describe('Persistence in localStorage', () => {
    it('saves and loads profile and fires event', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      const profile = buildUserBmiProfile({
        height: 165,
        heightUnit: 'cm',
        weight: 58,
        weightUnit: 'kg',
        age: 24,
        gender: 'female'
      });

      saveUserBmiProfile(profile);

      expect(localStorage.getItem(BMI_STORAGE_KEY)).toContain('"bmiCategory":"Normal"');
      expect(dispatchSpy).toHaveBeenCalled();

      const retrieved = getUserBmiProfile();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.bmiCategory).toBe('Normal');
      expect(retrieved?.weightKg).toBe(58);
    });
  });
});
