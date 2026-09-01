// Server-only Gemini boundary for Molar AI (Inventory). This is the
// ONLY place in this project that imports @google/genai, constructs a
// Gemini client, reads the Gemini provider credential, or calls
// generateContent — see services/geminiService.ts, which now only
// forwards requests here via
// supabase.functions.invoke('molar-chat-inventory', ...) (using the
// browser's already-authenticated Supabase session) and never touches
// the SDK/credential itself.
//
// Requires a real authenticated Supabase user for every request — this
// is NOT an anonymous public provider endpoint. Rejects with 401 if the
// caller's bearer token does not resolve to a valid user.
//
// Namespaced as "molar-chat-inventory", matching the established
// per-app naming convention on this shared Supabase project
// (opdotszsldcgwjqtvgul): molar-chat-appointment, molar-chat-todo,
// molar-chat-calculator, molar-chat-app-gallery. Function slugs are
// unique per project — a shared generic name would let one app's
// deploy silently overwrite another's system prompt.
//
// Three request modes, mirroring the three pre-existing client
// functions exactly (prompts/model/schema unchanged, only relocated):
//   - "general": free-form General Chat (chatWithGemini's prior body).
//     Gemini may still emit a legacy <ACTION> block in its raw text —
//     that is unchanged from before this migration and is STILL never
//     dispatched: inventoryMolarAdapter.ts strips any such block and
//     replaces it with an explicit host message
//     (Phase INVENTORY-AI-MUTATION-AUTHORITY-CONTAINMENT-1). This
//     function does not know about or touch that containment; it only
//     relocates the same generateContent call server-side.
//   - "grounded": grounded Data-Chat phrasing over host-selected,
//     already-minimized facts (chatWithGroundedInventoryFacts's prior
//     body). Never queries inventory tables, never decides
//     expired/low-stock/expiring-soon status, never receives full
//     inventory/purchase-history/activity-log context.
//   - "ocr": image/receipt extraction (extractDataFromImage's prior
//     body), same structured responseSchema as before. Returns the raw
//     extracted array; per-item `id` generation stays client-side
//     (geminiService.ts), unchanged.
//
// This function has no path to any Inventory mutation. The real
// AI-assisted-mutation flow (InventoryActionConfirm) is a fully
// separate, deterministic parser over the user's own raw message —
// it never calls Gemini at all, and this migration does not touch it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenAI, Type } from "npm:@google/genai";

const modelId = "gemini-3-flash-preview";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type ChatMessage = { role: string; parts: { text: string }[] };

function isValidHistory(history: unknown): history is ChatMessage[] {
  if (!Array.isArray(history)) return false;
  return history.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      typeof (entry as { role?: unknown }).role === "string" &&
      Array.isArray((entry as { parts?: unknown }).parts) &&
      (entry as { parts: unknown[] }).parts.every(
        (p: unknown) => typeof (p as { text?: unknown })?.text === "string"
      )
  );
}

