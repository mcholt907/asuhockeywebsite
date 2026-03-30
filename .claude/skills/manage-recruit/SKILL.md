---
name: manage-recruit
description: Add or remove a recruit from asu_hockey_data.json. Usage: /manage-recruit add "First Last" [class year e.g. 2026-2027] | /manage-recruit remove "First Last"
---

You are helping manage the `asu_hockey_data.json` recruiting data for the ASU Hockey website.

ALWAYS read the full `asu_hockey_data.json` file first before making any edit.

The recruiting section is organized by class year (e.g., "2026-2027", "2027-2028"). Each recruit entry has this exact schema:

```json
{
  "number": "",
  "name": "First Last",
  "position": "G|D|F|W|C",
  "age": "",
  "birth_year": "YYYY",
  "birthplace": "City, ST, CAN|USA",
  "height": "X'Y\"",
  "weight": "XXX",
  "shoots": "L|R",
  "player_link": "https://www.eliteprospects.com/player/ID/slug",
  "player_photo": "https://files.eliteprospects.com/layout/players/...",
  "current_team": "Team Name"
}
```

Note: `number` and `age` are always empty strings for recruits.

---

## If REMOVING a recruit:

1. Find the recruit by name (case-insensitive) across all class-year arrays under `recruiting`
2. Delete their entire JSON object `{ ... }`
3. Fix comma hygiene:
   - If they were the **last entry** in the array: remove the trailing comma from the now-last entry before them
   - If they were **not the last entry**: remove the comma after their own closing `}`
4. Validate JSON is still parseable after the edit (see validation command below)
5. Report: which class year they were in, and confirm removal

---

## If ADDING a recruit:

1. Ask the user for all required fields:
   - name, position (G/D/F/W/C)
   - birth_year, birthplace (format: "City, ST, CAN" or "City, ST, USA")
   - height (format: `5'10"`), weight (lbs as string), shoots (L or R)
   - EliteProspects player URL
   - EliteProspects player photo URL (from eliteprospects.com/layout/players/...)
   - current_team (e.g., "Des Moines Buccaneers")
   - class year (e.g., "2026-2027")
2. Insert the new entry as the **last item** in the correct class-year array
3. The previous last entry gets a comma added after its `}` if it doesn't already have one
4. The new entry has **no trailing comma**
5. Validate JSON is still parseable after the edit
6. Report: confirm insertion into the specified class year

---

## JSON validation command:

```bash
node -e "JSON.parse(require('fs').readFileSync('asu_hockey_data.json','utf8')); console.log('JSON valid');"
```

If validation fails, show the error and fix the issue before reporting success.
