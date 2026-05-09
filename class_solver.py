"""
Class assignment optimizer.

This script:
1. Generates a fake dataset of 90 students.
2. Assigns them to 5 classes of 18 using Google OR-Tools CP-SAT.
3. Balances gender, problematic status, special-needs status, math level,
   reading level, and friend placement.
4. Writes the final class assignment to class_assignments.csv.

The important idea:
- x[(i, c)] is a boolean variable.
- x[(i, c)] = 1 means student i is assigned to class c.
- The solver chooses values for these variables while obeying hard constraints
  and minimizing soft imbalance penalties.
"""

import random
import time
from collections import Counter, defaultdict

import pandas as pd
from ortools.sat.python import cp_model


NUM_STUDENTS = 90
NUM_CLASSES = 5
CLASS_SIZE = 18

WEIGHTS = {
    "problematic": 100,
    "special_needs": 100,
    "gender": 40,
    "math": 30,
    "reading": 30,
    "friend_miss": 50,
}


def generate_sample_students(output_path="students_sample.csv", seed=42):
    random.seed(seed)

    rows = []
    names = [f"Student_{i+1:02d}" for i in range(NUM_STUDENTS)]

    genders = ["g"] * 45 + ["b"] * 45
    random.shuffle(genders)

    # Adjust these totals however you want.
    problematic_values = ["y"] * 12 + ["n"] * (NUM_STUDENTS - 12)
    special_values = ["y"] * 10 + ["n"] * (NUM_STUDENTS - 10)

    math_values = ["h"] * 25 + ["m"] * 40 + ["l"] * 25
    reading_values = ["h"] * 25 + ["m"] * 40 + ["l"] * 25

    random.shuffle(problematic_values)
    random.shuffle(special_values)
    random.shuffle(math_values)
    random.shuffle(reading_values)

    # Give each student 2 random friends.
    # This creates a fake social graph.
    friend_map = {}
    for name in names:
        possible = [n for n in names if n != name]
        friend_map[name] = random.sample(possible, 2)

    for i, name in enumerate(names):
        rows.append({
            "name": name,
            "gender": genders[i],
            "problematic": problematic_values[i],
            "special_needs": special_values[i],
            "math": math_values[i],
            "reading": reading_values[i],
            "friends": ";".join(friend_map[name]),
        })

    df = pd.DataFrame(rows)
    df.to_csv(output_path, index=False)
    print(f"Generated sample data: {output_path}")


def load_students(path):
    df = pd.read_csv(path)

    required_columns = [
        "name",
        "gender",
        "problematic",
        "special_needs",
        "math",
        "reading",
        "friends",
    ]

    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    students = []
    for _, row in df.iterrows():
        friends_raw = row.get("friends", "")
        if pd.isna(friends_raw):
            friends = []
        else:
            friends = [
                f.strip()
                for f in str(friends_raw).split(";")
                if f.strip()
            ]

        students.append({
            "name": str(row["name"]),
            "gender": str(row["gender"]),
            "problematic": str(row["problematic"]),
            "special_needs": str(row["special_needs"]),
            "math": str(row["math"]),
            "reading": str(row["reading"]),
            "friends": friends,
        })

    if len(students) != NUM_STUDENTS:
        raise ValueError(f"Expected {NUM_STUDENTS} students, got {len(students)}")

    return students


def add_balance_penalties(model, x, students, penalties, field, values, weight):
    """
    Adds imbalance penalties for a categorical field.

    Example:
    field = "gender"
    values = ["g", "b"]

    If there are 47 girls total, ideal per class is 47 / 5.
    To avoid decimals, compare:

        girls_in_class * 5

    against:

        total_girls

    The absolute difference becomes the penalty.
    """

    for value in values:
        total_count = sum(1 for s in students if s[field] == value)

        for c in range(NUM_CLASSES):
            class_count = sum(
                x[(i, c)]
                for i, s in enumerate(students)
                if s[field] == value
            )

            diff = model.NewIntVar(
                0,
                NUM_STUDENTS * NUM_CLASSES,
                f"diff_{field}_{value}_class_{c}",
            )

            model.AddAbsEquality(
                diff,
                class_count * NUM_CLASSES - total_count,
            )

            penalties.append(diff * weight)


