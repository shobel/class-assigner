# Testing Guide - Class Assignment Solver

## Quick Start

### 1. Run All Tests
```bash
python3 run_tests.py
```
This will run all 5 test scenarios and display a summary comparison.

### 2. Visualize Specific Results
```bash
python3 visualize_results.py result_friend_clusters.csv
```
Or run without arguments for an interactive walkthrough of interesting scenarios:
```bash
python3 visualize_results.py
```

### 3. Generate New Test Scenarios
```bash
python3 test_scenarios.py
```
This creates 5 different CSV test files with varying characteristics.

---

## Available Test Scenarios

### 1. Unbalanced Gender (`test_unbalanced_gender.csv`)
- **Challenge**: 55 girls / 35 boys (can't split evenly)
- **Friend Network**: Sparse (0-1 friend per student)
- **Use Case**: Rural schools, specialized programs with gender imbalances

### 2. High Special Needs (`test_high_needs.csv`)
- **Challenge**: 28% problematic, 22% special needs
- **Friend Network**: Normal (2 friends per student)
- **Use Case**: Title I schools, inclusion programs with higher support needs

### 3. Tight Friend Clusters (`test_friend_clusters.csv`)
- **Challenge**: 12 clusters of 7-8 tightly connected students
- **Friend Network**: Dense clusters (3-4 friends each within cluster)
- **Use Case**: Small elementary grades moving up together, cohort-based programs

### 4. Realistic School (`test_realistic_school.csv`)
- **Challenge**: Typical demographic distribution
- **Friend Network**: Varied (0-4 friends, weighted to 2-3)
- **Use Case**: Most common real-world scenario

### 5. Popular Kids Edge Case (`test_edge_case.csv`)
- **Challenge**: 80% of students want same 2 "popular" kids
- **Friend Network**: Unrealistic star topology
- **Use Case**: Data quality testing, worst-case optimization

---

## Test File Structure

### Input Files Format
All test input CSVs have these columns:
- `name`: Student identifier (e.g., "Student_01")
- `gender`: "g" or "b"
- `problematic`: "y" or "n"
- `special_needs`: "y" or "n"
- `math`: "h", "m", or "l"
- `reading`: "h", "m", or "l"
- `friends`: semicolon-separated list (e.g., "Student_05;Student_12")

### Output Files Format
Result CSVs include all input columns plus:
- `assigned_class`: Integer 1-5
- `has_friend_in_class`: 0 or 1

---

## Understanding Test Results

### Status Values
- **OPTIMAL**: Solver found proven best solution
- **FEASIBLE**: Solver found good solution but hit time limit (30s)
- **INFEASIBLE**: No valid solution exists (shouldn't happen with our constraints)

### Key Metrics

#### Friend Satisfaction %
Percentage of students who have at least one listed friend in their assigned class.
- **Excellent**: 85-100%
- **Good**: 70-84%
- **Acceptable**: 60-69%
- **Poor**: <60% (usually due to input data quality)

#### Balance Standard Deviation
Measures consistency across classes (lower is better).
- **Perfect**: 0.0 (all classes identical)
- **Excellent**: 0.0-0.6
- **Good**: 0.6-1.0
- **Acceptable**: 1.0-1.5
- **Poor**: >1.5

Example: If gender stddev = 0.55, classes might have 9-10 girls vs target of 9.4

---

## Creating Custom Test Scenarios

### Option 1: Modify test_scenarios.py
Add a new function following the pattern:

```python
def generate_my_scenario(output_path="test_my_scenario.csv", seed=600):
    random.seed(seed)
    # ... customize distributions ...
    df.to_csv(output_path, index=False)
```

### Option 2: Create CSV Manually
Create a CSV with required columns. Example:

```csv
name,gender,problematic,special_needs,math,reading,friends
Alice,g,n,n,h,h,Bob;Charlie
Bob,b,n,n,m,h,Alice
Charlie,b,y,n,l,m,Alice;David
...
```

Then run:
```bash
python3 class_solver.py
# Modify to use your CSV file
```

---

## Adjusting Solver Parameters

### In class_solver.py

#### Timeout
```python
solver.parameters.max_time_in_seconds = 30  # Increase for harder problems
```

#### Worker Threads
```python
solver.parameters.num_search_workers = 8  # Adjust based on CPU cores
```

#### Optimization Weights
```python
WEIGHTS = {
    "problematic": 100,      # ↑ Prioritize problematic balance
    "special_needs": 100,    # ↑ Prioritize special needs balance
    "gender": 40,            # ↓ Lower priority
    "math": 30,
    "reading": 30,
    "friend_miss": 50,       # ↑ Increase to prioritize friends more
}
```

**Higher weight = more important to balance perfectly**

Common adjustments:
- **School prioritizes academics**: Increase `math` and `reading` to 50-60
- **School prioritizes social-emotional**: Increase `friend_miss` to 100+
- **School has significant behavior concerns**: Increase `problematic` to 150+

---

## Interpreting Difficult Cases

### Low Friend Satisfaction (<70%)

**Possible causes**:
1. **Sparse friend network** - Many students listed 0-1 friends
   - *Solution*: Encourage more friend nominations in data collection
2. **Impossible friend clusters** - Tight groups that can't be split
   - *Solution*: This is expected; solver does best possible
3. **Unrealistic requests** - Popular kids scenario
   - *Solution*: Data validation to warn about unusual patterns

### Hit Time Limit (FEASIBLE not OPTIMAL)

**Possible causes**:
1. **Complex constraints** - Many competing priorities
   - *Solution*: Increase timeout to 60-120 seconds
2. **Large imbalances** - Hard to satisfy all constraints
   - *Solution*: May need to adjust input data or weights

### Poor Balance (High Stddev)

**Possible causes**:
1. **Input data can't be evenly divided** - e.g., 55 girls ÷ 5 classes = 11 each
   - *Solution*: This is optimal given constraints
2. **Friend optimization conflicting with balance**
   - *Solution*: Decrease `friend_miss` weight slightly

---

## Next Steps After Testing

### ✅ Validated
- Solver handles diverse scenarios robustly
- Balance optimization works well
- Friend placement effective
- Performance acceptable (<30s most cases)

### 🎯 Ready for Production
1. **UI Development** - Teacher-friendly input interface
2. **Data Validation** - Warn about poor quality friend data
3. **Reporting** - Enhanced visualizations and exports
4. **Configuration** - Allow schools to adjust weights/priorities
5. **Integration** - Import from school information systems

---

## Troubleshooting

### Import Errors
```bash
pip3 install -r requirements.txt
```

### File Not Found
Ensure you've generated test files:
```bash
python3 test_scenarios.py
```

### Solver Too Slow
Increase timeout or decrease problem size:
```python
# In class_solver.py
solver.parameters.max_time_in_seconds = 60  # or 120
```

### Memory Issues
Reduce worker threads if running on limited hardware:
```python
solver.parameters.num_search_workers = 4  # or 2
```

---

## Additional Resources

- **Full Test Results**: See `TEST_RESULTS.md` for detailed analysis
- **README**: See `README.md` for implementation details
- **OR-Tools Docs**: https://developers.google.com/optimization/cp/cp_solver

---

*Last Updated: 2026-05-07*
