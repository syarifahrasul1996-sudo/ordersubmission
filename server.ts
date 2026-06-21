import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API route for generating letter text
  app.post("/api/generate-letter", async (req, res) => {
    try {
      const { customerDetails, templateContent, documentMode, language } = req.body;
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API key is not configured on the server." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      const prompt = `
You are a professional document generation assistant.

DOCUMENT_MODE: ${documentMode}
LANGUAGE: ${language}

If DOCUMENT_MODE is "agreement":
- Preserve all wording, clauses, numbering, headings, schedules and signature blocks.
- Replace editable information only.
- Do not rewrite legal clauses.

If DOCUMENT_MODE is "letter":
- Use TEMPLATE_CONTENT as a guide, not a strict contract.
- Keep the same purpose and formal structure.
- You may improve wording, flow and grammar.
- If TEMPLATE_CONTENT is empty, generate a suitable formal letter from CUSTOMER_DETAILS.
- If LANGUAGE is English, generate in English.
- If LANGUAGE is Melayu, generate in Bahasa Melayu Malaysia.
- Do not invent facts.

For all documents:
- Use CUSTOMER_DETAILS as the source of truth.
- If data is missing, leave a suitable placeholder.
- Return plain text only.

CUSTOMER_DETAILS:
${JSON.stringify(customerDetails, null, 2)}

TEMPLATE_CONTENT:
${templateContent}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (e: any) {
      console.error("Error generating letter:", e);
      res.status(500).json({ error: e.message });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