// Verbatim from the pre-migration client-side geminiService.ts.
const OCR_PROMPT = `
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

// Verbatim from the pre-migration client-side geminiService.ts.
function buildGeneralSystemInstruction(
  inventoryContext: string,
  purchaseHistory: string | undefined,
  activityLogs: string | undefined,
  userContext: string | undefined
): string {
  const isPersonalised = !!userContext && userContext.trim().length > 30;

  return `
      You are SNAI (Snabbb Assistant Intelligent), the advanced AI backbone of the universal Snabbb application ecosystem.

      Your Personality:
      - You are strategic, analytical, and highly efficient.
      - You communicate with clarity and precision, focusing on data accuracy and operational excellence.
      - ${isPersonalised ? 'Address the user by their first name when available.' : ''}
      - You NEVER hallucinate or assume data. If information is missing from the provided context, state it clearly.

      Your Goal:
      - Provide expert guidance across the Snabbb Inventory Management system.
      - Answer questions SPECIFICALLY about the current inventory, purchase history, and usage statistics provided in the context.
      - If requested, assist with stock operations like receiving, removing, or transferring items.
      - For requests outside of the Snabbb ecosystem, politely refocus the conversation on how you can help manage their professional dental operations.

      Capabilities:
      - Can locate items and count quantities across all rooms.
      - Can check prices, total values, and expiry dates.
      - **Can analyze purchase history** (spending trends, vendor analysis, price changes over time).
      - **Can provide usage statistics** (consumption patterns, most used items, activity tracking).
      - **Can QUICK RECEIVE stock updates!**
      - **Can REMOVE stock from rooms!**
      - **Can TRANSFER stock between rooms!**

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

      **TRANSFERRING STOCK:**
      If the user wants to move, transfer, or relocate items between rooms, you MUST:
      1. Identify: Source Room, Destination Room, Item Name, Brand (optional), and Quantity to move.
      2. Check if the item exists in the Source Room and has sufficient quantity.
      3. Once confirmed, include this action:
         <ACTION>{"type": "transfer", "fromRoomId": "FROM_ROOM_ID", "toRoomId": "TO_ROOM_ID", "itemName": "ITEM_NAME", "brand": "BRAND", "qty": NUMBER}</ACTION>
      4. Use the exact Room IDs from the context.
      5. Inform the user you've successfully moved the items! Be specific about the source and destination.

      Inventory Context (JSON):
      ${inventoryContext}

      ${purchaseHistory ? `Purchase History (JSON - Recent purchases with dates, vendors, prices, quantities):
      ${purchaseHistory}
      ` : ''}

      ${activityLogs ? `Activity Logs (JSON - Recent inventory changes, additions, removals, transfers):
      ${activityLogs}
      ` : ''}

      ${isPersonalised ? `--- USER CONTEXT ---
      ${userContext}
      --- END USER CONTEXT ---` : ''}

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
      - **ALWAYS use Markdown bolding** (e.g. **50 boxes**, **Nitrile Gloves**, **Room 12**, **$12.99**, **(EXP)**) for quantities, item names, locations, prices, and status markers, *including when they are inside table cells*. DO NOT bold words unless they are specific data points!
      - **DATE FORMAT**: ALWAYS use **dd/mm/yyyy** format for dates (e.g., 25/12/2025). Do not use YYYY-MM-DD or MM/DD/YYYY.
      - Keep answers short and concise.
      - For financial data, always use currency symbols ($ for dollars) and format numbers with 2 decimal places.
    `;
}

// Verbatim from the pre-migration client-side geminiService.ts.
function buildGroundedSystemInstruction(intent: string, facts: unknown): string {
  return `
    You are answering ONE specific Inventory data question using ONLY the structured facts provided below.

    Approved intent: ${intent}
    Facts (JSON, already computed by deterministic code — do not recompute or second-guess any number):
    ${JSON.stringify(facts)}

    Rules — follow ALL of these exactly:
    - Only state facts present in the JSON above. Do not invent item names, room names, quantities, expiry dates, or reasons.
    - Do not calculate, estimate, or infer any new count, total, or date beyond what is given.
    - Do not infer or suggest purchasing/reordering actions.
    - Do not claim any database change occurred — you cannot make changes, only report data.
    - Do NOT output an <ACTION> block or any similar machine-readable tag under any circumstance.
    - If the JSON's "count" is greater than "shownCount", you MUST clearly say only some matching items are shown (e.g. "Showing 5 of 12").
    - If "count" (or the relevant total) is 0, clearly state that no matching items were found — do not imply otherwise.
    - Be concise — a few sentences at most, plus a short list of the shown items if the facts include one.
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // --- Require a real authenticated Supabase user. Never treat the mere
  // presence of an Authorization header, or the anon key alone, as proof
  // of a real user. ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[molar-chat-inventory] Missing SUPABASE_URL/SUPABASE_ANON_KEY runtime configuration.");
    return json({ ok: false, error: "Server is not configured." }, 500);
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[molar-chat-inventory] Missing server-side GEMINI_API_KEY configuration.");
    return json({ ok: false, error: "AI service is not configured." }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  const { mode } = (body ?? {}) as { mode?: unknown };

  if (mode !== "general" && mode !== "grounded" && mode !== "ocr") {
    return json({ ok: false, error: "Invalid or missing mode." }, 400);
  }

  const ai = new GoogleGenAI({ apiKey });

  if (mode === "general") {
    const { message, history, inventoryContext, purchaseHistory, activityLogs, userContext } = body as {
      message?: unknown;
      history?: unknown;
      inventoryContext?: unknown;
      purchaseHistory?: unknown;
      activityLogs?: unknown;
      userContext?: unknown;
    };

    if (typeof message !== "string" || !message.trim()) {
      return json({ ok: false, error: "Message is required." }, 400);
    }
    if (history !== undefined && !isValidHistory(history)) {
      return json({ ok: false, error: "Invalid history." }, 400);
    }
    if (typeof inventoryContext !== "string") {
      return json({ ok: false, error: "Inventory context is required." }, 400);
    }
    if (purchaseHistory !== undefined && typeof purchaseHistory !== "string") {
      return json({ ok: false, error: "Invalid purchase history." }, 400);
    }
    if (activityLogs !== undefined && typeof activityLogs !== "string") {
      return json({ ok: false, error: "Invalid activity logs." }, 400);
    }
    if (userContext !== undefined && typeof userContext !== "string") {
      return json({ ok: false, error: "Invalid context." }, 400);
    }

    try {
      const systemInstruction = buildGeneralSystemInstruction(
        inventoryContext,
        typeof purchaseHistory === "string" ? purchaseHistory : undefined,
        typeof activityLogs === "string" ? activityLogs : undefined,
        typeof userContext === "string" ? userContext : undefined
      );

      const contents = [
        { role: "system", parts: [{ text: systemInstruction }] },
        ...((history as ChatMessage[] | undefined) ?? []),
        { role: "user", parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
        model: modelId,
        contents,
        config: { responseMimeType: "text/plain" },
      });

      const text = response.text;
      if (!text) {
        return json({ ok: false, error: "No response from AI service." }, 502);
      }

      return json({ ok: true, text });
    } catch (error) {
      console.error("[molar-chat-inventory] General chat provider error:", error);
      return json({ ok: false, error: "AI service request failed." }, 502);
    }
  }

  if (mode === "grounded") {
    const { question, intent, facts } = body as {
      question?: unknown;
      intent?: unknown;
      facts?: unknown;
    };

    if (typeof question !== "string" || !question.trim()) {
      return json({ ok: false, error: "Question is required." }, 400);
    }
    if (typeof intent !== "string" || !intent.trim()) {
      return json({ ok: false, error: "Intent is required." }, 400);
    }
    if (facts === undefined) {
      return json({ ok: false, error: "Facts are required." }, 400);
    }

    try {
      const systemInstruction = buildGroundedSystemInstruction(intent, facts);

      const contents = [
        { role: "system", parts: [{ text: systemInstruction }] },
        { role: "user", parts: [{ text: question }] },
      ];

      const response = await ai.models.generateContent({
        model: modelId,
        contents,
        config: { responseMimeType: "text/plain" },
      });

      const text = response.text;
      if (!text || !text.trim()) {
        return json({ ok: false, error: "Empty response from AI service." }, 502);
      }

      return json({ ok: true, text: text.trim() });
    } catch (error) {
      console.error("[molar-chat-inventory] Grounded chat provider error:", error);
      return json({ ok: false, error: "AI service request failed." }, 502);
    }
  }

  // mode === "ocr"
  const { base64Image, mimeType } = body as { base64Image?: unknown; mimeType?: unknown };

  if (typeof base64Image !== "string" || !base64Image) {
    return json({ ok: false, error: "Image data is required." }, 400);
  }
  if (typeof mimeType !== "string" || !mimeType) {
    return json({ ok: false, error: "Image mime type is required." }, 400);
  }

  try {
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
            text: OCR_PROMPT,
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
      return json({ ok: false, error: "No data returned from AI service." }, 502);
    }

    const items = JSON.parse(text);
    return json({ ok: true, items });
  } catch (error) {
    console.error("[molar-chat-inventory] OCR extraction error:", error);
    return json({ ok: false, error: "AI service request failed." }, 502);
  }
});
