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
    required: true,
    validate: {
      validator: (array) => array.length > 0,
      message: 'Ingredients cannot be empty',
    },
  }],
  instructions: {
    type: String,
    required: true
  },
  servings: {
    type: Number,
    default: 1 
  },
  nutrition: {
    type: {
      calories: Number,
      protein: Number,
      carbs: Number,
      fats: Number,
    },
    default: undefined
  },
  tags: {
    type: [String],
    default: []
  },
  favourite: {
    type: Boolean,
    default: false
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