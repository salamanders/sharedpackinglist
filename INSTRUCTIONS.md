# Design Specification: Family Pack-Sync Web App

## 1. Product Vision & Motivating Factors
**Goal:** Build a mobile-first, real-time web application for family packing lists. 

**Why this specific design? (Context for Implementation)**
* **The Template Model:** Families reuse packing lists. Starting from scratch every trip is tedious. We use a base "default" list and append "building blocks" (e.g., "Cold Weather," "Beach") so trips can be assembled modularly.
* **Complex Allocation Logic:** Packing for a family isn't a simple checklist. Items fall into three strict categories:
    * *Standard:* Zero, One, a Few, or All people in the family are expected to individually pack an item.
    * *ALL:* A special "shortcut" flag on an item, indicating that everyone on the trip needs to pack their individual.  Semantically the same as each person being in the target list, but better (because it saves space) and more flexible (because if someone joins the trip late, it will be expected that they pack it as well).  Any item that is assigned to everyone to back should be "upgraded" to instead use the ALL flag. The most common flag. (e.g., Socks)
    * *COMMUNAL:* A special "shortcut" flag on an item, indicating one item for the whole family, packed by whoever gets to it first (e.g., Band-Aids).
* **Democratized Input:** Every authenticated family member must have full read/write access to add, edit, or check off items on both Active Trips and Templates. Packing is a collaborative effort.
* **Strict Privacy:** Family data must be siloed. A tenant-based security model ensures no one outside the specific family group can read or write the data.

## 2. Tech Stack & Architecture
* **Frontend:** React 18+ with Vite (fast, simple client-side architecture).
* **Styling:** TailwindCSS + `shadcn/ui` (for rapid, accessible components like toggles, tabs, and checkboxes).
* **Backend/Database:** Firebase Firestore (NoSQL, real-time document syncing via `onSnapshot`).
* **Authentication:** Firebase Auth (Google Sign-In).
* **State Management:** React Context + local state.
* **Hosting:** Firebase Hosting.

## 3. Authentication & Family Security Model
* **Mechanism:** Users authenticate via Google OAuth.
* **Tenant Creation:** An initial user creates a "Family" group, generating a `familyId` and an invite code.
* **Joining:** Other members log in, submit the invite code, and their `uid` is appended to the `Family` document's `members` array.
* **Data Scoping:** ALL client-side Firestore queries must include `.where("familyId", "==", currentFamilyId)`.  A user shouldn't be able to "mine the database" for other family IDs.

