import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { PDFDocument } from "pdf-lib";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  console.log("START SERVER - process.env.GEMINI_API_KEY:", process.env.GEMINI_API_KEY);
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Use memory storage for the uploaded PDF
  const upload = multer({ storage: multer.memoryStorage() });

  // API POST endpoint to extract voters using SSE (Server-Sent Events)
  app.get("/api/test-key", (req, res) => {
    try {
      const keys = Object.entries(process.env).filter(([k,v]) => typeof v === 'string' && (v.includes('AIza') || k.toLowerCase().includes('gemini') || k.toLowerCase().includes('key')));
      res.json({ keys: keys.map(([k,v]) => `${k}=${v?.substring(0,6)}...`) });
    } catch(e) {
      res.json({ error: String(e) });
    }
  });

  app.get("/api/test-models", async (req, res) => {
    try {
      let apiKey = process.env.GEMINI_API_KEY;
      const customMatch = Object.entries(process.env).find(([k,v]) => typeof v === 'string' && v.startsWith('AIza') && k !== 'GEMINI_API_KEY' && !k.includes('FIREBASE'));
      if (customMatch) {
        apiKey = customMatch[1];
      } else if (!apiKey || apiKey.includes('MY_G')) {
        const match = Object.entries(process.env).find(([k,v]) => typeof v === 'string' && v.startsWith('AIza'));
        if (match) apiKey = match[1];
      }
      
      if (!apiKey) throw new Error("Missing Gemini API Key");
      const cleanKey = apiKey.replace(/['"]/g, '').trim();
      const ai = new GoogleGenAI({ apiKey: cleanKey });
      
      const models = [];
      const response = await ai.models.list();
      for await (const model of response) {
        if (model.name.includes("flash")) models.push(model.name);
      }
      res.json({ models });
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/extract-voters", upload.single("pdf"), async (req, res) => {
    // Required headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      // Optional: flush chunk
      if ((res as any).flush) {
        (res as any).flush();
      }
    };

    const keepAliveInterval = setInterval(() => {
      sendEvent("ping", { _timestamp: Date.now() });
    }, 15000);

    try {
      if (!req.file) {
        throw new Error("No file uploaded");
      }

      sendEvent("progress", { status: "Parsing PDF...", percent: 5 });

      const pdfDoc = await PDFDocument.load(req.file.buffer);
      const totalPages = pdfDoc.getPageCount();
      const PAGES_PER_BATCH = 20;

      let allVoters: any[] = [];
      const totalBatches = Math.ceil(totalPages / PAGES_PER_BATCH);
      let apiKey = process.env.GEMINI_API_KEY;
      const customMatch = Object.entries(process.env).find(([k,v]) => typeof v === 'string' && v.startsWith('AIza') && k !== 'GEMINI_API_KEY' && !k.includes('FIREBASE'));
      if (customMatch) {
        apiKey = customMatch[1];
      } else if (!apiKey || apiKey.includes('MY_G')) {
        const match = Object.entries(process.env).find(([k,v]) => typeof v === 'string' && v.startsWith('AIza'));
        if (match) apiKey = match[1];
      }
      
      if (!apiKey) {
        throw new Error("Missing Gemini API Key. Please add it to your environment variables.");
      }
      
      const cleanKey = apiKey.replace(/['"]/g, '').trim();
      console.log("USING API KEY (len):", cleanKey.length, "starts:", cleanKey.substring(0, 4), "ends:", cleanKey.substring(cleanKey.length - 2));
      const ai = new GoogleGenAI({ apiKey: cleanKey });

      for (let i = 0; i < totalBatches; i++) {
        if (i > 0) {
           await new Promise(resolve => setTimeout(resolve, 4500));
        }
        sendEvent("progress", {
          status: `Analyzing pages ${i * PAGES_PER_BATCH + 1} to ${Math.min(
            (i + 1) * PAGES_PER_BATCH,
            totalPages
          )} via AI (Batch ${i + 1}/${totalBatches})...`,
          percent: 5 + Math.round((i / totalBatches) * 65), // Progress up to 70%
        });

        // Create a sub-document with the pages for this batch
        const subDocument = await PDFDocument.create();
        const startPage = i * PAGES_PER_BATCH;
        const endPage = Math.min(startPage + PAGES_PER_BATCH, totalPages);
        const pageIndices = Array.from(
          { length: endPage - startPage },
          (_, k) => startPage + k
        );
        const copiedPages = await subDocument.copyPages(pdfDoc, pageIndices);

        for (const page of copiedPages) {
          subDocument.addPage(page);
        }

        const subPdfBase64 = await subDocument.saveAsBase64();

        let response;
        let retries = 3;
        let delay = 4000;
        let lastError = null;

        while (retries > 0) {
          try {
            response = await ai.models.generateContent({
              model: "gemini-2.5-flash-lite",
              contents: [
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: subPdfBase64,
                  },
                },
                "Parse this PDF and extract a list of voters. Return them as a JSON array EXACTLY matching the provided schema. If there's no Voter ID in the text, DO NOT generate a random ID, but rather leave the voterId field empty. Extract their full name, phone number, address, and polling station (if available).",
              ],
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      fullName: { type: Type.STRING },
                      voterId: { type: Type.STRING },
                      phone: {
                        type: Type.STRING,
                        description: "If none, use empty string",
                      },
                      address: {
                        type: Type.STRING,
                        description: "If none, use empty string",
                      },
                      pollingStation: {
                        type: Type.STRING,
                        description: "If none, use empty string",
                      },
                    },
                    required: ["fullName", "voterId"],
                  },
                },
              },
            });
            break;
          } catch (err: any) {
            lastError = err;
            if (err.message && (err.message.includes('503') || err.message.includes('HIGH DEMAND') || err.message.includes('High demand') || err.message.includes('high demand'))) {
              retries--;
              if (retries === 0) break;
              console.warn(`Model under high demand, retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 2;
            } else {
              throw err;
            }
          }
        }

        if (!response) {
          throw lastError || new Error("Failed to generate content after retries due to high demand.");
        }

        const votersText = response.text || "[]";
        try {
          const batchVoters = JSON.parse(votersText);
          if (Array.isArray(batchVoters)) {
            allVoters = allVoters.concat(batchVoters);
          }
        } catch (e) {
          console.warn("Failed to parse batch JSON", e);
        }
      }

      if (allVoters.length === 0) {
        throw new Error("No voters were found in the PDF.");
      }

      sendEvent("complete", { voters: allVoters });
      res.end();
    } catch (error: any) {
      console.error("Server API Error:", error);
      let errorMessage = "An error occurred during extraction";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (typeof error === 'object') {
        try {
          errorMessage = JSON.stringify(error);
        } catch {
          errorMessage = "Unknown object error";
        }
      }
      
      let finalMessage = errorMessage;
      if (errorMessage.includes("HIGH DEMAND") || errorMessage.includes("503") || errorMessage.includes("CURRENTLY EXPERIENCING HIGH DEMAND")) {
         finalMessage = "Error: The AI model is currently experiencing high demand. Please try again in a few minutes.";
      } else if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota") || errorMessage.includes("depleted")) {
         finalMessage = "Error: API quota exceeded or credits depleted. Please provide your own valid Gemini API Key in the AI Studio Settings (gear icon) to continue using AI features.";
      } else if (errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("API key not valid")) {
         finalMessage = "Error: Your Gemini API Key is invalid. Ensure you have pasted a real key without any extra quotes or spaces. Generate a new key from https://aistudio.google.com/app/apikey if this persists.";
      }

      sendEvent("error", {
        message: finalMessage,
      });
      res.end();
    } finally {
      clearInterval(keepAliveInterval);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve built static files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
