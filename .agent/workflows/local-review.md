---
description: How to implement and review changes before committing
---

# Local Review Before Commit Workflow

When making changes to the ASU Hockey website, follow this flow:

## 1. Implement Changes

- Make the necessary code changes to the project files
- Ensure the dev server is running (`npm start` in the project directory)

## 2. Notify User for Local Review

- After implementing changes, **DO NOT commit immediately**
- Notify the user that changes are ready for local review
- Include:
  - Summary of what was changed
  - Which files were modified
  - Instructions to refresh their browser at `http://localhost:3000`

## 3. Wait for User Approval

- Wait for the user to confirm the changes look good locally
- If the user requests adjustments, make them and repeat step 2
- Only proceed to commit after explicit user approval

## 4. Commit and Push

- After user approval, stage, commit, and push the changes
- Use a descriptive commit message summarizing the changes

## Example Flow

```
1. Agent: Makes changes to Home.jsx and Home.css
2. Agent: "Changes are ready for local review. Please refresh localhost:3000"
3. User: "Looks good, go ahead and commit"
4. Agent: git add, commit, push
```

## Key Rule

**Never commit changes without user confirmation that they look correct locally.**
