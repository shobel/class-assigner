#!/usr/bin/env python3
"""Generate a large realistic student roster for testing"""

import csv
import random

# Common names
first_names_girls = ["Emma", "Olivia", "Ava", "Isabella", "Sophia", "Charlotte", "Mia", "Amelia", "Harper", "Evelyn",
                     "Abigail", "Emily", "Ella", "Elizabeth", "Sofia", "Avery", "Scarlett", "Grace", "Chloe", "Lily",
                     "Hannah", "Aria", "Layla", "Ellie", "Zoey", "Penelope", "Riley", "Nora", "Hazel", "Eleanor",
                     "Aurora", "Violet", "Savannah", "Brooklyn", "Claire", "Skylar", "Lucy", "Anna", "Stella", "Paisley",
                     "Bella", "Natalie", "Aaliyah", "Camila", "Luna", "Maya", "Leah", "Audrey", "Allison", "Gabriella"]

first_names_boys = ["Liam", "Noah", "Oliver", "Elijah", "William", "James", "Benjamin", "Lucas", "Henry", "Alexander",
                    "Mason", "Michael", "Ethan", "Daniel", "Jacob", "Logan", "Jackson", "Sebastian", "Jack", "Aiden",
                    "Owen", "Samuel", "Matthew", "Joseph", "Levi", "Mateo", "David", "John", "Wyatt", "Carter",
                    "Julian", "Luke", "Grayson", "Isaac", "Gabriel", "Anthony", "Dylan", "Leo", "Lincoln", "Jaxon",
                    "Asher", "Christopher", "Ezra", "Thomas", "Charles", "Nathan", "Caleb", "Ryan", "Christian", "Hunter"]

last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
              "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
              "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
              "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
              "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts",
              "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker", "Cruz", "Edwards", "Collins", "Reyes",
              "Stewart", "Morris", "Morales", "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper",
              "Peterson", "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward", "Richardson",
              "Watson", "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray", "Mendoza", "Ruiz", "Hughes"]

grades = ["Kindergarten", "1st", "2nd", "3rd", "4th", "5th"]

def generate_students(num_students_per_grade=90):
    students = []
    used_names = set()

    for grade in grades:
        grade_students = []

        for i in range(num_students_per_grade):
            # Generate unique name
            while True:
                gender = random.choice(['F', 'M'])
                if gender == 'F':
                    first = random.choice(first_names_girls)
                else:
                    first = random.choice(first_names_boys)
                last = random.choice(last_names)
                full_name = f"{first} {last}"

                if full_name not in used_names:
                    used_names.add(full_name)
                    break

            # Generate properties with realistic distributions
            math = random.choices(['h', 'm', 'l'], weights=[25, 50, 25])[0]
            reading = random.choices(['h', 'm', 'l'], weights=[25, 50, 25])[0]
            behavior = random.choices(['cooperative', 'neutral', 'disruptive'], weights=[60, 30, 10])[0]
            independence = random.choices(['high', 'neutral', 'low'], weights=[35, 50, 15])[0]

            # Special programs (realistic low percentages)
            iep = 'y' if random.random() < 0.12 else 'n'  # 12% have IEPs
            plan_504 = 'y' if random.random() < 0.08 else 'n'  # 8% have 504 plans
            esl = 'y' if random.random() < 0.15 else 'n'  # 15% ESL
            gate = 'y' if random.random() < 0.10 and math == 'h' and reading == 'h' else 'n'  # 10% GATE, requires high academic

            student = {
                'name': full_name,
                'grade': grade,
                'gender': gender,
                'math': math,
                'reading': reading,
                'behavior': behavior,
                'independence': independence,
                'iep': iep,
                '504': plan_504,
                'esl': esl,
                'gate': gate,
                'friends': '',
                'incompatible': ''
            }

            grade_students.append(student)

        # Add friendships (30% of students have a friend listed)
        for i, student in enumerate(grade_students):
            if random.random() < 0.30 and i < len(grade_students) - 1:
                friend_idx = random.randint(max(0, i-5), min(len(grade_students)-1, i+5))
                if friend_idx != i:
                    student['friends'] = grade_students[friend_idx]['name']

        # Add incompatibilities (create pairs that can't be together)
        disruptive_students = [s for s in grade_students if s['behavior'] == 'disruptive']
        # Pair up disruptive students as incompatible
        for i in range(0, len(disruptive_students) - 1, 2):
            if random.random() < 0.50:  # 50% chance to create an incompatibility pair
                disruptive_students[i]['incompatible'] = disruptive_students[i+1]['name']
                disruptive_students[i+1]['incompatible'] = disruptive_students[i]['name']

        students.extend(grade_students)

    return students

def write_csv(filename, students):
    with open(filename, 'w', newline='') as f:
        fieldnames = ['name', 'grade', 'gender', 'math', 'reading', 'behavior', 'independence',
                     'iep', '504', 'esl', 'gate', 'friends', 'incompatible']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(students)

if __name__ == '__main__':
    students = generate_students(90)
    write_csv('sample_roster_large.csv', students)

    # Print stats
    total = len(students)
    by_grade = {}
    for s in students:
        by_grade[s['grade']] = by_grade.get(s['grade'], 0) + 1

    print(f"Generated {total} students:")
    for grade in grades:
        print(f"  {grade}: {by_grade.get(grade, 0)} students")

    print(f"\nFile saved to: sample_roster_large.csv")