def solve_classes(input_path="students_sample.csv", output_path="class_assignments.csv"):
    students = load_students(input_path)
    name_to_index = {s["name"]: i for i, s in enumerate(students)}

    model = cp_model.CpModel()

    # Decision variables:
    # x[(i, c)] = 1 if student i is assigned to class c.
    x = {}
    for i in range(NUM_STUDENTS):
        for c in range(NUM_CLASSES):
            x[(i, c)] = model.NewBoolVar(f"x_student_{i}_class_{c}")

    # Hard constraint:
    # each student gets exactly one class.
    for i in range(NUM_STUDENTS):
        model.Add(sum(x[(i, c)] for c in range(NUM_CLASSES)) == 1)

    # Hard constraint:
    # each class has exactly 18 students.
    for c in range(NUM_CLASSES):
        model.Add(sum(x[(i, c)] for i in range(NUM_STUDENTS)) == CLASS_SIZE)

    penalties = []

    # Soft balance constraints.
    add_balance_penalties(
        model, x, students, penalties,
        field="gender",
        values=["g", "b"],
        weight=WEIGHTS["gender"],
    )

    add_balance_penalties(
        model, x, students, penalties,
        field="problematic",
        values=["y"],
        weight=WEIGHTS["problematic"],
    )

    add_balance_penalties(
        model, x, students, penalties,
        field="special_needs",
        values=["y"],
        weight=WEIGHTS["special_needs"],
    )

    add_balance_penalties(
        model, x, students, penalties,
        field="math",
        values=["h", "m", "l"],
        weight=WEIGHTS["math"],
    )

    add_balance_penalties(
        model, x, students, penalties,
        field="reading",
        values=["h", "m", "l"],
        weight=WEIGHTS["reading"],
    )

    # Friend satisfaction.
    #
    # has_friend[i] = 1 if student i has at least one listed friend
    # in the same class.
    has_friend = {}

    for i, student in enumerate(students):
        same_class_friend_vars = []

        for friend_name in student["friends"]:
            if friend_name not in name_to_index:
                continue

            j = name_to_index[friend_name]

            for c in range(NUM_CLASSES):
                both_in_class = model.NewBoolVar(
                    f"student_{i}_with_friend_{j}_class_{c}"
                )

                # both_in_class is true only if both x[i,c] and x[j,c] are true.
                model.Add(both_in_class <= x[(i, c)])
                model.Add(both_in_class <= x[(j, c)])
                model.Add(both_in_class >= x[(i, c)] + x[(j, c)] - 1)

                same_class_friend_vars.append(both_in_class)

        has_friend[i] = model.NewBoolVar(f"has_friend_{i}")

        if same_class_friend_vars:
            # has_friend[i] is the OR/max of all same-class friend indicators.
            model.AddMaxEquality(has_friend[i], same_class_friend_vars)
        else:
            model.Add(has_friend[i] == 0)

        # Penalize students who do not have a friend in class.
        penalties.append((1 - has_friend[i]) * WEIGHTS["friend_miss"])

    # Objective:
    # minimize total weighted penalties.
    model.Minimize(sum(penalties))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30
    solver.parameters.num_search_workers = 8

    start = time.time()
    status = solver.Solve(model)
    elapsed = time.time() - start

    status_name = solver.StatusName(status)
    print()
    print(f"Solver status: {status_name}")
    print(f"Objective score: {solver.ObjectiveValue() if status in [cp_model.OPTIMAL, cp_model.FEASIBLE] else 'N/A'}")
    print(f"Runtime: {elapsed:.2f} seconds")
    print()

    if status not in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        print("No valid assignment found.")
        return

    assignments = []
    class_to_students = defaultdict(list)

    for i, student in enumerate(students):
        assigned_class = None
        for c in range(NUM_CLASSES):
            if solver.Value(x[(i, c)]) == 1:
                assigned_class = c + 1
                break

        row = dict(student)
        row["assigned_class"] = assigned_class
        row["has_friend_in_class"] = solver.Value(has_friend[i])
        assignments.append(row)
        class_to_students[assigned_class].append(row)

    result_df = pd.DataFrame(assignments)
    result_df.to_csv(output_path, index=False)
    print(f"Wrote assignments: {output_path}")
    print()

    print_balance_report(class_to_students)


def print_balance_report(class_to_students):
    print("=" * 80)
    print("BALANCE REPORT")
    print("=" * 80)

    total_with_friend = 0

    for class_num in sorted(class_to_students.keys()):
        students = class_to_students[class_num]
        total_with_friend += sum(s["has_friend_in_class"] for s in students)

        print()
        print(f"Class {class_num}: {len(students)} students")
        print("-" * 40)

        print("Gender:", dict(Counter(s["gender"] for s in students)))
        print("Problematic:", dict(Counter(s["problematic"] for s in students)))
        print("Special needs:", dict(Counter(s["special_needs"] for s in students)))
        print("Math:", dict(Counter(s["math"] for s in students)))
        print("Reading:", dict(Counter(s["reading"] for s in students)))

        friend_count = sum(s["has_friend_in_class"] for s in students)
        print(f"Students with at least one friend: {friend_count}/{len(students)}")

        print()
        print("Students:")
        for s in students:
            friend_marker = "friend-ok" if s["has_friend_in_class"] else "NO-FRIEND"
            print(
                f"  {s['name']} | "
                f"gender={s['gender']} | "
                f"problematic={s['problematic']} | "
                f"special={s['special_needs']} | "
                f"math={s['math']} | "
                f"reading={s['reading']} | "
                f"{friend_marker}"
            )

    print()
    print("=" * 80)
    print(f"Total students with at least one friend: {total_with_friend}/90")
    print("=" * 80)


if __name__ == "__main__":
    generate_sample_students("students_sample.csv")
    solve_classes("students_sample.csv", "class_assignments.csv")
