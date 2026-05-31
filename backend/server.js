import dotenv from "dotenv";
import mongoose from "mongoose";
import app from "./app.js";

dotenv.config(); // must be first
const PORT = process.env.PORT || 5000;

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (mongoUri) {
  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log("MongoDB connected");
    })
    .catch((error) => {
      console.error("MongoDB connection failed:", error);
    });
} else {
  console.warn("MONGO_URI is not configured; auth routes will fail until it is set.");
}

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY?.slice(0, 15) + "...");
console.log("OPENROUTER_API_KEY:", process.env.OPENROUTER_API_KEY?.slice(0, 10) + "...");

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});