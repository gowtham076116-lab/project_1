
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.1-flash-lite-image";

if (!API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from .env");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const dataPath = path.join(__dirname, "hivecity-recipes-export.json");
const recipes = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const recipe = recipes.find(r => r.id === "recipe-0001");

if (!recipe) {
    throw new Error("Recipe recipe-0001 was not found.");
}

const ingredients = recipe.ingredients.join("\n- ");
const steps = recipe.steps.join("\n");

const outputDir = path.join(__dirname, "output", recipe.id);
fs.mkdirSync(outputDir, { recursive: true });

const imageTasks = [
    {
        filename: "slot1-finished-dish.png",
        description:
            "A complete, appetizing finished home-cooked dish, neatly plated and viewed at a three-quarter angle."
    },
    {
        filename: "slot2-cooking-process.png",
        description:
            "A realistic home-kitchen cooking scene showing the actual preparation of this recipe, with ingredients and cookware."
    },
    {
        filename: "slot3-food-detail.png",
        description:
            "A close-up food photograph showing the real textures of the cooked ingredients and finished dish."
    }
];

async function generateImage(task) {
    const prompt = `
Create a photorealistic natural home-cooked food photograph.

Recipe: ${recipe.name}

Actual ingredients:
- ${ingredients}

Cooking instructions:
${steps}

Image requirement:
${task.description}

Accuracy rules:
- Show only ingredients listed in the recipe.
- Do not add meat, eggs, dairy, or other unlisted ingredients.
- Match the actual recipe and its preparation instructions.
- Natural window daylight, modest ordinary home kitchen and crockery.
- Realistic homemade portions and textures.
- No text, labels, logos, watermarks, or artificial commercial food styling.
`;

    console.log(`Generating ${task.filename}...`);

    const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
            responseModalities: ["IMAGE"]
        }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(part => part.inlineData?.data);

    if (!imagePart) {
        throw new Error(
            `No image returned for ${task.filename}. Check model access and API response.`
        );
    }

    const buffer = Buffer.from(imagePart.inlineData.data, "base64");
    const outputPath = path.join(outputDir, task.filename);

    fs.writeFileSync(outputPath, buffer);

    console.log(`Saved: ${outputPath}`);
}

async function main() {
    console.log(`Recipe: ${recipe.name}`);
    console.log(`Model: ${MODEL}`);
    console.log("Generating exactly 3 test images...");

    for (const task of imageTasks) {
        await generateImage(task);
    }

    console.log("Test complete. All 3 images were saved locally.");
}

main().catch(error => {
    console.error("Image generation stopped:", error.message);
    process.exitCode = 1;
});
