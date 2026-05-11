"""
Class assignment optimizer with incompatible students support.

Added feature: Students can list other students they CANNOT be placed with.
This is a HARD constraint - incompatible students will never be in same class.
"""

import ast
import random
import time
from collections import Counter, defaultdict

import pandas as pd
from ortools.sat.python import cp_model


def parse_previous_teachers(prev):
    """Parse previous_teachers from any storage format into a list of name strings.

    Handles:
      - Python list:  ["Smith", "Jones"]
      - JSON/repr:    "['Smith', 'Jones']"
      - Pipe-sep:     "Smith|Jones"
      - Single name:  "Smith"
    """
    if not prev:
        return []
    if isinstance(prev, list):
        return [t.strip() for t in prev if t.strip()]
    s = str(prev).strip()
    # Python list repr written by pandas e.g. "['Smith', 'Jones']"
    if s.startswith("["):
        try:
            parsed = ast.literal_eval(s)
            if isinstance(parsed, list):
                return [t.strip() for t in parsed if t.strip()]
        except (ValueError, SyntaxError):
            pass
    # Pipe-separated or single value
    return [t.strip() for t in s.split("|") if t.strip()]


NUM_STUDENTS = 90
NUM_CLASSES = 5
CLASS_SIZE = 18

WEIGHTS = {
    "problematic": 100,
    "special_needs": 100,
    "math": 60,           # Prioritize academics over friends
    "reading": 60,
    "gender": 40,
    "friend_miss": 30,
}


def generate_sample_students(output_path="students_sample_v2.csv", seed=42):
    random.seed(seed)

    rows = []
    names = [f"Student_{i+1:02d}" for i in range(NUM_STUDENTS)]

    genders = ["g"] * 45 + ["b"] * 45
    random.shuffle(genders)

    problematic_values = ["y"] * 12 + ["n"] * (NUM_STUDENTS - 12)
    special_values = ["y"] * 10 + ["n"] * (NUM_STUDENTS - 10)
    math_values = ["h"] * 25 + ["m"] * 40 + ["l"] * 25
    reading_values = ["h"] * 25 + ["m"] * 40 + ["l"] * 25

    random.shuffle(problematic_values)
    random.shuffle(special_values)
    random.shuffle(math_values)
    random.shuffle(reading_values)

    # Friends
    friend_map = {}
    for name in names:
        possible = [n for n in names if n != name]
        friend_map[name] = random.sample(possible, 2)

    # Incompatibles - most have 0, some have 1-2
    # About 15-20 students have incompatibles
    incompatible_map = {}
    students_with_incompatibles = random.sample(names, 18)  # 20% have incompatibles

    for name in names:
        if name in students_with_incompatibles:
            possible = [n for n in names if n != name and n not in friend_map[name]]
            num_incompatible = random.choice([1, 1, 1, 2])  # Weighted toward 1
            incompatible_map[name] = random.sample(possible, min(num_incompatible, len(possible)))
        else:
            incompatible_map[name] = []

    for i, name in enumerate(names):
        rows.append({
            "name": name,
            "gender": genders[i],
            "problematic": problematic_values[i],
            "special_needs": special_values[i],
            "math": math_values[i],
            "reading": reading_values[i],
            "friends": ";".join(friend_map[name]),
            "incompatible": ";".join(incompatible_map[name]),
        })

    df = pd.DataFrame(rows)
    df.to_csv(output_path, index=False)
    print(f"Generated sample data: {output_path}")

    # Report incompatibles stats
    num_with = sum(1 for x in incompatible_map.values() if x)
    total_incomp = sum(len(x) for x in incompatible_map.values())
    print(f"  Students with incompatibles: {num_with}/90")
    print(f"  Total incompatible pairs: {total_incomp}")


