export type BmiCategory = 'Underweight' | 'Normal' | 'Overweight' | 'Obese';

export interface NutrientRecipe {
  id: string;
  title: string;
  description: string;
  mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Post-Workout';
  prepTimeMins: number;
  calories: number;        // kcal per serving
  proteinGrams: number;    // g
  carbsGrams: number;      // g
  fatsGrams: number;       // g
  fiberGrams: number;      // g
  glycemicIndex: 'Low' | 'Medium' | 'High';
  tags: string[];          // e.g., ['high-protein', 'calorie-deficit', 'high-fiber', 'calorie-dense']
  suitableCategories: BmiCategory[];
  image?: string;
  imageUrls?: string[];
}

export const SEED_NUTRIENT_RECIPES: NutrientRecipe[] = [
  {
    id: 'seed-nut-01',
    title: 'Grilled Paneer & Quinoa Bowl',
    description: 'High-protein seasoned cottage cheese tossed with warm tri-color quinoa, spinach, and roasted peppers.',
    mealType: 'Lunch',
    prepTimeMins: 25,
    calories: 420,
    proteinGrams: 28,
    carbsGrams: 34,
    fatsGrams: 16,
    fiberGrams: 7,
    glycemicIndex: 'Low',
    tags: ['high-protein', 'calorie-deficit', 'high-fiber', 'vegetarian'],
    suitableCategories: ['Overweight', 'Normal', 'Obese'],
    image: 'assets/recipes/Muscle_Building/Grilled Paneer Quinoa Bowl/image_01.jpeg',
    imageUrls: ['assets/recipes/Muscle_Building/Grilled Paneer Quinoa Bowl/image_01.jpeg']
  },
  {
    id: 'seed-nut-02',
    title: 'Moong Dal Chilla with Mint Chutney',
    description: 'Crispy savory yellow lentil pancakes stuffed with grated vegetables and accompanied by zesty mint chutney.',
    mealType: 'Breakfast',
    prepTimeMins: 20,
    calories: 320,
    proteinGrams: 22,
    carbsGrams: 36,
    fatsGrams: 8,
    fiberGrams: 8,
    glycemicIndex: 'Low',
    tags: ['low-glycemic', 'high-fiber', 'calorie-deficit', 'vegan'],
    suitableCategories: ['Overweight', 'Obese', 'Normal'],
    image: 'assets/recipes/Weight_Loss/Moong Dal Chilla/image_01.jpeg',
    imageUrls: ['assets/recipes/Weight_Loss/Moong Dal Chilla/image_01.jpeg']
  },
  {
    id: 'seed-nut-03',
    title: 'Peanut Butter Banana Oats Smoothie',
    description: 'Dense, nutrient-packed energy smoothie with rolled oats, organic peanut butter, banana, whole milk, and chia.',
    mealType: 'Breakfast',
    prepTimeMins: 10,
    calories: 640,
    proteinGrams: 30,
    carbsGrams: 76,
    fatsGrams: 24,
    fiberGrams: 9,
    glycemicIndex: 'Medium',
    tags: ['calorie-dense', 'high-protein', 'weight-gain', 'mass-builder'],
    suitableCategories: ['Underweight', 'Normal'],
    image: 'assets/recipes/Weight_Gain/Peanut Butter Banana Smoothie/image_01.jpeg',
    imageUrls: ['assets/recipes/Weight_Gain/Peanut Butter Banana Smoothie/image_01.jpeg']
  },
  {
    id: 'seed-nut-04',
    title: 'Steamed Idli with Sambar & Egg Whites',
    description: 'Fermented soft rice-lentil idlis served with vegetable-packed pigeon pea sambar and spiced boiled egg whites.',
    mealType: 'Breakfast',
    prepTimeMins: 20,
    calories: 380,
    proteinGrams: 24,
    carbsGrams: 52,
    fatsGrams: 6,
    fiberGrams: 6,
    glycemicIndex: 'Medium',
    tags: ['lean-protein', 'digestive-health', 'balanced-maintenance'],
    suitableCategories: ['Normal', 'Overweight'],
    image: 'assets/recipes/Maintenance/Steamed Idli Sambar/image_01.jpeg',
    imageUrls: ['assets/recipes/Maintenance/Steamed Idli Sambar/image_01.jpeg']
  },
  {
    id: 'seed-nut-05',
    title: 'Grilled Chicken & Roasted Veggie Salad',
    description: 'Herb-marinated grilled chicken breast served over warm roasted zucchini, broccoli, cucumbers, and olive oil dressing.',
    mealType: 'Dinner',
    prepTimeMins: 30,
    calories: 390,
    proteinGrams: 42,
    carbsGrams: 18,
    fatsGrams: 14,
    fiberGrams: 7,
    glycemicIndex: 'Low',
    tags: ['high-protein', 'calorie-deficit', 'low-carb', 'lean-muscle'],
    suitableCategories: ['Overweight', 'Obese', 'Normal'],
    image: 'assets/recipes/Weight_Loss/Grilled Chicken Roasted Veggie Salad/image_01.jpeg',
    imageUrls: ['assets/recipes/Weight_Loss/Grilled Chicken Roasted Veggie Salad/image_01.jpeg']
  },
  {
    id: 'seed-nut-06',
    title: 'Ragi Malt with Chia & Almonds',
    description: 'Slow-cooked calcium and iron-rich finger millet porridge simmered with crushed almonds, chia seeds, and jaggery.',
    mealType: 'Breakfast',
    prepTimeMins: 15,
    calories: 520,
    proteinGrams: 26,
    carbsGrams: 68,
    fatsGrams: 15,
    fiberGrams: 11,
    glycemicIndex: 'Low',
    tags: ['micronutrient-rich', 'calorie-dense', 'superfood', 'recovery'],
    suitableCategories: ['Underweight', 'Normal'],
    image: 'assets/recipes/Weight_Gain/Ragi Malt Porridge/image_01.jpeg',
    imageUrls: ['assets/recipes/Weight_Gain/Ragi Malt Porridge/image_01.jpeg']
  },
  {
    id: 'seed-nut-07',
    title: 'Greek Yogurt Berry & Flax Bowl',
    description: 'Thick strained probiotic yogurt topped with antioxidant-rich blueberries, raspberries, golden flax, and walnuts.',
    mealType: 'Snack',
    prepTimeMins: 8,
    calories: 280,
    proteinGrams: 23,
    carbsGrams: 26,
    fatsGrams: 7,
    fiberGrams: 6,
    glycemicIndex: 'Low',
    tags: ['low-glycemic', 'high-protein', 'quick-prep', 'gut-health'],
    suitableCategories: ['Normal', 'Overweight', 'Obese'],
    image: 'assets/recipes/Weight_Loss/Greek Yogurt Berry Bowl/image_01.jpeg',
    imageUrls: ['assets/recipes/Weight_Loss/Greek Yogurt Berry Bowl/image_01.jpeg']
  },
  {
    id: 'seed-nut-08',
    title: 'Soya Chunk & Brown Rice Stir-Fry',
    description: 'Pan-seared protein-dense soya chunks wok-tossed with fiber-rich brown rice, snap peas, carrots, and sesame.',
    mealType: 'Lunch',
    prepTimeMins: 25,
    calories: 410,
    proteinGrams: 32,
    carbsGrams: 48,
    fatsGrams: 9,
    fiberGrams: 8,
    glycemicIndex: 'Low',
    tags: ['plant-power', 'high-protein', 'high-fiber', 'satiety'],
    suitableCategories: ['Overweight', 'Normal', 'Obese'],
    image: 'assets/recipes/Muscle_Building/Soya Chunk Brown Rice/image_01.jpeg',
    imageUrls: ['assets/recipes/Muscle_Building/Soya Chunk Brown Rice/image_01.jpeg']
  }
];