### Firestore Security Rules
Deploy these rules exactly as written to lock down the database.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isFamilyMember(familyId) {
      return isAuthenticated() &&
        request.auth.uid in get(/databases/$(database)/documents/Families/$(familyId)).data.members;
    }

    match /Families/{familyId} {
      allow create: if isAuthenticated() && request.auth.uid in request.resource.data.members;
      allow read, update: if isAuthenticated() && request.auth.uid in resource.data.members;
      allow delete: if false; 
    }

    match /Templates/{templateId} {
      allow create: if isFamilyMember(request.resource.data.familyId);
      allow read, update, delete: if isFamilyMember(resource.data.familyId);
    }

    match /Trips/{tripId} {
      allow create: if isFamilyMember(request.resource.data.familyId);
      allow read, update, delete: if isFamilyMember(resource.data.familyId);
    }
  }
}
```

## 4. Data Model (Firestore Schema)

### Collection: `Templates` (Reusable Building Blocks)
```json
{
  "id": "tpl_coldWeather",
  "familyId": "fam_123",
  "name": "Cold Weather Addition",
  "isDefault": false,
  "items": [
    {
      "id": "item_1",
      "name": "Heavy Coat",
      "allocationType": "ALL" 
    },
    {
      "id": "item_2",
      "name": "Driving Sunglasses",
      "allocationType": "SPECIFIC",
      "defaultAssigneeIds": ["user_mom", "user_dad"]
    },
    {
      "id": "item_3",
      "name": "Snow Tire Chains",
      "allocationType": "COMMUNAL" 
    }
  ]
}
```

### Collection: `Trips` (Active Lists)
Created by merging the `default` template and selected blocks. Any family member can append new ad-hoc items directly to this array after the trip is created. Store items as an array on the document to ensure a single fast read/write.

```json
{
  "id": "trip_tahoe_2026",
  "familyId": "fam_123",
  "name": "Lake Tahoe Ski Trip",
  "status": "ACTIVE",
  "templatesUsed": ["tpl_default", "tpl_coldWeather"],
  "items": [
    {
      "id": "inst_1",
      "name": "Socks",
      "type": "ALL",
      "packStatus": {
        "user_mom": true,
        "user_dad": false,
        "user_kid": false
      }
    },
    {
      "id": "inst_2",
      "name": "Snowboard Boots",
      "type": "SPECIFIC",
      "packStatus": {
         "user_dad": false,
      }
    },
    {
      "id": "inst_3",
      "name": "Toothpaste",
      "type": "COMMUNAL",
      "packStatus": { }
    }
  ]
}
```

## 5. UI/UX Specifications
The interface must be heavily optimized for mobile (thumb-friendly).

* **Dashboard:** Shows active trips. Includes a "Create New Trip" button (opens a modal to name the trip and select templates via multi-select checkboxes) and an "Edit Templates" area.
* **Active Trip View:** The main interaction screen.
    * **Header:** Trip Name, progress bar (e.g., "45% Packed"), and an "Add Item" button (allows any member to add an ad-hoc item to the current trip).
    * **Filter Controls (Sticky):**
        * Toggle 1: `[View All] | [View Remaining]` (Hides fully packed items).
        * Toggle 2: `[Everyone] | [Just Me]` (Filters to show only items where the current user has packing responsibilities).

### Interaction Logic
* **Communal Items:** Single row. Tapping the checkbox updates `packedBy` to the current user's ID. Tapping again sets it to `null`.
* **Specific Items:** Single row with an avatar of the assigned user. Tapping toggles the `isPacked` boolean.
* **Individual Items:** Main row ("Socks") with sub-checkboxes/avatars underneath for each family member. 
    * *Rule:* If viewing as `[Just Me]`, only the current user's sub-checkbox is shown.
    * *Rule:* Tapping a specific user's avatar/checkbox updates `packStatus[targetUserId]` to `true`.

## 6. Technical Implementation Directives
1. **Optimistic UI:** (Low priority) When a user clicks a checkbox, instantly update the local state *before* awaiting the Firestore write confirmation to eliminate perceived latency.
2. **Debounce Rapid Writes:** (Low priority) Implement a debounce utility to prevent spamming Firestore if a user taps a checkbox multiple times rapidly.
3. **Data Merging Logic:** Write a strict utility function for trip creation that takes `Array<Template>` and merges the `items` arrays. It must deduplicate items by name and allocation type (e.g., don't add "Toothpaste (Communal)" twice if two templates contain it).

### 7. Offline Support (Phase 2)
* **Requirement:** The app must work in airplane mode or spotty hotel Wi-Fi.
* **Implementation:** Antigravity must explicitly enable Firestore offline persistence (`enableIndexedDbPersistence()` in the Firebase JS SDK v8, or `initializeFirestore` with `localCache` in v9/v10). 
* **Behavior:** Reads come from the local cache first. Writes are queued locally and sync automatically when the connection is restored.
* The entire web page should be able to be loaded when bookmarked as a shortcut on a mobile phone - that goes direct to the latest trip.

### 8. Edge Cases & State Reconciliation
The AI needs explicit instructions on how to handle state conflicts, otherwise it will write brittle logic.
* **The "Late Joiner" Problem:** (Low prority) If a trip is created and *then* a new family member joins the group, the `packStatus` map for `INDIVIDUAL` items won't have their ID. 
    * *Directive:* The UI rendering logic must dynamically check the `Family.members` array. If a member exists in the family but not in an item's `packStatus`, the UI should treat their status as `false` by default and append them to the document on the next write.
* **Template Duplication:** If a user accidentally applies the "Beach" template twice to the same trip, the merge utility must explicitly reject duplicate items based on the template's original `item.id`.
* Editing who-has-to-pack-it: If one person adds "Snacks" for themself, another person should be able to set it as "me too, I should also pack snacks" and edit the "who this is for" flags on the item.

### 9. Strict TypeScript Interfaces
To prevent the AI from drifting and hallucinating properties, mandate TypeScript and provide the exact interfaces it must use.
```typescript
type AllocationType = 'INDIVIDUAL' | 'SPECIFIC' | 'COMMUNAL';

interface TripItem {
  id: string; // Unique instance ID
  templateItemId: string; // Reference to original template item
  name: string;
  type: AllocationType;
  // If INDIVIDUAL
  packStatus?: Record<string, boolean>; // userId -> isPacked
  // If SPECIFIC
  assigneeId?: string;
  isPacked?: boolean;
  // If COMMUNAL
  packedBy?: string | null; // userId or null
}
```

### 10. Required File Structure
AI coding agents perform significantly better when you dictate the scaffolding upfront. Tell it to use this exact structure:
```text
/src
  /components
    /ui          # shadcn components go here
    /trip        # TripCard, PackingItemRow, FilterToggles
  /hooks
    useFamilyData.ts # Firestore subscription for active family
    useTrip.ts       # Trip-specific logic and optimistic updates
  /lib
    firebase.ts      # Init and offline persistence setup
    mergeUtils.ts    # Pure functions for template merging
  /pages
    Dashboard.tsx
    ActiveTrip.tsx
```

### Filtering Logic Rules for "[Just Me]" View
To determine if a `TripItem` should be displayed when a user toggles the "[Just Me]" filter, the UI must use the following strict evaluation:

* **If type === 'INDIVIDUAL':** Always return `true`. (Everyone, including the current user, needs their own version of this item, like socks).
* **If type === 'SPECIFIC':** Return `true` ONLY IF `item.assigneeIds list includes currentUser.uid`. (e.g., If Caroline is assigned the camera, only she sees it in her 'Just Me' view.  If both Caroline and I both should pack sunglasses, then we should both be in the item.assigneeIds list). 
* **If type === 'COMMUNAL':** Return `true` IF `item.packedBy === null` (nobody has packed it yet, so it is everyone's responsibility) OR IF `item.packedBy === currentUser.uid` (the current user packed it, so it should remain visible to them).
