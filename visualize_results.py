"""
Simple text-based visualization of class assignments.
"""

import pandas as pd
from collections import Counter


def visualize_assignment(result_csv, title="Class Assignment Visualization"):
    """Create a text-based visualization of the assignment."""
    df = pd.read_csv(result_csv)

    print("\n" + "=" * 100)
    print(title.center(100))
    print("=" * 100)

    for class_num in range(1, 6):
        class_students = df[df["assigned_class"] == class_num].sort_values("name")

        print(f"\n{'CLASS ' + str(class_num):^100}")
        print("─" * 100)

        # Summary stats
        gender_counts = Counter(class_students["gender"])
        prob_counts = Counter(class_students["problematic"])
        special_counts = Counter(class_students["special_needs"])
        math_counts = Counter(class_students["math"])
        reading_counts = Counter(class_students["reading"])
        friend_count = int(class_students["has_friend_in_class"].sum())

        print(f"👥 {len(class_students)} students  |  "
              f"♀️ {gender_counts.get('g', 0)}g {gender_counts.get('b', 0)}b  |  "
              f"⚠️  {prob_counts.get('y', 0)} prob  |  "
              f"🎯 {special_counts.get('y', 0)} special  |  "
              f"🤝 {friend_count}/{len(class_students)} have friends")

        print(f"📚 Math: {math_counts.get('h', 0)}h {math_counts.get('m', 0)}m {math_counts.get('l', 0)}l  |  "
              f"📖 Reading: {reading_counts.get('h', 0)}h {reading_counts.get('m', 0)}m {reading_counts.get('l', 0)}l")

        print()

        # Student roster
        for idx, row in class_students.iterrows():
            gender_icon = "♀️" if row["gender"] == "g" else "♂️"
            prob_icon = "⚠️ " if row["problematic"] == "y" else "  "
            special_icon = "🎯" if row["special_needs"] == "y" else "  "
            friend_icon = "🤝" if row["has_friend_in_class"] else "  "

            # Parse friends list
            friends_raw = row.get("friends", "")
            if pd.isna(friends_raw) or friends_raw == "":
                friends = []
            else:
                friends = [f.strip() for f in str(friends_raw).split(";") if f.strip()]

            friends_str = ", ".join(friends) if friends else "no friends listed"

            print(f"  {gender_icon} {prob_icon}{special_icon}{friend_icon}  {row['name']:<15}  "
                  f"M:{row['math']} R:{row['reading']}  →  [{friends_str}]")

    print("\n" + "=" * 100)

    # Overall statistics
    total_with_friends = int(df["has_friend_in_class"].sum())
    print(f"\nOVERALL: {total_with_friends}/{len(df)} students ({total_with_friends/len(df)*100:.1f}%) have at least one friend in their class")

    print("\nLegend: ♀️=girl ♂️=boy ⚠️=problematic 🎯=special needs 🤝=has friend in class")
    print("        M=Math level (h/m/l), R=Reading level (h/m/l)")
    print("=" * 100 + "\n")


if __name__ == "__main__":
    import sys

    scenarios = [
        ("result_friend_clusters.csv", "🏆 BEST CASE: Tight Friend Clusters (100% Friend Satisfaction)"),
        ("result_realistic_school.csv", "📚 TYPICAL CASE: Realistic School Demographics (87.8% Friend Satisfaction)"),
        ("result_edge_case.csv", "🎯 EDGE CASE: Popular Kids Challenge (57.8% Friend Satisfaction)"),
    ]

    if len(sys.argv) > 1:
        # Visualize specific file
        result_file = sys.argv[1]
        visualize_assignment(result_file, f"Class Assignment: {result_file}")
    else:
        # Visualize interesting scenarios
        print("\n")
        print("╔" + "═" * 98 + "╗")
        print("║" + " " * 30 + "CLASS ASSIGNMENT VISUALIZATIONS" + " " * 37 + "║")
        print("╚" + "═" * 98 + "╝")

        for result_file, title in scenarios:
            try:
                visualize_assignment(result_file, title)
                input("\nPress Enter to see next scenario...")
            except FileNotFoundError:
                print(f"\nFile not found: {result_file}")
            except Exception as e:
                print(f"\nError visualizing {result_file}: {e}")
