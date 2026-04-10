import { GoogleGenAI, Type } from "@google/genai";
import { Project } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateProject(prompt: string, userId: string): Promise<Project> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Act as a hardware project architect. Based on the following prompt, generate a complete hardware project specification for the South African market.
      Use ZAR (Rands) for pricing. Assume common local suppliers like Micro Robotics, Communica, or DIYElectronics.
      
      Prompt: ${prompt}
      
      The response must be a valid JSON object matching the Project interface.
      Keep the description and instructions concise to avoid truncation.
      Include:
      1. A list of components with realistic ZAR prices.
      2. A wiring diagram structure (nodes and edges) for ReactFlow.
      3. Step-by-step assembly instructions in Markdown.
      4. A catchy name and detailed description.`,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 2048, // Limit output to prevent truncation issues
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            components: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  estimatedPriceZAR: { type: Type.NUMBER },
                  category: { type: Type.STRING, enum: ['MCU', 'Sensor', 'Actuator', 'Power', 'Module', 'Display', 'Mechanical', 'Other'] },
                  supplier: { type: Type.STRING },
                  datasheetUrl: { type: Type.STRING }
                },
                required: ['id', 'name', 'description', 'quantity', 'estimatedPriceZAR', 'category']
              }
            },
            wiring: {
              type: Type.OBJECT,
              properties: {
                nodes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      data: {
                        type: Type.OBJECT,
                        properties: {
                          label: { type: Type.STRING },
                          componentId: { type: Type.STRING }
                        }
                      },
                      position: {
                        type: Type.OBJECT,
                        properties: {
                          x: { type: Type.NUMBER },
                          y: { type: Type.NUMBER }
                        }
                      }
                    }
                  }
                },
                edges: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      source: { type: Type.STRING },
                      target: { type: Type.STRING },
                      label: { type: Type.STRING },
                      animated: { type: Type.BOOLEAN }
                    }
                  }
                }
              }
            },
            instructions: { type: Type.STRING }
          },
          required: ['name', 'description', 'components', 'wiring', 'instructions']
        }
      }
    });

    let text = response.text;
    if (!text) throw new Error("No response from AI");

    // Basic check for truncation
    if (text.endsWith('...') || !text.trim().endsWith('}')) {
      console.warn("AI response might be truncated");
    }

    let projectData;
    try {
      projectData = JSON.parse(text);
    } catch (parseError) {
      console.error("JSON Parse Error. Raw text snippet:", text.slice(-100));
      throw new Error("The AI generated an invalid response. Please try a more specific prompt or try again.");
    }
    
    const totalCostZAR = projectData.components.reduce((sum: number, c: any) => sum + (c.estimatedPriceZAR * c.quantity), 0);

    return {
      ...projectData,
      id: crypto.randomUUID(),
      userId,
      prompt,
      createdAt: Date.now(),
      totalCostZAR
    };
  } catch (error) {
    console.error("Project generation error:", error);
    throw error;
  }
}
