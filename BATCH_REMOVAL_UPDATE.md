# Batch-Specific Stock Removal

## Overview
Added capability for Molar AI to handle stock removal from specific batches when multiple batches exist for an item.

## Changes

### 1. Molar AI Instructions (`services/geminiService.ts`)
- Updated **REMOVING STOCK** instructions.
- Molar AI will now check if an item has multiple batches (count > 1).
- If multiple batches exist, it will **ask the user** to specify which batch to remove from, listing the batches with their expiry dates and quantities.
- The AI will include the target batch's expiry date in the removal action:
  ```json
  {"type": "remove", ..., "expiry": "YYYY-MM-DD"}
  ```

### 2. App Logic (`App.tsx`)
- Updated `removeStock` function to accept an optional `targetExpiry` parameter.
- **Logic**:
  - If `targetExpiry` is provided, the system attempts to find the batch with that exact expiry date.
  - It prioritizes removing stock from that specific batch.
  - If the target batch has insufficient quantity, it will drain that batch and remove the remainder from other batches (FIFO).
  - If no target expiry is provided (or batch not found), it defaults to standard FIFO removal (oldest batches first).
- Updated `handleSendChat` to extract and pass the `expiry` field from Molar AI's response.
- **Fix**: Resolved a syntax error in `App.tsx` where the `removeStock` function call was accidentally malformed.

## Usage
1. User says: "Remove 5 boxes of Dental Bur from Room 1256".
2. If Dental Bur has 2 batches (Exp 2025 and Exp 2026):
   - Molar AI says: "I found multiple batches. Which one would you like to update?
     - Batch 1: Exp 2025-05-20 (10 boxes)
     - Batch 2: Exp 2026-10-10 (50 boxes)"
3. User says: "From the 2026 batch".
4. Molar AI executes removal specifically from the 2026 batch.
