import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not found in .env");
    return;
  }
  console.log("Current Key Substring:", apiKey.substring(0, 8) + "..." + apiKey.substring(apiKey.length - 4));

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log("Listing available models...");
    // The listModels method might not exist in all versions, let's check
    // If it fails, we'll try a known model.
    // @ts-ignore
    if (typeof genAI.listModels === 'function') {
      // @ts-ignore
      const models = await genAI.listModels();
      console.log("Models:", JSON.stringify(models, null, 2));
    }

    console.log("Testing gemini-1.5-flash...");
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const result = await model.generateContent("Hi");
    console.log("Gemini 1.5 Flash Response:", result.response.text());
  } catch (error: any) {
    console.error("Gemini 1.5 Flash Failed:", error.message);
    
    try {
      console.log("Testing gemini-pro...");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-pro" }, { apiVersion: "v1" });
      const result = await model.generateContent("Hi");
      console.log("Gemini Pro Response:", result.response.text());
    } catch (err: any) {
      console.error("Gemini Pro Failed:", err.message);
    }
  }
}

listModels();