def load_students(path):
    df = pd.read_csv(path)

    # Only name is truly required
    if "name" not in df.columns:
        raise ValueError("Missing required column: name")

    students = []
    for _, row in df.iterrows():
        student = {"name": str(row["name"])}

        # Add all other columns dynamically
        for col in df.columns:
            if col == "name":
                continue
            elif col == "friends":
                # Parse friends list
                friends_raw = row.get("friends", "")
                if pd.isna(friends_raw):
                    student["friends"] = []
                else:
                    student["friends"] = [f.strip() for f in str(friends_raw).split(",") if f.strip()]
            elif col == "incompatible":
                # Parse incompatible list
                incomp_raw = row.get("incompatible", "")
                if pd.isna(incomp_raw):
                    student["incompatible"] = []
                else:
                    student["incompatible"] = [f.strip() for f in str(incomp_raw).split(",") if f.strip()]
            else:
                # Store all other properties as-is
                value = row[col]
                student[col] = str(value) if not pd.isna(value) else ""

        # Ensure friends and incompatible exist
        if "friends" not in student:
            student["friends"] = []
        if "incompatible" not in student:
            student["incompatible"] = []

        students.append(student)

    return students


def add_balance_penalties(model, x, students, penalties, n_classes, field, values, weight):
    num_students = len(students)
    for value in values:
        total_count = sum(1 for s in students if s[field] == value)
        for c in range(n_classes):
            class_count = sum(
                x[(i, c)]
                for i, s in enumerate(students)
                if s[field] == value
            )
            diff = model.NewIntVar(0, num_students * n_classes, f"diff_{field}_{value}_class_{c}")
            model.AddAbsEquality(diff, class_count * n_classes - total_count)
            penalties.append(diff * weight)


