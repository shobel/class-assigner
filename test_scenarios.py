"""
Generate different test scenarios for the class assignment solver.
"""

import random
import pandas as pd


def generate_unbalanced_gender(output_path="test_unbalanced_gender.csv", seed=100):
    """Test case: Unbalanced gender distribution (55 girls, 35 boys)"""
    random.seed(seed)

    rows = []
    names = [f"Student_{i+1:02d}" for i in range(90)]

    # Unbalanced gender
    genders = ["g"] * 55 + ["b"] * 35
    random.shuffle(genders)

    problematic_values = ["y"] * 10 + ["n"] * 80
    special_values = ["y"] * 8 + ["n"] * 82
    math_values = ["h"] * 30 + ["m"] * 30 + ["l"] * 30
    reading_values = ["h"] * 30 + ["m"] * 30 + ["l"] * 30

    random.shuffle(problematic_values)
    random.shuffle(special_values)
    random.shuffle(math_values)
    random.shuffle(reading_values)

    # Sparse friend connections (0-1 friend each)
    friend_map = {}
    for name in names:
        possible = [n for n in names if n != name]
        num_friends = random.choice([0, 1])
        if num_friends == 0:
            friend_map[name] = []
        else:
            friend_map[name] = random.sample(possible, 1)

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
    print(f"Generated: {output_path}")
    print(f"  Gender: 55 girls, 35 boys")
    print(f"  Friend connections: sparse (0-1 per student)")


def generate_high_needs(output_path="test_high_needs.csv", seed=200):
    """Test case: High concentration of problematic and special needs students"""
    random.seed(seed)

    rows = []
    names = [f"Student_{i+1:02d}" for i in range(90)]

    genders = ["g"] * 45 + ["b"] * 45
    random.shuffle(genders)

    # More challenging students
    problematic_values = ["y"] * 25 + ["n"] * 65
    special_values = ["y"] * 20 + ["n"] * 70

    # More students at low/high extremes
    math_values = ["h"] * 35 + ["m"] * 20 + ["l"] * 35
    reading_values = ["h"] * 35 + ["m"] * 20 + ["l"] * 35

    random.shuffle(problematic_values)
    random.shuffle(special_values)
    random.shuffle(math_values)
    random.shuffle(reading_values)

    # Normal friend connections
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
    print(f"Generated: {output_path}")
    print(f"  Problematic: 25/90")
    print(f"  Special needs: 20/90")
    print(f"  Math/Reading: polarized (high/low heavy)")


def generate_friend_clusters(output_path="test_friend_clusters.csv", seed=300):
    """Test case: Tight friend clusters that are hard to separate"""
    random.seed(seed)

    rows = []
    names = [f"Student_{i+1:02d}" for i in range(90)]

    genders = ["g"] * 45 + ["b"] * 45
    random.shuffle(genders)

    problematic_values = ["y"] * 12 + ["n"] * 78
    special_values = ["y"] * 10 + ["n"] * 80
    math_values = ["h"] * 30 + ["m"] * 30 + ["l"] * 30
    reading_values = ["h"] * 30 + ["m"] * 30 + ["l"] * 30

    random.shuffle(problematic_values)
    random.shuffle(special_values)
    random.shuffle(math_values)
    random.shuffle(reading_values)

    # Create tight clusters of 6-8 students each
    friend_map = {}
    clusters = []

    # Create 12 clusters of 7-8 students each
    remaining = list(names)
    while remaining:
        cluster_size = min(random.choice([7, 8]), len(remaining))
        cluster = remaining[:cluster_size]
        clusters.append(cluster)
        remaining = remaining[cluster_size:]

    # Each student is friends with 3-4 people in their cluster
    for cluster in clusters:
        for name in cluster:
            possible = [n for n in cluster if n != name]
            num_friends = min(random.choice([3, 4]), len(possible))
            friend_map[name] = random.sample(possible, num_friends)

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
    print(f"Generated: {output_path}")
    print(f"  Friend structure: tight clusters of 7-8")
    print(f"  Friends per student: 3-4 (within cluster)")


def generate_realistic_school(output_path="test_realistic_school.csv", seed=400):
    """Test case: Realistic distribution based on typical school demographics"""
    random.seed(seed)

    rows = []
    names = [f"Student_{i+1:02d}" for i in range(90)]

    # Slightly unbalanced (realistic)
    genders = ["g"] * 47 + ["b"] * 43
    random.shuffle(genders)

    # Realistic special needs rates (~15-20%)
    problematic_values = ["y"] * 15 + ["n"] * 75
    special_values = ["y"] * 18 + ["n"] * 72

    # Bell curve for academics (more medium, fewer extremes)
    math_values = ["h"] * 20 + ["m"] * 50 + ["l"] * 20
    reading_values = ["h"] * 22 + ["m"] * 48 + ["l"] * 20

    random.shuffle(problematic_values)
    random.shuffle(special_values)
    random.shuffle(math_values)
    random.shuffle(reading_values)

    # Varied friend connections (0-4 friends)
    friend_map = {}
    for name in names:
        possible = [n for n in names if n != name]
        num_friends = random.choice([0, 1, 2, 2, 3, 3, 4])  # weighted toward 2-3
        friend_map[name] = random.sample(possible, min(num_friends, len(possible)))

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
    print(f"Generated: {output_path}")
    print(f"  Demographics: realistic school distribution")
    print(f"  Special needs: ~20% (18/90)")
    print(f"  Academics: bell curve")


def generate_edge_case(output_path="test_edge_case.csv", seed=500):
    """Test case: Extreme edge case - all students want to be with same 2 popular kids"""
    random.seed(seed)

    rows = []
    names = [f"Student_{i+1:02d}" for i in range(90)]

    genders = ["g"] * 45 + ["b"] * 45
    random.shuffle(genders)

    # One class worth of problematic/special needs concentrated
    problematic_values = ["y"] * 18 + ["n"] * 72
    special_values = ["y"] * 18 + ["n"] * 72

    math_values = ["h"] * 30 + ["m"] * 30 + ["l"] * 30
    reading_values = ["h"] * 30 + ["m"] * 30 + ["l"] * 30

    random.shuffle(problematic_values)
    random.shuffle(special_values)
    random.shuffle(math_values)
    random.shuffle(reading_values)

    # Most students want to be with Student_01 and Student_02 (popular kids)
    friend_map = {}
    popular_kids = ["Student_01", "Student_02"]

    for name in names:
        if name in popular_kids:
            # Popular kids have random friends
            possible = [n for n in names if n != name and n not in popular_kids]
            friend_map[name] = random.sample(possible, 2)
        else:
            # Most others want to be with the popular kids
            if random.random() < 0.8:  # 80% want popular kids
                friend_map[name] = popular_kids.copy()
            else:
                # Some have different friends
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
    print(f"Generated: {output_path}")
    print(f"  Edge case: ~80% of students want same 2 popular kids")
    print(f"  Problematic/Special needs: concentrated (18 each)")


if __name__ == "__main__":
    print("Generating test scenarios...")
    print("=" * 60)
    generate_unbalanced_gender()
    print()
    generate_high_needs()
    print()
    generate_friend_clusters()
    print()
    generate_realistic_school()
    print()
    generate_edge_case()
    print("=" * 60)
    print("All test scenarios generated!")
