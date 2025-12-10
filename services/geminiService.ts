import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY; 
  // NOTE: In a real Electron app, you might want to allow users to input their own key 
  // or proxy this through a secure backend to protect the key. 
  // For this demo, we assume the environment variable is injected during build or dev.
  if (!apiKey) {
    console.warn("No API_KEY found for Gemini.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateShellCommand = async (prompt: string, osInfo: string = "Linux"): Promise<string> => {
  const ai = getClient();
  if (!ai) return "Echo 'API Key missing for AI assistant'";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are an expert Linux/Unix system administrator. 
      Generate a single, correct shell command for the following request: "${prompt}".
      The target system is likely: ${osInfo}.
      Return ONLY the command, no markdown formatting, no explanations.`,
    });
    
    return response.text.trim();
  } catch (error) {
    console.error("Gemini Error:", error);
    return "# Error generating command";
  }
};
