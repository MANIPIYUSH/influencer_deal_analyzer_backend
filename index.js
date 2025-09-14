import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { benchmarks } from "./benchmark";

dotenv.config();
console.log("API Key starts with:", process.env.OPENAI_API_KEY?.slice(0, 10));

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY not set in .env");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// POST /analyze
app.post("/analyze", async (req, res) => {
  try {
    let { platform, followers, engagementRate, offerAmount } = req.body;

    if (!platform || !benchmarks[platform]) {
      return res.status(400).json({ error: "Invalid or missing platform. Use instagram|youtube|tiktok" });
    }

    followers = Number(followers) || 0;
    engagementRate = Number(engagementRate) || 0;
    offerAmount = Number(offerAmount) || 0;

    const { low, high } = benchmarks[platform].cpm;
    const expectedLow = (followers / 1000) * low;
    const expectedHigh = (followers / 1000) * high;

    const verdict = offerAmount < expectedLow ? "Undervalued" : offerAmount > expectedHigh ? "Overvalued" : "Fair";

    // Prompt construction
    const prompt = `You are an expert influencer deal negotiator. Platform: ${platform}.
Followers: ${followers}, engagement rate: ${engagementRate}%.
Brand offered: $${offerAmount}.
Industry estimated range (CPM-based): $${expectedLow.toFixed(2)} - $${expectedHigh.toFixed(2)}.
Give a short (1–3 sentences) negotiation tip and a suggested counter-offer range (USD). Keep it actionable and concise.`;

    // Call OpenAI (best-effort; fallback to message if API fails)
let suggestion = `Based on ${followers} followers and ${engagementRate}% engagement, a fair counter-offer is $${Math.round(offerAmount * 2)}.`;
    try {
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You provide concise negotiation advice for influencer deals." },
          { role: "user", content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.2
      });
      suggestion = aiResponse.choices?.[0]?.message?.content?.trim() ?? suggestion;
    } catch (aiErr) {
      console.error("OpenAI error:", aiErr?.message || aiErr);
      // keep suggestion fallback
    }

    return res.json({
      platform,
      followers,
      engagementRate,
      offerAmount,
      expectedRange: [Number(expectedLow.toFixed(2)), Number(expectedHigh.toFixed(2))],
      verdict,
      suggestion
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
