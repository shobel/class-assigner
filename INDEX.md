# Class Assignment Optimizer - Quick Reference

## 🚀 Quick Start

### Run Everything
```bash
./demo.sh
```
Interactive demo that runs all features step-by-step.

### Just Run the Solver
```bash
python3 class_solver.py
```
Generates sample data and creates optimal class assignments.

### Run All Tests
```bash
python3 run_tests.py
```
Tests 5 scenarios and shows comparison summary.

---

## 📚 Documentation Map

### Start Here
| Document | Purpose | Read Time |
|----------|---------|-----------|
| **PROJECT_SUMMARY.md** | High-level overview, perfect for newcomers | 10 min |
| **README.md** | Original spec with implementation details | 15 min |

### For Testing
| Document | Purpose | Read Time |
|----------|---------|-----------|
| **TESTING_GUIDE.md** | How to run tests and interpret results | 8 min |
| **TEST_RESULTS.md** | Detailed analysis of all 5 test scenarios | 12 min |

### Quick Reference
| Document | Purpose | Read Time |
|----------|---------|-----------|
| **INDEX.md** | This file - navigation and quick commands | 2 min |

---

## 🗂️ File Reference

### Core Implementation
- `class_solver.py` - Main solver algorithm
- `requirements.txt` - Python dependencies

### Testing Tools
- `test_scenarios.py` - Generate test cases
- `run_tests.py` - Automated test runner
- `visualize_results.py` - Text-based visualization
- `demo.sh` - Interactive demo script

### Data Files
- `students_sample.csv` - Sample input data
- `class_assignments.csv` - Sample output
- `test_*.csv` (5 files) - Test inputs
- `result_*.csv` (5 files) - Test outputs

---

## 🎯 Common Tasks

### Test a Custom Dataset
1. Create CSV with required columns (name, gender, problematic, special_needs, math, reading, friends)
2. Modify `class_solver.py` to load your file:
   ```python
   solve_classes("your_file.csv", "your_results.csv")
   ```
3. Run: `python3 class_solver.py`

### Adjust Priorities
Edit `WEIGHTS` in `class_solver.py`:
```python
WEIGHTS = {
    "problematic": 100,      # ↑ Increase to prioritize more
    "special_needs": 100,
    "gender": 40,            # ↓ Decrease to prioritize less
    "math": 30,
    "reading": 30,
    "friend_miss": 50,
}
```

### Visualize Results
```bash
python3 visualize_results.py result_friend_clusters.csv
```

### Change Class Configuration
Edit constants in `class_solver.py`:
```python
NUM_STUDENTS = 90    # Total students
NUM_CLASSES = 5      # Number of classes
CLASS_SIZE = 18      # Students per class
```

---

## 📊 Test Scenarios Reference

| Scenario | File | Challenge | Friend % |
|----------|------|-----------|----------|
| Unbalanced Gender | `test_unbalanced_gender.csv` | 55g/35b | 56.7% |
| High Special Needs | `test_high_needs.csv` | 28% prob, 22% special | 91.1% |
| Tight Friend Clusters | `test_friend_clusters.csv` | Dense social networks | **100%** |
| Realistic School | `test_realistic_school.csv` | Typical demographics | 87.8% |
| Popular Kids | `test_edge_case.csv` | Impossible constraints | 57.8% |

---

## 🔧 Troubleshooting

### Problem: Import errors
**Solution**: `pip3 install -r requirements.txt`

### Problem: Solver too slow
**Solution**: Increase timeout in `class_solver.py`:
```python
solver.parameters.max_time_in_seconds = 60  # or 120
```

### Problem: Low friend satisfaction
**Possible causes**:
- Input has sparse friend network
- Increase `friend_miss` weight
- Check input data quality

### Problem: Poor balance
**Possible causes**:
- Input can't be evenly divided (e.g., 55 girls ÷ 5 = 11 each)
- Friend optimization conflicting
- Adjust weights

---

## 📈 Performance Expectations

