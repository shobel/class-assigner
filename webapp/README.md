# Class Assignment Optimizer - Web App

## Quick Start

```bash
cd webapp
python3 app.py
```

Open browser to: **http://localhost:5001**

## Features Implemented

✅ Global configuration (properties & weights)  
✅ CSV import with auto-detection  
✅ Student list view with icons  
✅ Student detail panel  
✅ Run assignment solver  
✅ Visual class boxes with results  
✅ All data stored locally (JSON files)

## UI Flow

1. **First Time:** Configure Rules → Set weights for properties
2. **Import:** Upload CSV for each grade → Auto-map columns
3. **View:** See student list with property icons
4. **Assign:** Click "Assign Classes" → Runs solver
5. **Results:** Visual class boxes with balanced assignments

## Data Storage

- `data/config.json` - Global settings
- `data/students.json` - All student data by grade
- `data/assignments.json` - Class assignments

## Requirements

- **Python 3.9+**

## Troubleshooting

### "Port 5001 already in use"
Another instance may be running. Change the port in `app.py`
