# Date Format Standardization

## Objective
Standardize all date displays across the application to the **dd/mm/yyyy** format to ensure consistency and readability.

## Changes Implemented

### 1. Molar AI Instructions (`services/geminiService.ts`)
- Updated the system prompt to explicitly instruct Molar AI to use the **dd/mm/yyyy** format (e.g., 25/12/2025) in all its responses.

### 2. Master Inventory (`MasterInventory.tsx`)
- Updated the `formatDate` helper function to use `toLocaleDateString('en-GB')`.
- Replaced direct `toLocaleDateString()` calls with `toLocaleDateString('en-GB')` in both the main table view and the mobile card view.
- **Purchase History**: Updated the 'Expires' column in the 'Full Purchase Records' table to use **dd/mm/yyyy** format.
- **Expiration Watchlist**: Updated card expiry date display.
- **Activity Log**: Updated timestamp footer.

### 3. Room Details (`RoomModal.tsx`)
- Updated item expiry dates and batch expiry dates to use **dd/mm/yyyy** in:
  - Desktop table rows.
  - Mobile card headers and details.
  - Mobile batch expansion rows.
- Updated the **Activity Log** timestamps to use `dd/mm/yyyy` for the date portion.

### 4. Admin Dashboard (`AdminDashboard/`)
- **Inventory Section (`InventorySection.tsx`)**:
  - Updated expiry dates in the main inventory table and expiration watchlist.
  - Updated the `formatFullDateWithTime` helper used in Purchase History.
- **Overview (`index.tsx`)**:
  - Updated the global history table date column.
  - Updated user `lastActive` date calculation.
- **User Management (`UserManagement.tsx`)**:
  - Ensure `lastActive` updates (on suspend/add/edit) use the `en-GB` locale.

## Notes
- **Analytics Charts**: Date formats in charts (e.g., "Jan 2026") were preserved as "Month Year" is more appropriate for aggregated monthly data.
- **Locale**: The `en-GB` locale is used as the standard for `dd/mm/yyyy` formatting.

## Verification
- Check the **Master Inventory** table expiry columns.
- Open a **Room** and check item/batch details and the Activity Log.
- Check the **Admin Dashboard** Purchase History and User Management list.
- Ask **Molar AI** a question involving dates (e.g., "When does the Amoxicillin expire?") to verify its response format.
