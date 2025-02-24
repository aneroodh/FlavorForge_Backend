import express from "express";
import cors from "cors";
import getDb from "./db.js";
import { ObjectId } from "mongodb";
import Groq from "groq-sdk";

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Initialize Groq with your API key (stored in environment variables)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Function to get Groq chat completion
async function getGroqChatCompletion(userMessage) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
      model: "deepseek-r1-distill-llama-70b", // Verify this model is supported by Groq
    });
    return chatCompletion.choices[0]?.message?.content || "No response generated";
  } catch (error) {
    console.error("Error fetching Groq completion:", error);
    throw new Error("Failed to generate response");
  }
}

// Function to extract JSON from the response
function extractJsonFromResponse(response) {
    const startIndex = response.indexOf('['); // Find the start of the JSON array
    const endIndex = response.lastIndexOf(']') + 1; // Find the end of the JSON array
  
    if (startIndex !== -1 && endIndex !== -1) {
      return response.slice(startIndex, endIndex); // Extract the JSON string
    } else {
      throw new Error("No JSON array found in the response");
    }
  }

// Existing GET endpoint
app.get("/", (req, res) => {
  res.json("hello aneroodh");
});

// New POST endpoint to generate recipes
app.post("/generate-recipes", async (req, res) => {
  try {
    // Extract ingredients and preferences from the request body
    const { ingredients, preferences } = req.body;

    console.log(ingredients);

    // Validate that ingredients and preferences are arrays of strings
    if (!Array.isArray(ingredients) || !ingredients.every((i) => typeof i === "string")) {
      return res.status(400).json({ error: "Ingredients must be an array of strings" });
    }
    if (!Array.isArray(preferences) || !preferences.every((p) => typeof p === "string")) {
      return res.status(400).json({ error: "Preferences must be an array of strings" });
    }

    // Construct the prompt for the AI model
    let prompt = "Generate recipe suggestions";
    if (ingredients.length > 0) {
      prompt += ` using the following ingredients: ${ingredients.join(", ")}`;
    }
    if (preferences.length > 0) {
      prompt += `. The recipes should be ${preferences.join(" and ")}`;
    }
    prompt += `. Return only a JSON array of objects, each containing 'title' (string), 'description' (string), 'ingredients' (array of strings), and 'instructions' (string). Do not include any additional text.`;

    // Get the AI-generated response
    const response = await getGroqChatCompletion(prompt);

    // Extract the JSON part
    const jsonString = extractJsonFromResponse(response);

    // Attempt to parse the response as JSON
    try {
      const recipes = JSON.parse(jsonString);
      if (!Array.isArray(recipes)) {
        throw new Error("Response is not an array");
      }
      // Send the parsed recipes back to the frontend
      res.json({ recipes });
    } catch (parseError) {
      console.error("Failed to parse response as JSON:", response);
      res.status(500).json({ error: "Failed to parse AI response" });
    }
  } catch (error) {
    console.error("Error in /generate-recipes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
app.listen(5000, () => console.log("Server ready on port 5000."));