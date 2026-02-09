# Molar AI Stock Management Features

## Overview
Molar AI can now both **receive** and **remove** stock from rooms! This feature allows you to use natural language to manage your inventory through the chat interface.

## Features

### 1. Stock Removal
Remove stock from rooms with natural language commands.

### 2. Stock Receipt with Batch Selection ✨ NEW
When receiving stock for items that already exist, Molar AI will ask whether you want to add to an existing batch or create a new one.

## What Changed

### 1. **Gemini Service** (`services/geminiService.ts`)
- Added instructions for Molar AI to handle stock removal requests
- Added interactive batch selection for receiving existing stock
- AI recognizes phrases like "I used...", "remove...", "consumed..." 
- AI asks users about batch preference when receiving existing items
- Generates `<ACTION>` blocks with type "remove" or "receive"

### 2. **App Component** (`App.tsx`)
- Added new `removeStock()` function
- Updated `receiveStock()` to support `createNewBatch` parameter
- When `createNewBatch=true`, forces creation of a new batch
- When `createNewBatch=false` or undefined, merges with existing batch (default behavior)
- Updated chat handler to process both action types

## How to Test

### Stock Removal Examples:

1. **Simple removal:**
   - "I used 10 nitrile gloves"
   - Molar AI will find the item, ask which room if needed, and remove the quantity

2. **Specific room:**
   - "Remove 5 masks from Room 3"
   - Molar AI will remove exactly 5 masks from Room 3

3. **With brand:**
   - "I consumed 20 pieces of Medline gauze"
   - Molar AI will find the specific brand and remove it

### Stock Receipt with Batch Selection Examples:

1. **Receiving existing item:**
   - User: "I received 10 boxes of Dental Bur in Room 1256"
   - Molar AI: Shows existing batches and asks:
     ```
     I found Dental Bur already in Room 1256 with these batches:
     - Batch 1: 6 boxes @ $7.99, expires 1/30/2026
     - Batch 2: 10 boxes @ $12.00, expires 2/26/2026
     - Batch 3: 4 boxes @ $10.00, expires 1/30/2026
     
     Would you like to add to an existing batch or create a new batch?
     ```
   - User: "Create a new batch" or "Add to batch 2"
   - Molar AI: Executes the appropriate action

2. **Receiving new item:**
   - User: "I received 50 masks in Room 5"
   - Molar AI: Proceeds normally (no batch selection needed)

### What Molar AI Does:

**For Stock Removal:**
1. Validates the request (item exists, sufficient quantity)
2. Removes stock using FIFO logic
3. Shows remaining quantity
4. Logs the activity

**For Stock Receipt:**
1. Checks if item already exists in that room
2. If exists: Shows batches and asks user preference
3. If new or user chooses new batch: Creates new batch
4. If user chooses existing batch: Merges with that batch
5. Confirms with summary

## Technical Details

### Action Formats

**Remove:**
```json
<ACTION>{"type": "remove", "roomId": "...", "itemName": "...", "brand": "...", "qty": 10}</ACTION>
```

**Receive (new batch):**
```json
<ACTION>{"type": "receive", "roomId": "...", "itemName": "...", "qty": 10, "price": 12.50, "createNewBatch": true, ...}</ACTION>
```

**Receive (merge with existing):**
```json
<ACTION>{"type": "receive", "roomId": "...", "itemName": "...", "qty": 10, "price": 12.50, "createNewBatch": false, ...}</ACTION>
```

### Batch Logic
- **Remove**: Uses FIFO (oldest batches first)
- **Receive with createNewBatch=true**: Always creates new batch
- **Receive with createNewBatch=false**: Merges with batch that has matching expiry date
- Automatically removes empty batches
- Recalculates totals, averages, and earliest expiry

## Next Steps

Try it out! Open the Molar AI chat and say:
- "I used some gloves"
- "I received 20 boxes of Dental Bur in Room 1256"
- "Remove 10 masks from the storage room"

Molar AI will guide you through the process! 😺
