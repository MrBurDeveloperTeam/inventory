import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedItem } from "../types";

// Initialize Gemini Client
// Using process.env.API_KEY as strictly required by guidelines.
if (!process.env.API_KEY) {
  throw new Error("Missing Gemini API Key. Please checked VITE_GEMINI_API_KEY in .env.local");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const modelId = "gemini-3-flash-preview";

export const extractDataFromImage = async (base64Image: string, mimeType: string): Promise<ExtractedItem[]> => {
  try {
    const prompt = `
      Analyze this image (invoice, receipt, or inventory list). 
      Extract the following fields for each line item found:
      - BRAND: The brand name of the product.
      - PRODUCT: The name or description of the product.
      - SKU: The SKU, UPC, or unique code.
      - QUANTITY: The numeric quantity.
      - UOM: Unit of measure (e.g., box, pcs, kg, ea, pack).
      - PRICE: Unit price.
      - TOTAL: Total price for this line item.
      - VENDOR: The name of the vendor/supplier issuing this document.
      - CATEGORY: Categorize the item (e.g., Consumables, Equipment, Service, Office Supplies). Default to 'Consumables' if unsure.
      - EXPIRES: Expiry date if visible (YYYY-MM-DD), otherwise empty.

      If a field is not explicitly present, try to infer it from context or leave it as an empty string (or 0 for numbers).
      For VENDOR, if it appears at the top of the document, apply it to all items.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              brand: { type: Type.STRING },
              product: { type: Type.STRING },
              sku: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              uom: { type: Type.STRING },
              price: { type: Type.NUMBER },
              total: { type: Type.NUMBER },
              vendor: { type: Type.STRING },
              category: { type: Type.STRING },
              expiryDate: { type: Type.STRING },
            },
            required: ["product"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No data returned from API");
    }

    // Parse the JSON response
    const rawData = JSON.parse(text);

    // Add IDs to items
    const data: ExtractedItem[] = rawData.map((item: any) => ({
      ...item,
      id: crypto.randomUUID(),
      category: item.category || 'Consumables',
      expiryDate: item.expiryDate || '',
      uom: item.uom || 'ea'
    }));

    return data;

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};
