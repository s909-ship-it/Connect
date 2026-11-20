import { GoogleGenAI, ApiError } from "@google/genai";

/* AI-made project images (Gemini). Making images needs a paid Gemini plan: the free tier has no allowance for it,
   so this stays off until GEMINI_IMAGE_MODEL is set (for example gemini-3.1-flash-image). Until then every project
   still gets a cover drawn from its name (lib/identity.ts), and teams can upload their own image. */
export const imageAiOn = () => !!process.env.GEMINI_API_KEY?.trim() && !!process.env.GEMINI_IMAGE_MODEL?.trim();

export function projectPrompt(name: string, pitch: string) {
  const clean = (s: string, n: number) => s.replace(/[\r\n"]+/g, " ").trim().slice(0, n);
  return `A square cover image for a student project called "${clean(name, 60)}": ${clean(pitch, 200)}. `
    + "Flat, modern illustration with one bold central symbol that fits the idea, on a vivid gradient background. "
    + "No text, no letters, no numbers, no words, no logos, no people's faces.";
}

export async function makeImage(prompt: string): Promise<{ bytes: Buffer; mime: string } | { error: string }> {
  if (!imageAiOn()) return { error: "AI images are not switched on for this site. Upload an image instead." };
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim(), httpOptions: { retryOptions: { attempts: 1 } } });
  try {
    const r = await ai.models.generateContent({
      model: process.env.GEMINI_IMAGE_MODEL!.trim(), contents: prompt,
      config: { responseModalities: ["IMAGE"], abortSignal: AbortSignal.timeout(60_000) },
    });
    const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) return { error: "The AI did not make an image this time. Try again." };
    return { bytes: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType ?? "image/png" };
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) return { error: "The site's AI image allowance is used up. Upload an image instead." };
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return { error: "The AI image service refused the request. Upload an image instead." };
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return { error: "The AI took too long. Try again." };
    return { error: "The AI image request failed. Upload an image instead." };
  }
}
