import mongoose from 'mongoose';

// Define the Recipe schema
const recipeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  ingredients: [{
    type: String,
    required: true
  }],
  instructions: {
    type: String,
    required: true
  },
  userId: {
     type: String,
     required: true 
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create the Recipe model
const Recipe = mongoose.model('Recipe', recipeSchema);

export default Recipe;