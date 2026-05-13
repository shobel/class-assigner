# data-mutates="true" Tagging Checklist

Add `data-mutates="true"` to all HTML elements that trigger mutations (save/edit/add/delete operations).

## Buttons to Tag

### Student Management
- [ ] "Add manually" card (Import/Add empty state)
- [ ] "Import CSV" card (Import/Add empty state)
- [ ] "Re-import" button
- [ ] "Add student" button
- [ ] "Save" button in student detail panel
- [ ] "Delete student" button

### Assignment Operations
- [ ] "Re-assign" button (run solver)
- [ ] "Revert to solver baseline" button
- [ ] "Save assignments" button
- [ ] "Edit mode" toggle button

### Grade Settings
- [ ] "Edit" button in class rules config
- [ ] Save settings buttons
- [ ] Class name save buttons
- [ ] Teacher assignment saves

### School Year Operations
- [ ] "Create next year" button
- [ ] "Clear school year" button (in dev mode)
- [ ] "Set current" year button

### Configuration
- [ ] Property weight sliders/inputs
- [ ] Enable/disable property toggles (if they save immediately)

## Search Pattern

In homeroom-app.js, search for these onclick patterns:
- `onclick="save`
- `onclick="add`
- `onclick="delete`
- `onclick="remove`
- `onclick="runAssignment`
- `onclick="import`
- `onclick="create`
- `onclick="openAddStudent`
- `onclick="edit`

## How to Tag

Before:
```html
<button class="btn terra" onclick="runAssignment()">Re-assign</button>
```

After:
```html
<button class="btn terra" onclick="runAssignment()" data-mutates="true">Re-assign</button>
```

## Non-Mutating (DO NOT TAG)

- Search/filter controls
- Navigation (show/switch screens)
- Export/download buttons
- View toggles (clean view, advanced stats)
- Close/cancel buttons
- Flag filter chips (IEP, 504, etc.)
- School year switcher (just changes view)
