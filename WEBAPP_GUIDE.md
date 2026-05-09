# 🚀 Web App Quick Start Guide

## Starting the App

```bash
cd webapp
./run.sh
```

Or manually:
```bash
cd webapp
python3 app.py
```

Then open: **http://localhost:5000**

---

## 🎯 Your First Assignment

### Step 1: Configure Rules (First Time Only)

1. Click **"Configure Rules"** button
2. See default properties:
   - Gender (weight: 40)
   - Problematic (weight: 100) ⚠️
   - Special Needs (weight: 100) 🎯
   - Math Level (weight: 60) 📐
   - Reading Level (weight: 60) 📚
3. Adjust weights if needed (higher = more important)
4. Click **"Save Configuration"**

**What do weights mean?**
- 100 = Highest priority (must balance perfectly)
- 60 = High priority (academic balance)
- 40 = Medium priority (social balance)
- 30 = Lower priority (friends - nice to have)

---

### Step 2: Import Students

1. Click **"➕ Import Grade"**
2. Enter grade name: `1st Grade`
3. Set number of classes: `5`
4. Click **"Upload CSV File"**
5. Select one of:
   - `../students_sample_v2.csv` (has incompatibles)
   - `../test_realistic_school.csv` (realistic scenario)
   - Your own CSV file

**CSV Format:**
```csv
name,gender,problematic,special_needs,math,reading,friends,incompatible
Alice,g,n,n,h,h,Bob;Charlie,David
Bob,b,n,n,m,h,Alice,
Charlie,b,y,n,l,m,Alice;David,
```

6. **Preview** appears - check your data
7. Click **"Next: Map Columns"**
8. Confirm column mappings (auto-detected)
9. Click **"Import Students"**

---

### Step 3: View Students

1. Grade appears in sidebar
2. Click on grade name to select it
3. Main screen shows student cards
4. Each card shows:
   - Student name
   - Property icons: ♀️ ♂️ ⚠️ 🎯 📐H 📚M
5. Click any student card to see details

---

### Step 4: Run Assignment

1. With grade selected, click **"🎯 Assign Classes"**
2. Solver runs (~10-30 seconds depending on complexity)
3. Results appear as **class boxes**

**What you'll see:**
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Class 1       │  │   Class 2       │  │   Class 3       │
│   18 students   │  │   18 students   │  │   18 students   │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ Alice    ♀️ 📐H │  │ Bob      ♂️ 📚M │  │ Charlie  ♂️ ⚠️  │
│ ...             │  │ ...             │  │ ...             │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

4. Click any student to see their full details

---

## 🎨 Icon Legend

| Icon | Meaning |
|------|---------|
| ♀️ | Girl |
| ♂️ | Boy |
| ⚠️ | Problematic student (behavior concerns) |
| 🎯 | Special needs |
| 📐H/M/L | Math level (High/Medium/Low) |
| 📚H/M/L | Reading level (High/Medium/Low) |
| 🤝 | Has friend in class (in results) |

---

## 📂 Data Storage

All data stored locally in `webapp/data/`:

- **config.json** - Your rule configuration
- **students.json** - All student data by grade
- **assignments.json** - Assignment results

🔒 **Privacy:** Nothing leaves your computer!

---

## 🐛 Troubleshooting

### App won't start
```bash
# Install dependencies
cd webapp
pip3 install -r requirements.txt
python3 app.py
```

### Port already in use
```bash
# Find and kill process
lsof -ti:5000 | xargs kill -9

# Or use different port
python3 app.py --port 5001
```

### Import fails
- Check CSV has `name` column
- Values should match: `g`/`b` for gender, `y`/`n` for yes/no, `h`/`m`/`l` for levels
- Friends/incompatibles: semicolon-separated (e.g., "Alice;Bob;Charlie")

### Assignment fails
- Must have exactly 90 students (or adjust NUM_STUDENTS in solver)
- Must have 5 classes of 18 each (or adjust in solver)
- Check console for Python errors

---

## 💡 Tips & Tricks

### Import Your Own Data

**Required columns:**
- `name` - Student name

**Optional columns** (will use defaults if missing):
- `gender` - "g" or "b"
- `problematic` - "y" or "n"
- `special_needs` - "y" or "n"
- `math` - "h", "m", or "l"
- `reading` - "h", "m", or "l"
- `friends` - "Student1;Student2;Student3"
- `incompatible` - "Student4;Student5"

### Adjust Priorities

Want to prioritize friends over academics?
```
Math: 30 (decrease)
Reading: 30 (decrease)
Friends: 60 (increase)
```

Want to be strict about behavior?
```
Problematic: 200 (increase)
```

### Test with Sample Data

Use the test files from the main project:
- `test_realistic_school.csv` - Typical scenario
- `test_friend_clusters.csv` - Tight friend groups
- `test_high_needs.csv` - Many special needs students

---

## 🚀 Next Steps

**Current MVP has:**
- ✅ Global configuration
- ✅ CSV import with auto-detection
- ✅ Visual student cards
- ✅ Assignment solver integration
- ✅ Class box results

**Coming soon:**
- [ ] Edit students in UI (not just view)
- [ ] Manual drag-drop adjustments
- [ ] Export results to CSV/PDF
- [ ] Multiple grades simultaneously
- [ ] Undo/redo
- [ ] Save/load scenarios
- [ ] Electron packaging (desktop app)

---

## 📊 Example Workflow

**Scenario:** You're assigning 90 first-graders to 5 classes

1. **Configure** (one time):
   - Set problematic weight to 150 (strict on behavior)
   - Set friend weight to 40 (somewhat important)

2. **Import**:
   - Upload CSV from school system
   - 90 students imported

3. **Review**:
   - Click through student cards
   - Note: 12 problematic, 10 special needs, 25 high math

4. **Assign**:
   - Click "Assign Classes"
   - Solver runs 15 seconds
   - Results: Perfect balance! 87% friend satisfaction

5. **Verify**:
   - Check each class has 2-3 problematic
   - Check each class has 2 special needs
   - Verify math/reading balanced

6. **Export** (future):
   - Download CSV for school system
   - Print for teachers

---

## 🎓 Understanding Results

**Good assignment indicators:**
- Each class has similar # of problematic students
- Each class has similar # of special needs students
- Gender roughly balanced (9-9 or 10-8)
- Math/reading levels distributed
- 80-90%+ students have friends in class

**What solver optimizes:**
1. Balance problematic/special needs (highest priority)
2. Balance academics (high priority)
3. Place friends together (lower priority)
4. Balance gender (medium priority)

**Incompatibles:**
- ALWAYS separated (hard constraint)
- No trade-offs - solver will never put them together

---

## 🔧 Customization

Edit `app.py` DEFAULT_CONFIG to change default properties:

```python
DEFAULT_CONFIG = {
    "properties": [
        {
            "name": "custom_property",
            "display_name": "Custom Property",
            "type": "categorical",
            "values": ["value1", "value2"],
            "weight": 50,
            "icon": "🎨"
        }
    ]
}
```

---

**Questions?** Check the main README.md or PROJECT_SUMMARY.md

**Ready to start?**
```bash
cd webapp
./run.sh
```

Then open **http://localhost:5000** 🚀
