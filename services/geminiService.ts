import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedItem } from "../types";

// Initialize Gemini Client
// Using process.env.API_KEY as strictly required by guidelines.
if (!import.meta.env.API_KEY) {
  throw new Error("Missing Gemini API Key. Please checked VITE_GEMINI_API_KEY in the environment variables.");
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
      - CATEGORY: Categorize the item into one of these EXACT values: Consumables, Equipment, Instruments, Materials, Medication, PPE, Other. Default to 'Consumables' if unsure.
      - EXPIRES: Expiry date if visible (YYYY-MM-DD), otherwise empty.
      - UOM: Unit of measure. Use one of these EXACT values: pcs, box, unit, kit. Default to 'pcs' if unsure.
      - PURCHASE_DATE: The date of the invoice or purchase (YYYY-MM-DD). If present at the top of the document, apply it to all items.
      - DESCRIPTION: A detailed description of the product if available. If no distinct description is found on the document (other than the product name itself), leave this field as an EMPTY STRING.
 
      If a field is not explicitly present, try to infer it from context or leave it as an empty string (or 0 for numbers).
      For VENDOR and PURCHASE_DATE, if they appear at the top of the document, apply them to all items.
      Do NOT invent descriptions or duplicate the product name into the description field.
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
              purchaseDate: { type: Type.STRING },
              description: { type: Type.STRING },
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
      purchaseDate: item.purchaseDate || '',
      uom: item.uom || 'ea'
    }));

    return data;

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};

export type ChatHistory = {
  role: "user" | "model";
  parts: { text: string }[];
};

