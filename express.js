import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import mongoose from "mongoose";
import Recipe from "./models/recipe.js";
import dotenv from 'dotenv';
import { clerkMiddleware, requireAuth } from "@clerk/express";
import axios from 'axios';

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(clerkMiddleware({ secretKey: process.env.CLERK_SECRET_KEY })); // Clerk middleware

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Initialize Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function getGroqChatCompletion(userMessage) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: userMessage }],
      model: "deepseek-r1-distill-llama-70b"
    });
    return chatCompletion.choices[0]?.message?.content || "No response generated";
  } catch (error) {
    console.error("Error fetching Groq completion:", error);
    throw new Error("Failed to generate response");
  }
}

function extractJsonFromResponse(response) {
  const startIndex = response.indexOf('[');
  const endIndex = response.lastIndexOf(']') + 1;
  if (startIndex !== -1 && endIndex !== -1) {
    return response.slice(startIndex, endIndex);
  } else {
    throw new Error("No JSON array found in the response");
  }
}

// Function to fetch nutritional data from Spoonacular
const getNutritionalData = async (recipe) => {
  try {
    const response = await axios.post(
      "https://api.spoonacular.com/recipes/analyze",
      {
        title: recipe.title,
        servings: recipe.servings || 1,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.SPOONACULAR_API_KEY,
        },
      }
    );

    // Log the full API response
    console.log("Spoonacular API response:", response.data);

    // Check if nutrition data exists
    if (!response.data.nutrition) {
      console.error("Nutrition data is missing in the response");
      return null;
    }

    const nutrients = response.data.nutrition.nutrients;
    return {
      calories: nutrients.find((n) => n.name === "Calories")?.amount || 0,
      protein: nutrients.find((n) => n.name === "Protein")?.amount || 0,
      carbs: nutrients.find((n) => n.name === "Carbohydrates")?.amount || 0,
      fats: nutrients.find((n) => n.name === "Fat")?.amount || 0,
    };
  } catch (error) {
    // Log detailed error info
    console.error("Error fetching nutritional data:", error.response ? error.response.data : error.message);
    return null;
  }
};

// GET endpoint for testing
app.get("/", (req, res) => {
  res.json("hello aneroodh");
});

// POST endpoint to generate and save recipes
app.post("/generate-recipes", async (req, res) => {
  try {
    const { ingredients, preferences } = req.body;

    if (!Array.isArray(ingredients) || !ingredients.every(i => typeof i === "string")) {
      return res.status(400).json({ error: "Ingredients must be an array of strings" });
    }
    if (!Array.isArray(preferences) || !preferences.every(p => typeof p === "string")) {
      return res.status(400).json({ error: "Preferences must be an array of strings" });
    }

    let prompt = "Generate recipe suggestions with detailed instructions";
    if (ingredients.length > 0) prompt += ` using the following ingredients: ${ingredients.join(", ")}`;
    if (preferences.length > 0) prompt += `. The recipes should be ${preferences.join(" and ")}`;
    prompt += `. Return only a JSON array of objects, each containing 'title' (string), 'description' (string), 
    'ingredients and their quantity per one serving' (array of strings), and 'instructions' (string). Do not include any additional text.`;

    const response = await getGroqChatCompletion(prompt);
    const jsonString = extractJsonFromResponse(response);
    const recipes = JSON.parse(jsonString);

    if (!Array.isArray(recipes)) throw new Error("Response is not an array");

    res.json({ recipes});
  } catch (error) {
    console.error("Error in /generate-recipes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST endpoint to save a recipe
app.post("/save-recipe", requireAuth(), async (req, res) => {
    try {
      const { title, description, ingredients, instructions } = req.body;
      const userId = req.auth.userId;
  
      if (!title || !description || !Array.isArray(ingredients) || !instructions) {
        return res.status(400).json({ error: "Missing required fields" });
      }
  
      const recipe = new Recipe({
        title,
        description,
        ingredients,
        instructions,
        userId,
      });
  
      await recipe.save();
      res.status(201).json({ message: "Recipe saved", recipe });
    } catch (error) {
      console.error("Error saving recipe:", error);
      res.status(500).json({ error: "Failed to save recipe" });
    }
  });


// GET endpoint to fetch user-specific recipes
app.get("/saved-recipes", requireAuth(), async (req, res) => {
    try {
      const userId = req.auth.userId;
      const recipes = await Recipe.find({ userId });
      res.json({ recipes });
    } catch (error) {
      console.error("Error fetching recipes:", error);
      res.status(500).json({ error: "Failed to fetch recipes" });
    }
  });

  app.delete("/saved-recipes/:id", requireAuth(), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.auth.userId;
      const recipe = await Recipe.findOneAndDelete({ _id: id, userId });
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      res.json({ message: "Recipe deleted" });
    } catch (error) {
      console.error("Error deleting recipe:", error);
      res.status(500).json({ error: "Failed to delete recipe" });
    }
  });

  // New endpoint to get or fetch nutritional info
  app.get("/get-nutrition/:recipeId", requireAuth(), async (req, res) => {
    try {
      const { recipeId } = req.params;
      const userId = req.auth.userId;
  
      // Fetch the recipe from MongoDB
      const recipe = await Recipe.findOne({ _id: recipeId, userId });
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found" });
      }
  
      // Log the nutrition value for debugging
      console.log('Recipe nutrition:', recipe.nutrition);
  
      // Check if nutrition exists and has non-zero values
      if (
        recipe.nutrition &&
        Object.keys(recipe.nutrition).length > 0 &&
        Object.values(recipe.nutrition).some(val => val > 0)
      ) {
        console.log('Returning existing nutrition:', recipe.nutrition);
        return res.json({ recipe });
      }
  
      // If nutrition is missing or empty, fetch new data
      console.log('Fetching new nutrition data');
      const nutrition = await getNutritionalData(recipe); // Assume this function fetches data from an API
      if (!nutrition) {
        return res.status(500).json({ error: "Failed to fetch nutritional data" });
      }
  
      // Update the recipe with new nutrition data
      recipe.nutrition = nutrition;
      await recipe.save();
  
      console.log('Nutrition saved:', nutrition);
      res.json({ recipe });
    } catch (error) {
      console.error("Error in /get-nutrition:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

// Start the server
app.listen(5000, () => console.log("Server ready on port 5000."));