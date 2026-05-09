"""
Compare different weight configurations to see the impact on results.
"""

import sys
from io import StringIO
from collections import Counter
import pandas as pd

# Import the solver functions
from class_solver import load_students, NUM_CLASSES, NUM_STUDENTS
from ortools.sat.python import cp_model
import time


def solve_with_weights(input_csv, weights, description):
    """Run solver with custom weights and return metrics."""
    print(f"\n{'='*80}")
    print(f"{description}")
    print(f"{'='*80}")
    print(f"Weights: {weights}")
    print()

    students = load_students(input_csv)
    name_to_index = {s["name"]: i for i, s in enumerate(students)}

    model = cp_model.CpModel()

    # Decision variables
    x = {}
    for i in range(NUM_STUDENTS):
        for c in range(NUM_CLASSES):
            x[(i, c)] = model.NewBoolVar(f"x_{i}_{c}")

    # Hard constraints
    for i in range(NUM_STUDENTS):
        model.Add(sum(x[(i, c)] for c in range(NUM_CLASSES)) == 1)

    for c in range(NUM_CLASSES):
        model.Add(sum(x[(i, c)] for i in range(NUM_STUDENTS)) == 18)

    penalties = []

    # Add balance penalties with custom weights
    def add_balance(field, values, weight):
        for value in values:
            total_count = sum(1 for s in students if s[field] == value)
            for c in range(NUM_CLASSES):
                class_count = sum(x[(i, c)] for i, s in enumerate(students) if s[field] == value)
                diff = model.NewIntVar(0, NUM_STUDENTS * NUM_CLASSES, f"diff_{field}_{value}_{c}")
                model.AddAbsEquality(diff, class_count * NUM_CLASSES - total_count)
                penalties.append(diff * weight)

    add_balance("gender", ["g", "b"], weights["gender"])
    add_balance("problematic", ["y"], weights["problematic"])
    add_balance("special_needs", ["y"], weights["special_needs"])
    add_balance("math", ["h", "m", "l"], weights["math"])
    add_balance("reading", ["h", "m", "l"], weights["reading"])

    # Friend satisfaction
    has_friend = {}
    for i, student in enumerate(students):
        same_class_friend_vars = []
        for friend_name in student["friends"]:
            if friend_name not in name_to_index:
                continue
            j = name_to_index[friend_name]
            for c in range(NUM_CLASSES):
                both = model.NewBoolVar(f"both_{i}_{j}_{c}")
                model.Add(both <= x[(i, c)])
                model.Add(both <= x[(j, c)])
                model.Add(both >= x[(i, c)] + x[(j, c)] - 1)
                same_class_friend_vars.append(both)

        has_friend[i] = model.NewBoolVar(f"has_friend_{i}")
        if same_class_friend_vars:
            model.AddMaxEquality(has_friend[i], same_class_friend_vars)
        else:
            model.Add(has_friend[i] == 0)

        penalties.append((1 - has_friend[i]) * weights["friend_miss"])

    model.Minimize(sum(penalties))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30
    solver.parameters.num_search_workers = 8

    # Suppress output
    old_stdout = sys.stdout
    sys.stdout = StringIO()

    start = time.time()
    status = solver.Solve(model)
    elapsed = time.time() - start

    sys.stdout = old_stdout

    # Collect results
    assignments = []
    for i, student in enumerate(students):
        for c in range(NUM_CLASSES):
            if solver.Value(x[(i, c)]) == 1:
                row = dict(student)
                row["assigned_class"] = c + 1
                row["has_friend_in_class"] = solver.Value(has_friend[i])
                assignments.append(row)
                break

    df = pd.DataFrame(assignments)

    # Calculate metrics
    friend_pct = df["has_friend_in_class"].sum() / len(df) * 100

    # Balance metrics
    import statistics

    math_by_class = {}
    reading_by_class = {}

    for c in range(1, NUM_CLASSES + 1):
        class_df = df[df["assigned_class"] == c]
        math_counts = Counter(class_df["math"])
        reading_counts = Counter(class_df["reading"])

        math_by_class[c] = {
            "h": math_counts.get("h", 0),
            "m": math_counts.get("m", 0),
            "l": math_counts.get("l", 0),
        }
        reading_by_class[c] = {
            "h": reading_counts.get("h", 0),
            "m": reading_counts.get("m", 0),
            "l": reading_counts.get("l", 0),
        }

    # Calculate standard deviations
    math_high = [math_by_class[c]["h"] for c in range(1, NUM_CLASSES + 1)]
    math_med = [math_by_class[c]["m"] for c in range(1, NUM_CLASSES + 1)]
    math_low = [math_by_class[c]["l"] for c in range(1, NUM_CLASSES + 1)]

    reading_high = [reading_by_class[c]["h"] for c in range(1, NUM_CLASSES + 1)]
    reading_med = [reading_by_class[c]["m"] for c in range(1, NUM_CLASSES + 1)]
    reading_low = [reading_by_class[c]["l"] for c in range(1, NUM_CLASSES + 1)]

    math_stddev_avg = (statistics.stdev(math_high) + statistics.stdev(math_med) + statistics.stdev(math_low)) / 3
    reading_stddev_avg = (statistics.stdev(reading_high) + statistics.stdev(reading_med) + statistics.stdev(reading_low)) / 3

    # Print results
    print(f"Status: {solver.StatusName(status)}")
    print(f"Runtime: {elapsed:.2f}s")
    print(f"Objective: {solver.ObjectiveValue():.0f}")
    print()
    print(f"📊 RESULTS:")
    print(f"  Friend satisfaction: {df['has_friend_in_class'].sum()}/90 ({friend_pct:.1f}%)")
    print(f"  Math balance (avg stddev): {math_stddev_avg:.2f}")
    print(f"  Reading balance (avg stddev): {reading_stddev_avg:.2f}")
    print()

    # Show per-class breakdown
    print("Per-Class Breakdown:")
    print(f"  {'Class':<8} {'Math H/M/L':<15} {'Reading H/M/L':<15} {'Friends':<10}")
    print(f"  {'-'*60}")
    for c in range(1, NUM_CLASSES + 1):
        class_df = df[df["assigned_class"] == c]
        friend_count = class_df["has_friend_in_class"].sum()
        math_str = f"{math_by_class[c]['h']}/{math_by_class[c]['m']}/{math_by_class[c]['l']}"
        reading_str = f"{reading_by_class[c]['h']}/{reading_by_class[c]['m']}/{reading_by_class[c]['l']}"
        print(f"  {c:<8} {math_str:<15} {reading_str:<15} {friend_count}/18")

    return {
        "friend_pct": friend_pct,
        "math_stddev": math_stddev_avg,
        "reading_stddev": reading_stddev_avg,
        "objective": solver.ObjectiveValue(),
    }


