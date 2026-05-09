Create a Python project that solves a school class assignment optimization problem.

Goal:
We have 90 students and need to divide them into 5 classes of exactly 18 students each.

Each student has:
- name
- gender: "g" or "b"
- problematic: "y" or "n"
- special_needs: "y" or "n"
- math: "h", "m", or "l"
- reading: "h", "m", or "l"
- friends: list of student names

The solver should assign students to classes so that:
1. Every student is assigned to exactly one class.
2. Every class has exactly 18 students.
3. Gender is balanced across classes.
4. Problematic students are balanced across classes.
5. Special-needs students are balanced across classes.
6. Math levels h/m/l are balanced across classes.
7. Reading levels h/m/l are balanced across classes.
8. As many students as possible have at least one listed friend in their class.

Use Google OR-Tools CP-SAT in Python.

Please create:
- requirements.txt
- class_solver.py

requirements.txt should include:
ortools
pandas

class_solver.py should:
1. Generate a fake sample dataset of 90 students.
2. Save that dataset to students_sample.csv.
3. Load the CSV.
4. Build and solve the CP-SAT model.
5. Output assignments to class_assignments.csv.
6. Print a readable balance report for each class.
7. Print how many students have at least one friend in their class.
8. Print the solver status, objective score, and runtime.

Implementation details:
- Use 5 classes.
- Use class size 18.
- Use boolean decision variables x[(student_index, class_index)].
- x[(i, c)] = 1 means student i is assigned to class c.
- Add hard constraint: each student is assigned to exactly one class.
- Add hard constraint: each class has exactly 18 students.
- Use soft penalties for imbalance.
- For balance penalties, avoid fractions by comparing class_count * NUM_CLASSES against total_count.
  For example, if there are 47 girls total, then the ideal per class is 47/5.
  For a given class, penalty should be abs(girls_in_class * 5 - 47).
- Use AddAbsEquality for absolute-value penalties.
- For friend satisfaction:
  - For each student, create a boolean has_friend[i].
  - has_friend[i] should be 1 if at least one of their listed friends is assigned to the same class.
  - Penalize 1 - has_friend[i].
- Use a weighted objective:
  - problematic imbalance: 100
  - special_needs imbalance: 100
  - gender imbalance: 40
  - math imbalance: 30
  - reading imbalance: 30
  - friend miss: 50
- Set a solver time limit of 30 seconds.
- Use multiple workers if available.
- The code should be clean, commented, and easy to modify later.
- Include enough print statements that I can understand the result.

Also include a short explanation at the top of the file describing how the solver works.

Here is the core mental model.

You are not asking the computer to check:

Every possible division of 90 kids into 5 groups

That number is impossibly huge.

Instead, you are giving the solver variables like:

Is Alice in Class 1? yes/no
Is Alice in Class 2? yes/no
Is Alice in Class 3? yes/no
...

For 90 kids and 5 classes, that is only:

90 × 5 = 450 yes/no variables

Then you add rules:

Alice must be in exactly one class.
Every class must have exactly 18 students.
Class 1 should have about the same number of girls as Class 2, Class 3, etc.
Class 1 should have about the same number of high math kids as Class 2, etc.
Try to put each kid with at least one friend.

Then CP-SAT searches intelligently.

A good class_solver.py should look roughly like this:

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

Then run:

pip install -r requirements.txt
python class_solver.py

You should get:

students_sample.csv
class_assignments.csv
balance report printed in terminal

The most important thing to understand is this:

The solver is not “thinking like AI.” It is solving a giant logic puzzle.

You tell it:

These things are absolutely required.
These other things are preferences.
Here is how bad each kind of imperfection is.
Find the assignment with the lowest total badness score.

The exact “personality” of the output comes from the weights.

For example, this:

WEIGHTS = {
    "problematic": 100,
    "special_needs": 100,
    "gender": 40,
    "math": 30,
    "reading": 30,
    "friend_miss": 50,
}

means:

Balancing problematic and special-needs students matters more than balancing gender.
Friend placement matters more than math/reading balance, but less than problematic/special-needs balance.

If you decide friendship matters a ton, change:

"friend_miss": 50

to:

"friend_miss": 200

If you decide class composition matters more than friend placement, lower it.

One subtle but important thing: because your classes are initially unlabeled, the solver will still call them Class 1, Class 2, etc. That does not mean the classes were meaningfully labeled during optimization. It just needs names for the output. Afterward, you can assign teachers/classrooms to those groups.

The next improvement after this works would be adding extra real-world rules like:

These two kids must not be together.
These two kids must be together.
This kid should not be with this teacher.
This kid must be in same class as aide/resource support.
This student has an IEP and should not be placed with more than X other high-need students.

But I would start with the version above and only add complexity once the basic pipeline works.

And then i would need a UI for teachers to input all this info, all the students, their labels, their friends, etc and configure the assignment rules and potentially weights as a next step