def solve_classes(input_path="students_sample_v2.csv", output_path="class_assignments_v2.csv",
                  num_classes=None, min_students=None, max_students=None, enforce_class_size=False,
                  properties_config=None, teachers=None, available_teachers=None):
    """
    Solve class assignments with flexible constraints.

    Args:
        input_path: Path to student CSV
        output_path: Path to write assignments
        num_classes: Number of classes (defaults to NUM_CLASSES constant)
        min_students: Minimum students per class (soft or hard constraint)
        max_students: Maximum students per class (soft or hard constraint)
        enforce_class_size: If True, min/max are hard constraints. If False, they're soft.
        properties_config: List of property configs from backend (with name, type, values, weight, enabled)
    """
    students = load_students(input_path)
    num_students = len(students)
    name_to_index = {s["name"]: i for i, s in enumerate(students)}

    # Use provided parameters or fall back to constants
    n_classes = num_classes if num_classes is not None else NUM_CLASSES

    # Calculate reasonable defaults if not provided
    if min_students is None or max_students is None:
        avg_per_class = num_students / n_classes
        min_students = min_students if min_students is not None else max(1, int(avg_per_class * 0.8))
        max_students = max_students if max_students is not None else int(avg_per_class * 1.2) + 2

    print(f"\n{'='*60}")
    print(f"Configuring optimizer:")
    print(f"  Students: {num_students}")
    print(f"  Classes: {n_classes}")
    print(f"  Class size: {min_students}-{max_students} ({'HARD' if enforce_class_size else 'SOFT'} constraint)")
    print(f"  Average per class: {num_students / n_classes:.1f}")
    print(f"{'='*60}\n")

    model = cp_model.CpModel()

    # Decision variables
    x = {}
    for i in range(num_students):
        for c in range(n_classes):
            x[(i, c)] = model.NewBoolVar(f"x_student_{i}_class_{c}")

    # Hard constraint: each student in exactly one class
    for i in range(num_students):
        model.Add(sum(x[(i, c)] for c in range(n_classes)) == 1)

    # Class size constraints
    penalties = []

    if enforce_class_size:
        # HARD constraint: each class must be within min/max
        for c in range(n_classes):
            class_size = sum(x[(i, c)] for i in range(num_students))
            model.Add(class_size >= min_students)
            model.Add(class_size <= max_students)
        print(f"Applied HARD class size constraints: {min_students}-{max_students} students per class")
    else:
        # SOFT constraint: penalize deviation from ideal range
        ideal_size = num_students / n_classes
        for c in range(n_classes):
            class_size = sum(x[(i, c)] for i in range(num_students))

            # Penalize if below min
            below_min = model.NewIntVar(0, num_students, f"below_min_class_{c}")
            model.Add(below_min >= min_students - class_size)
            model.Add(below_min >= 0)
            penalties.append(below_min * 1000)  # Heavy penalty for going below min

            # Penalize if above max
            above_max = model.NewIntVar(0, num_students, f"above_max_class_{c}")
            model.Add(above_max >= class_size - max_students)
            model.Add(above_max >= 0)
            penalties.append(above_max * 1000)  # Heavy penalty for going above max

            # Gentle penalty for deviation from ideal
            deviation = model.NewIntVar(0, num_students, f"deviation_class_{c}")
            model.AddAbsEquality(deviation, class_size - int(ideal_size))
            penalties.append(deviation * 10)

        print(f"Applied SOFT class size constraints: prefer {min_students}-{max_students}, strongly discourage violations")

    # HARD CONSTRAINT: Incompatible students
    # If student i lists student j as incompatible, they cannot be in same class
    incompatible_pairs = []
    for i, student in enumerate(students):
        for incomp_name in student["incompatible"]:
            if incomp_name not in name_to_index:
                continue
            j = name_to_index[incomp_name]

            # Avoid adding the same pair twice (if both list each other)
            if (i, j) not in incompatible_pairs and (j, i) not in incompatible_pairs:
                incompatible_pairs.append((i, j))

                # For each class, at most one of them can be in it
                for c in range(n_classes):
                    model.Add(x[(i, c)] + x[(j, c)] <= 1)

    print(f"Incompatible constraints: {len(incompatible_pairs)} pairs must be separated")

    # HARD CONSTRAINT: Teacher uniqueness
    # Auto-assign mode: available_teachers is a flat list; solver picks which class each teacher gets
    teacher_assignment = {}  # t[(j, c)] = 1 if teacher j assigned to class c
    assigned_teachers_result = []  # filled after solve

    if available_teachers:
        n_teachers = len(available_teachers)
        for j in range(n_teachers):
            for c in range(n_classes):
                teacher_assignment[(j, c)] = model.NewBoolVar(f"t_{j}_c{c}")

        # Each teacher in exactly one class
        for j in range(n_teachers):
            model.Add(sum(teacher_assignment[(j, c)] for c in range(n_classes)) == 1)

        # Each class has at most one teacher
        for c in range(n_classes):
            model.Add(sum(teacher_assignment[(j, c)] for j in range(n_teachers)) <= 1)

        # Teacher uniqueness: student can't be in a class with a teacher they've had
        blocked = 0
        for i, student in enumerate(students):
            prev = student.get("previous_teachers", "")
            if not prev:
                continue
            prev_list = parse_previous_teachers(prev)
            for j, teacher in enumerate(available_teachers):
                if teacher and teacher in prev_list:
                    for c in range(n_classes):
                        model.Add(teacher_assignment[(j, c)] + x[(i, c)] <= 1)
                        blocked += 1
        print(f"Teacher auto-assign: {n_teachers} teachers, {blocked} uniqueness links")

    elif teachers:
        # Legacy: static class-indexed teachers list
        blocked = 0
        for i, student in enumerate(students):
            prev = student.get("previous_teachers", "")
            if not prev:
                continue
            prev_list = parse_previous_teachers(prev)
            for c_idx, teacher in enumerate(teachers):
                if teacher and teacher in prev_list:
                    model.Add(x[(i, c_idx)] == 0)
                    blocked += 1
        print(f"Teacher uniqueness: blocked {blocked} student-class assignments")

    # Soft balance constraints - apply dynamically based on config
    if properties_config:
        print("\nApplying balance constraints from config:")
        for prop in properties_config:
            if not prop.get('enabled', True):
                print(f"  ⊗ {prop['display_name']}: DISABLED")
                continue

            prop_name = prop['name']
            prop_type = prop.get('type', 'categorical')
            # Hard constraints use a dominant weight; soft use the user-defined value
            if prop.get('constraint') == 'hard':
                weight = 300
            else:
                weight = prop.get('weight', 50)

            # Skip relationship types (friends handled separately)
            if prop_type == 'relationship':
                continue

            # Check if this property exists in student data
            has_property = any(prop_name in s for s in students)
            if not has_property:
                print(f"  ⚠ {prop['display_name']}: property '{prop_name}' not found in data, skipping")
                continue

            if prop_type == 'boolean':
                # For boolean properties, balance students who have it (value = True/1/y)
                values_to_balance = ['True', 'true', '1', 'y', 'yes', 'Yes']
                add_balance_penalties(model, x, students, penalties, n_classes, prop_name, values_to_balance, weight)
                print(f"  ✓ {prop['display_name']}: balancing (weight={weight})")
            elif prop_type == 'categorical':
                # For categorical, balance all values
                values = prop.get('values', [])
                if values:
                    add_balance_penalties(model, x, students, penalties, n_classes, prop_name, values, weight)
                    print(f"  ✓ {prop['display_name']}: balancing {len(values)} categories (weight={weight})")
                else:
                    print(f"  ⚠ {prop['display_name']}: no values specified, skipping")
    else:
        # Fallback to hardcoded weights if no config provided
        print("\nNo config provided, using default balance constraints:")
        add_balance_penalties(model, x, students, penalties, n_classes, "gender", ["g", "b"], WEIGHTS.get("gender", 40))
        if any("problematic" in s for s in students):
            add_balance_penalties(model, x, students, penalties, n_classes, "problematic", ["y"], WEIGHTS.get("problematic", 100))
        if any("special_needs" in s for s in students):
            add_balance_penalties(model, x, students, penalties, n_classes, "special_needs", ["y"], WEIGHTS.get("special_needs", 100))
        if any("math" in s for s in students):
            add_balance_penalties(model, x, students, penalties, n_classes, "math", ["h", "m", "l"], WEIGHTS.get("math", 60))
        if any("reading" in s for s in students):
            add_balance_penalties(model, x, students, penalties, n_classes, "reading", ["h", "m", "l"], WEIGHTS.get("reading", 60))

    # Friend satisfaction
    friend_weight = WEIGHTS.get("friend_miss", 30)

    # Get friend weight from config if provided
    if properties_config:
        friend_prop = next((p for p in properties_config if p.get('name') == 'friends'), None)
        if friend_prop and friend_prop.get('enabled', True):
            friend_weight = friend_prop.get('weight', 30)
            print(f"  ✓ Friendships: encouraging (weight={friend_weight})")
        elif friend_prop and not friend_prop.get('enabled'):
            friend_weight = 0
            print(f"  ⊗ Friendships: DISABLED")

    if friend_weight > 0:
        has_friend = {}
        for i, student in enumerate(students):
            same_class_friend_vars = []

            for friend_name in student["friends"]:
                if friend_name not in name_to_index:
                    continue
                j = name_to_index[friend_name]

                for c in range(n_classes):
                    both_in_class = model.NewBoolVar(f"student_{i}_with_friend_{j}_class_{c}")
                    model.Add(both_in_class <= x[(i, c)])
                    model.Add(both_in_class <= x[(j, c)])
                    model.Add(both_in_class >= x[(i, c)] + x[(j, c)] - 1)
                    same_class_friend_vars.append(both_in_class)

            has_friend[i] = model.NewBoolVar(f"has_friend_{i}")
            if same_class_friend_vars:
                model.AddMaxEquality(has_friend[i], same_class_friend_vars)
            else:
                model.Add(has_friend[i] == 0)

            penalties.append((1 - has_friend[i]) * friend_weight)

    model.Minimize(sum(penalties))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30
    solver.parameters.num_search_workers = 8

    start = time.time()
    status = solver.Solve(model)
    elapsed = time.time() - start

    status_name = solver.StatusName(status)
    print(f"\nSolver status: {status_name}")
    print(f"Objective score: {solver.ObjectiveValue() if status in [cp_model.OPTIMAL, cp_model.FEASIBLE] else 'N/A'}")
    print(f"Runtime: {elapsed:.2f} seconds\n")

    if status not in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        details = (
            f"{num_students} students · {n_classes} classes · "
            f"size {min_students}–{max_students} ({'hard' if enforce_class_size else 'soft'}) · "
            f"{len(incompatible_pairs)} incompatible pair(s)"
        )
        if enforce_class_size and (num_students < min_students * n_classes or num_students > max_students * n_classes):
            hint = (
                f"Class size is enforced as a hard constraint but {num_students} students "
                f"can't fit into {n_classes} classes of {min_students}–{max_students}. "
                f"Adjust class size limits or turn off hard enforcement."
            )
        else:
            hint = "Check class size settings or incompatible pair constraints."
        raise Exception(f"No valid assignment found ({details}). {hint}")

    # Extract teacher-class assignments
    if available_teachers and teacher_assignment:
        assigned_teachers_result = [""] * n_classes
        for j, teacher in enumerate(available_teachers):
            for c in range(n_classes):
                if solver.Value(teacher_assignment[(j, c)]) == 1:
                    assigned_teachers_result[c] = teacher
        print(f"Teacher assignments: {assigned_teachers_result}")

    assignments = []
    class_to_students = defaultdict(list)

    for i, student in enumerate(students):
        assigned_class = None
        for c in range(n_classes):
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
    print(f"Wrote assignments: {output_path}\n")

    # Verify incompatibles are separated
    verify_incompatibles(assignments, name_to_index)

    print_balance_report(class_to_students)

    total_with_friend = sum(a.get('has_friend_in_class', 0) for a in assignments)
    friend_satisfaction = total_with_friend / len(assignments) if assignments else 0

    return {
        'status': status_name,  # 'OPTIMAL' or 'FEASIBLE'
        'elapsed': round(elapsed, 2),
        'objective': solver.ObjectiveValue(),
        'friend_satisfaction': round(friend_satisfaction, 3),
        'teacher_assignments': assigned_teachers_result,  # class-indexed list, empty if not used
    }