| Scenario Type | Expected Time | Expected Friend % |
|---------------|---------------|-------------------|
| Simple/balanced | 0.5-2 seconds | 85-95% |
| Complex/realistic | 5-15 seconds | 80-90% |
| Very challenging | 20-30 seconds | 70-85% |
| Edge cases | 30+ seconds | 50-70% |

---

## 🎓 Understanding Output

### CSV Output Columns
- `name` - Student name
- `gender` - "g" or "b"
- `problematic` - "y" or "n"
- `special_needs` - "y" or "n"
- `math` - "h", "m", or "l"
- `reading` - "h", "m", or "l"
- `friends` - Semicolon-separated list
- `assigned_class` - 1, 2, 3, 4, or 5
- `has_friend_in_class` - 0 or 1

### Solver Status
- **OPTIMAL**: Found proven best solution ✅
- **FEASIBLE**: Found good solution, hit time limit ⚠️
- **INFEASIBLE**: No solution exists (shouldn't happen) ❌

### Balance Metrics
- **Stddev < 0.6**: Excellent balance
- **Stddev 0.6-1.0**: Good balance
- **Stddev > 1.0**: Acceptable but could improve

---

## 🚀 Next Steps

### Current Status
✅ Core algorithm complete  
✅ Comprehensive testing done  
✅ Documentation written  
✅ Production-ready core  

### Next Phase: UI Development
- [ ] Web interface for teacher input
- [ ] Visual class roster display
- [ ] CSV import/export
- [ ] Weight configuration UI
- [ ] Real-time balance preview

### Future Enhancements
- [ ] "Must separate" constraints
- [ ] "Must keep together" constraints
- [ ] Teacher assignment
- [ ] Multi-year optimization
- [ ] SIS integration

---

## 💡 Key Concepts

### How It Works
1. **Create 450 variables**: 90 students × 5 classes = yes/no for each combo
2. **Add hard rules**: Each student → 1 class, each class → 18 students
3. **Add soft rules**: Penalties for imbalance and friend separation
4. **Optimize**: Solver finds assignment minimizing total penalties

### Not Brute Force
- Doesn't check all possible divisions (impossibly huge number)
- Uses mathematical reasoning and smart search
- Finds optimal solution in seconds, not hours

### Weight Tuning
- Higher weight = more important to balance
- `100` = highest priority (problematic, special needs)
- `30-50` = medium priority (academics, friends)
- Adjust based on school priorities

---

## 📞 Need Help?

### Documentation
1. Start with **PROJECT_SUMMARY.md** for overview
2. Read **TESTING_GUIDE.md** for testing help
3. Check **README.md** for implementation details

### Common Questions
- How to change class size? → Edit `NUM_STUDENTS`, `NUM_CLASSES`, `CLASS_SIZE`
- How to prioritize friends? → Increase `friend_miss` weight to 100+
- Why low friend %? → Check input data quality, increase timeout
- Can I have 100 students? → Yes, adjust configuration

---

## 🎯 Success Criteria

### Excellent Result
✅ Status = OPTIMAL  
✅ Friend satisfaction > 85%  
✅ Balance stddev < 1.0  
✅ Solve time < 30 seconds  

### Good Result
✅ Status = OPTIMAL or FEASIBLE  
✅ Friend satisfaction > 70%  
✅ Balance stddev < 1.5  
✅ All hard constraints met  

---

## 📝 Quick Command Reference

```bash
# Installation
pip3 install -r requirements.txt

# Run demos
./demo.sh                                    # Interactive demo
python3 class_solver.py                      # Basic solver
python3 run_tests.py                         # All tests
python3 test_scenarios.py                    # Generate tests

# Visualizations  
python3 visualize_results.py                 # Interactive
python3 visualize_results.py <file.csv>      # Specific file

# File operations
ls -lh *.csv                                 # List data files
head -10 students_sample.csv                 # Preview input
head -10 class_assignments.csv               # Preview output
```

---

**Project**: Class Assignment Optimizer  
**Status**: ✅ Production-ready core  
**Version**: 1.0  
**Last Updated**: 2026-05-07  

---

*Start with PROJECT_SUMMARY.md for the full overview, or run ./demo.sh to see it in action!*