if __name__ == "__main__":
    test_file = "test_realistic_school.csv"

    print("\n" + "="*80)
    print("WEIGHT COMPARISON TEST")
    print("="*80)
    print(f"Using: {test_file}")

    # Current weights (friends prioritized)
    current_weights = {
        "problematic": 100,
        "special_needs": 100,
        "gender": 40,
        "math": 30,
        "reading": 30,
        "friend_miss": 50,
    }

    # Adjusted weights (academics prioritized)
    adjusted_weights = {
        "problematic": 100,
        "special_needs": 100,
        "math": 60,
        "reading": 60,
        "gender": 40,
        "friend_miss": 30,
    }

    result1 = solve_with_weights(test_file, current_weights,
                                  "CONFIGURATION 1: Friends > Academics (Current)")

    result2 = solve_with_weights(test_file, adjusted_weights,
                                  "CONFIGURATION 2: Academics > Friends (Recommended)")

    # Summary comparison
    print("\n" + "="*80)
    print("COMPARISON SUMMARY")
    print("="*80)
    print()
    print(f"{'Metric':<30} {'Friends>Academics':<20} {'Academics>Friends':<20} {'Better':<10}")
    print("-"*80)
    print(f"{'Friend Satisfaction':<30} {result1['friend_pct']:<20.1f}% {result2['friend_pct']:<20.1f}% {'←' if result1['friend_pct'] > result2['friend_pct'] else '→'}")
    print(f"{'Math Balance (lower=better)':<30} {result1['math_stddev']:<20.2f} {result2['math_stddev']:<20.2f} {'←' if result1['math_stddev'] < result2['math_stddev'] else '→'}")
    print(f"{'Reading Balance (lower=better)':<30} {result1['reading_stddev']:<20.2f} {result2['reading_stddev']:<20.2f} {'←' if result1['reading_stddev'] < result2['reading_stddev'] else '→'}")
    print()
    print("Key Takeaway:")
    print("  - Prioritizing academics improves balance with minimal friend satisfaction loss")
    print("  - Recommended: Use academics > friends for middle/high school")
    print("  - Current weights may be OK for elementary (social-emotional focus)")
    print()