def verify_incompatibles(assignments, name_to_index):
    """Verify that no incompatible students are in same class."""
    violations = []

    # Build class membership
    class_membership = defaultdict(set)
    name_to_class = {}
    for student in assignments:
        class_num = student["assigned_class"]
        class_membership[class_num].add(student["name"])
        name_to_class[student["name"]] = class_num

    # Check each student's incompatibles
    for student in assignments:
        student_name = student["name"]
        student_class = student["assigned_class"]

        for incomp_name in student["incompatible"]:
            if incomp_name in name_to_class:
                incomp_class = name_to_class[incomp_name]
                if student_class == incomp_class:
                    violations.append((student_name, incomp_name, student_class))

    if violations:
        print("⚠️  INCOMPATIBLE VIOLATIONS FOUND:")
        for s1, s2, c in violations:
            print(f"   {s1} and {s2} are both in Class {c}")
        print()
    else:
        print("✅ All incompatible pairs successfully separated\n")


def print_balance_report(class_to_students):
    print("\n" + "=" * 80)
    print("BALANCE REPORT")
    print("=" * 80)

    if not class_to_students:
        print("No assignments to report")
        return

    total_students = sum(len(students) for students in class_to_students.values())
    total_with_friend = 0

    # Collect all properties that exist in the data
    sample_student = list(class_to_students.values())[0][0] if class_to_students else {}
    properties_to_report = [k for k in sample_student.keys()
                           if k not in ['name', 'friends', 'incompatible', 'assigned_class', 'has_friend_in_class']]

    for class_num in sorted(class_to_students.keys()):
        students = class_to_students[class_num]

        if 'has_friend_in_class' in students[0]:
            total_with_friend += sum(s.get("has_friend_in_class", 0) for s in students)

        print(f"\nClass {class_num}: {len(students)} students")
        print("-" * 40)

        # Print balance for each property found in the data
        for prop in properties_to_report:
            values = [str(s.get(prop, '')) for s in students if prop in s]
            if values:
                counter = dict(Counter(values))
                print(f"{prop.title()}: {counter}")

        # Friend and incompatibility stats
        if 'has_friend_in_class' in students[0]:
            friend_count = sum(s.get("has_friend_in_class", 0) for s in students)
            print(f"Students with at least one friend: {friend_count}/{len(students)}")

        incomp_count = sum(len(s.get("incompatible", [])) for s in students)
        if incomp_count > 0:
            print(f"Total incompatible listings: {incomp_count}")

    print(f"\n{'='*80}")
    if total_with_friend > 0:
        print(f"Total students with at least one friend: {total_with_friend}/{total_students}")
    print("=" * 80)


if __name__ == "__main__":
    generate_sample_students("students_sample_v2.csv")
    solve_classes("students_sample_v2.csv", "class_assignments_v2.csv")
