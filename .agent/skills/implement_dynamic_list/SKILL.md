---
name: implement_dynamic_list
description: Implement client-side dynamic searching and sorting for list views using React hooks.
---

# Skill: Implement Dynamic List

## Purpose
Standardize the implementation of interactive list views that support instant search filtering and multi-criteria sorting without server re-fetches.

## Usage
Trigger this skill when building list pages (e.g., Recipe List, Inventory Grid) where the dataset is small enough (<1000 items) to handle client-side.

## Steps

0. **Context**:
   - Ensure the parent page fetches the initial data array serverside.
   - Pass this data to a `client` component.

1. **Setup State**:
   - `search`: string (for text filtering)
   - `sortOrder`: enum/string (e.g., 'newest', 'oldest', 'az')

2. **Implement Logic (`useMemo`)**:
   - Filter first: Check includes on multiple fields (name, code, description).
   - Sort second: Switch case based on `sortOrder` state.
   - Return the processed list.

3. **UI Controls Pattern**:
   - **Search**: Input type="text" with `value={search}` and `onChange`.
   - **Sort**: Select dropdown with `value={sortOrder}`.

## Code Template

```tsx
'use client'

import { useState, useMemo } from 'react'

export default function DynamicList({ items }: { items: Item[] }) {
    const [search, setSearch] = useState('')
    const [sortOrder, setSortOrder] = useState('newest')

    const filteredItems = useMemo(() => {
        let list = [...items]

        // 1. FILTER
        if (search.trim()) {
            const q = search.toLowerCase()
            list = list.filter(item => 
                item.name.toLowerCase().includes(q) ||
                item.code.toLowerCase().includes(q)
            )
        }

        // 2. SORT
        switch (sortOrder) {
            case 'az': 
                list.sort((a, b) => a.name.localeCompare(b.name))
                break
            case 'oldest':
                list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                break
            case 'newest':
            default: 
                list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        }

        return list
    }, [items, search, sortOrder])

    return (
        <div>
            {/* Controls */}
            <div className="flex gap-2 mb-4">
                <input 
                    type="text" 
                    placeholder="Search..." 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="border p-2 rounded"
                />
                <select 
                    value={sortOrder} 
                    onChange={e => setSortOrder(e.target.value)}
                    className="border p-2 rounded"
                >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="az">A-Z</option>
                </select>
            </div>

            {/* List Render */}
            <div className="grid gap-4">
                {filteredItems.map(item => (
                    <div key={item.id}>{item.name}</div>
                ))}
            </div>
        </div>
    )
}
```
