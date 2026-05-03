import { GoogleGenAI } from "@google/genai";
process.env.GEMINI_API_KEY ? console.log("key present") : console.log("no key");
const ai = new GoogleGenAI({});
try {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "hello"
  });
  console.log("Success:", result.text);
} catch(e) {
  console.error("Error:", e.message);
}