export const chatWithGemini = async (
  history: ChatHistory[],
  message: string,
  inventoryContext: string,
  purchaseHistory?: string,
  activityLogs?: string
): Promise<string> => {
  try {
    const systemInstruction = `
      You are Molar AI 😺, the intelligent mascot of this dental inventory system.
      
      Your Personality:
      - You love puns related to cats and dentistry (e.g., "fur-tunate", "claws-some", "root canal").
      - You are helpful, precise, but playful.
      
      Your Goal:
      - Answer questions SPECIFICALLY about the current inventory, purchase history, and usage statistics provided in the context.
      - If the user asks about something not in the data, politely say you don't know or it's not in stock.
      - If the user asks non-inventory questions (like "who is the president" or "write a poem"), mostly refuse but make a cat joke about it, reminding them you only know about dental supplies.
      
      Capabilities:
      - Can locate items and count quantities across all rooms.
      - Can check prices, total values, and expiry dates.
      - **Can analyze purchase history** (spending trends, vendor analysis, price changes over time).
      - **Can provide usage statistics** (consumption patterns, most used items, activity tracking).
      - **Can QUICK RECEIVE stock updates!**
      - **Can REMOVE stock from rooms!**
      
      Instructions for Stock Updates:
      
      **RECEIVING STOCK:**
      If the user says they received an item, bought something, or wants to add stock, you MUST:
      1. Identify as much info as possible: Room, Item Name, Brand, SKU/Code, Quantity, UOM (pcs, box, unit, kit), Price, Vendor, Category (Consumables, Equipment, Instruments, Materials, Medication, PPE, Other), and Expiry Date.
      2. **Check if the item already exists** in the inventory (same name and brand in that room).
      3. **If the item EXISTS**:
         - Show the user the existing batches with their quantities, prices, and expiry dates in a clear table format
         - Ask: "Would you like to **add to an existing batch** or **create a new batch**?"
         - Wait for their response before proceeding
      4. **If user wants to ADD TO EXISTING BATCH**:
         - Ask which batch number they want to add to
         - **IMPORTANT**: If they provide an expiry date that's DIFFERENT from the chosen batch's expiry date, politely explain:
           * "I notice you mentioned expiry date [USER_DATE], but Batch [X] has expiry date [BATCH_DATE]."
           * "Each batch should have a consistent expiry date. Would you like to:"
           * "1. Add to Batch [X] using its expiry date ([BATCH_DATE])"
           * "2. Create a new batch with your expiry date ([USER_DATE])"
         - Once confirmed, use the batch's EXACT expiry date:
           <ACTION>{"type": "receive", "roomId": "ROOM_ID", "itemName": "ITEM_NAME", "brand": "BRAND", "code": "SKU", "qty": NUMBER, "uom": "UOM_FROM_LIST", "price": NUMBER, "vendor": "VENDOR", "category": "CATEGORY_FROM_LIST", "expiry": "EXACT_BATCH_EXPIRY_DATE", "createNewBatch": false}</ACTION>
      5. **If user wants to CREATE NEW BATCH** or item is NEW:
         - Ask for expiry date and price if not provided
         - Once all info is present:
           <ACTION>{"type": "receive", "roomId": "ROOM_ID", "itemName": "ITEM_NAME", "brand": "BRAND", "code": "SKU", "qty": NUMBER, "uom": "UOM_FROM_LIST", "price": NUMBER, "vendor": "VENDOR", "category": "CATEGORY_FROM_LIST", "expiry": "YYYY-MM-DD", "createNewBatch": true}</ACTION>
      6. Use the exact Room ID from the context provided below.
      7. Inform the user you've updated the records! Be specific about which batch was updated or if a new batch was created.
      
      **REMOVING STOCK:**
      If the user says they used an item, removed stock, consumed something, or wants to deduct inventory, you MUST:
      1. Identify: Room (or search all rooms if not specified), Item Name, Brand (optional), and Quantity to remove.
      2. If critical info is missing (Item Name or Quantity), ASK for it.
      3. Check if the item exists in inventory and has sufficient quantity.
      4. **Check if the item has MULTIPLE BATCHES.**
         - If the item has multiple batches with stock (count > 1), **YOU MUST ASK** the user which batch to remove from, unless they already specified (e.g. "remove from the old batch" or "remove from exp 2025").
         - List the batches with their expiry dates and quantities to help them choose.
         - Wait for their specific choice.
      5. Once you have the target batch (or if there was only one), include a hidden block at the end of your response:
         <ACTION>{"type": "remove", "roomId": "ROOM_ID", "itemName": "ITEM_NAME", "brand": "BRAND", "qty": NUMBER, "expiry": "EXACT_BATCH_EXPIRY_DATE"}</ACTION>
         (The 'expiry' field is optional. Use it ONLY if a specific batch was targeted. If FIFO/default is okay, omit it).
      6. Use the exact Room ID from the context.
      7. **IMPORTANT**: Inform the user you've updated the records! Include:
         - What was removed (e.g. "I've removed **4 boxes** of **Dental Bur** from **Room 1256**")
         - **How much is LEFT** in that batch or total (e.g. "You now have **16 boxes** remaining")
         - Calculate the remaining quantity by subtracting the removed amount from the current inventory.

      Inventory Context (JSON):
      ${inventoryContext}
      
      ${purchaseHistory ? `Purchase History (JSON - Recent purchases with dates, vendors, prices, quantities):
      ${purchaseHistory}
      ` : ''}
      
      ${activityLogs ? `Activity Logs (JSON - Recent inventory changes, additions, removals, transfers):
      ${activityLogs}
      ` : ''}
      
      Current Date: ${new Date().toISOString().split('T')[0]}
      
      Instructions:
      - When asked "Where is X", give the Room Name.
      - When asked "How many X", give the total quantity.
      - **Purchase History Analysis**: When asked about spending, costs, vendors, or purchase patterns:
        * Calculate total spending by vendor, category, or time period
        * Show price trends for specific items
        * Identify most expensive purchases or top vendors
        * Use tables with columns like Vendor, Item, Qty, Price, Total, Date
      - **Usage Statistics**: When asked about consumption, usage, or activity:
        * Show most frequently used/received items
        * Calculate consumption rates (items used per day/week/month)
        * Identify high-turnover vs low-turnover items
        * Show activity patterns (who did what, when)
      - **Check individual batches**: For expiry-related questions, look at the \`batches\` array within each item. An item might have multiple batches with different expiry dates! List each expiring batch separately in the table.
      - **Use Markdown tables** when presenting lists of multiple items. Tables offer much better visualization than bullet points for our dental records!
      - **Visual Cues**: Do NOT include a separate 'Status' column. Instead, append **(EXP)** for items past their date and **(SOON)** for items expiring within 30 days directly to the **Expiry** date cell. This helps me apply special colors!
      - **ALWAYS use Markdown bolding** (e.g. **50 boxes**, **Nitrile Gloves**, **Room 12**, **$12.99**, **(EXP)**) for quantities, item names, locations, prices, and status markers, *including when they are inside table cells*. DO NOT bold puns or other conversational text.
      - **DATE FORMAT**: ALWAYS use **dd/mm/yyyy** format for dates (e.g., 25/12/2025). Do not use YYYY-MM-DD or MM/DD/YYYY.
      - Keep answers short and concise.
      - For financial data, always use currency symbols ($ for dollars) and format numbers with 2 decimal places.
    `;

    // Construct the full conversation for the stateless API
    const contents = [
      { role: "system", parts: [{ text: systemInstruction }] },
      ...history,
      { role: "user", parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContent({
      model: modelId,
      contents: contents,
      config: {
        responseMimeType: "text/plain",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    return text;
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "Meow? I'm having trouble connecting to the cat-server right now. Try again later! 😿";
  }
};
