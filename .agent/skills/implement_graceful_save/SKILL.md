---
name: implement_graceful_save
description: Implement server actions that return status objects instead of throwing, coupled with client-side toast notifications.
---

# Skill: Implement Graceful Save with Toasts

## Purpose
To provide a better user experience by handling server-side errors gracefully and displaying informative toast notifications on the client, rather than crashing the app or showing generic error pages.

## Pattern

### 1. Server Action (`actions.ts`)
Return a standard response object: `{ success: boolean, error?: string, data?: any }`.
Do NOT throw errors for expected validation failures or operational errors.
Do NOT redirect if you want to show a toast before navigation (optional).

```typescript
// actions.ts
export async function myServerAction(formData: FormData) {
    try {
        // ... perform logic ...
        await dbFunction(...)

        revalidatePath('/path')
        return { success: true, data: result } 
    } catch (e) {
        console.error('Action error:', e)
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
}
```

### 2. Client Component (`MyComponent.tsx`)
Use `useToast` to show success/error messages based on the action's return value.

```tsx
// MyComponent.tsx
'use client'
import { useToast } from '@/components/ui/Toaster'
// ...

export default function MyComponent() {
    const { showToast } = useToast()
    const [isPending, startTransition] = useTransition()

    const handleSave = async () => {
        startTransition(async () => {
            const result = await myServerAction(formData)
            
            if (result.success) {
                showToast('Saved successfully', 'success')
                // Optional: Redirect client-side
                router.push('/list')
            } else {
                showToast(result.error || 'Failed to save', 'error')
            }
        })
    }
    // ...
}
```

## Checklist
- [ ] Wrap server action logic in `try/catch`.
- [ ] Return structured `{ success, error }` object.
- [ ] Import `useToast` in client component.
- [ ] Replace `alert()` or `console.error` with `showToast(msg, 'error')`.
- [ ] Use `showToast(msg, 'success')` on success.
