"""
Run the class solver on all test scenarios and generate comparison reports.
"""

import os
import time
import pandas as pd
from collections import Counter
from class_solver import load_students, solve_classes, NUM_CLASSES, NUM_STUDENTS


def analyze_assignments(input_csv, output_csv):
    """Analyze the quality of assignments for a given test case."""
    students = load_students(input_csv)

    if not os.path.exists(output_csv):
        return None

    assignments = pd.read_csv(output_csv)

    # Calculate statistics
    stats = {
        "total_students": len(assignments),
        "students_with_friends": int(assignments["has_friend_in_class"].sum()),
        "friend_satisfaction_pct": round(assignments["has_friend_in_class"].sum() / len(assignments) * 100, 1),
    }

    # Check balance across classes
    class_stats = []
    for class_num in range(1, NUM_CLASSES + 1):
        class_students = assignments[assignments["assigned_class"] == class_num]

        gender_counts = Counter(class_students["gender"])
        prob_counts = Counter(class_students["problematic"])
        special_counts = Counter(class_students["special_needs"])
        math_counts = Counter(class_students["math"])
        reading_counts = Counter(class_students["reading"])

        class_stats.append({
            "class": class_num,
            "size": len(class_students),
            "girls": gender_counts.get("g", 0),
            "boys": gender_counts.get("b", 0),
            "problematic": prob_counts.get("y", 0),
            "special_needs": special_counts.get("y", 0),
            "math_high": math_counts.get("h", 0),
            "math_med": math_counts.get("m", 0),
            "math_low": math_counts.get("l", 0),
            "reading_high": reading_counts.get("h", 0),
            "reading_med": reading_counts.get("m", 0),
            "reading_low": reading_counts.get("l", 0),
            "with_friend": int(class_students["has_friend_in_class"].sum()),
        })

    # Calculate balance metrics (standard deviation)
    import statistics

    girls_per_class = [cs["girls"] for cs in class_stats]
    prob_per_class = [cs["problematic"] for cs in class_stats]
    special_per_class = [cs["special_needs"] for cs in class_stats]

    stats["gender_stddev"] = round(statistics.stdev(girls_per_class), 2) if len(girls_per_class) > 1 else 0
    stats["problematic_stddev"] = round(statistics.stdev(prob_per_class), 2) if len(prob_per_class) > 1 else 0
    stats["special_needs_stddev"] = round(statistics.stdev(special_per_class), 2) if len(special_per_class) > 1 else 0

    return stats, class_stats


def run_test_scenario(input_csv, scenario_name):
    """Run solver on a test scenario and return results."""
    print("\n" + "=" * 80)
    print(f"TESTING: {scenario_name}")
    print("=" * 80)

    output_csv = input_csv.replace("test_", "result_")

    # Load and show input characteristics
    df = pd.read_csv(input_csv)
    print(f"\nInput Dataset: {input_csv}")
    print(f"  Total students: {len(df)}")
    print(f"  Gender: {Counter(df['gender'])}")
    print(f"  Problematic: {Counter(df['problematic'])}")
    print(f"  Special needs: {Counter(df['special_needs'])}")
    print(f"  Math levels: {Counter(df['math'])}")
    print(f"  Reading levels: {Counter(df['reading'])}")

    # Count friend connections
    total_friends = sum(len([f for f in str(row).split(";") if f.strip()])
                       for row in df["friends"])
    print(f"  Total friend connections: {total_friends}")

    print(f"\nRunning solver...")
    start = time.time()

    # Run the solver (suppress detailed output)
    import sys
    from io import StringIO

    old_stdout = sys.stdout
    sys.stdout = captured_output = StringIO()

    try:
        solve_classes(input_csv, output_csv)
    except Exception as e:
        sys.stdout = old_stdout
        print(f"ERROR: {e}")
        return None

    output = captured_output.getvalue()
    sys.stdout = old_stdout

    elapsed = time.time() - start

    # Extract solver status and objective from output
    lines = output.split("\n")
    solver_status = "UNKNOWN"
    objective_score = "N/A"

    for line in lines:
        if "Solver status:" in line:
            solver_status = line.split("Solver status:")[1].strip()
        if "Objective score:" in line:
            objective_score = line.split("Objective score:")[1].strip()

    print(f"  Solver status: {solver_status}")
    print(f"  Objective score: {objective_score}")
    print(f"  Runtime: {elapsed:.2f} seconds")

    # Analyze results
    stats, class_stats = analyze_assignments(input_csv, output_csv)

    if stats:
        print(f"\nResults:")
        print(f"  Students with friends: {stats['students_with_friends']}/{stats['total_students']} ({stats['friend_satisfaction_pct']}%)")
        print(f"  Gender balance (stddev): {stats['gender_stddev']}")
        print(f"  Problematic balance (stddev): {stats['problematic_stddev']}")
        print(f"  Special needs balance (stddev): {stats['special_needs_stddev']}")

        print(f"\nClass-by-class breakdown:")
        print(f"  {'Class':<8} {'Size':<6} {'Girls':<7} {'Boys':<6} {'Prob':<6} {'Spec':<6} {'Friend%':<10}")
        print(f"  {'-'*60}")
        for cs in class_stats:
            friend_pct = round(cs['with_friend'] / cs['size'] * 100, 1)
            print(f"  {cs['class']:<8} {cs['size']:<6} {cs['girls']:<7} {cs['boys']:<6} "
                  f"{cs['problematic']:<6} {cs['special_needs']:<6} {friend_pct:<10.1f}%")

    return {
        "scenario": scenario_name,
        "status": solver_status,
        "objective": objective_score,
        "runtime": elapsed,
        "stats": stats,
    }


if __name__ == "__main__":
    test_scenarios = [
        ("test_unbalanced_gender.csv", "Unbalanced Gender (55g/35b)"),
        ("test_high_needs.csv", "High Special Needs (25 prob, 20 special)"),
        ("test_friend_clusters.csv", "Tight Friend Clusters"),
        ("test_realistic_school.csv", "Realistic School Demographics"),
        ("test_edge_case.csv", "Popular Kids Edge Case"),
    ]

    results = []

    print("\n")
    print("╔" + "═" * 78 + "╗")
    print("║" + " " * 20 + "CLASS ASSIGNMENT SOLVER TEST SUITE" + " " * 24 + "║")
    print("╚" + "═" * 78 + "╝")

    for input_csv, scenario_name in test_scenarios:
        if os.path.exists(input_csv):
            result = run_test_scenario(input_csv, scenario_name)
            if result:
                results.append(result)
        else:
            print(f"\nWARNING: {input_csv} not found, skipping...")

    # Summary comparison
    print("\n\n")
    print("╔" + "═" * 78 + "╗")
    print("║" + " " * 30 + "TEST SUMMARY" + " " * 36 + "║")
    print("╚" + "═" * 78 + "╝")
    print()

    print(f"{'Scenario':<40} {'Status':<12} {'Friend%':<10} {'Runtime':<10}")
    print("-" * 80)

    for r in results:
        if r['stats']:
            friend_pct = r['stats']['friend_satisfaction_pct']
            print(f"{r['scenario']:<40} {r['status']:<12} {friend_pct:<10.1f}% {r['runtime']:<10.2f}s")

    print("\n" + "=" * 80)
    print("All tests completed!")
    print("=" * 80)
