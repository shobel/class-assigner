# Class Assignment Optimizer - User Stories

## Overview

### What is this?
The Class Assignment Optimizer is a tool that helps schools assign students to balanced classroom groups. Instead of manually trying to balance dozens of factors across multiple classes, the app uses constraint optimization to automatically create fair, balanced assignments in seconds.

### The Problem
When dividing students into multiple classes (e.g., 90 students into 5 classes of 18), administrators need to balance many competing factors:
- Gender distribution across classes
- Even distribution of students with behavioral challenges
- Even distribution of students with special needs
- Academic level balance (math and reading)
- Social considerations (placing friends together when possible)
- Hard separation requirements (keeping incompatible students apart)

Doing this manually is extremely time-consuming and nearly impossible to optimize perfectly. You might get gender balanced but then realize problematic students are clustered, or you fix that but destroy friend groupings.

### The Solution
This app uses Google OR-Tools constraint solver to treat class assignment as an optimization problem. You configure which factors matter most (via weights), import your student data, and the solver automatically finds the best possible assignment that balances all factors simultaneously.

### Key Benefits
- **Speed:** Assignments that take hours manually are done in 30 seconds
- **Quality:** Mathematical optimization finds better solutions than manual trial-and-error
- **Transparency:** See exactly how balanced your assignments are with variance metrics
- **Control:** Configure which factors matter most via priority weights
- **Privacy:** All data stays local - nothing uploaded to the cloud

### Who uses this?
School administrators, grade-level coordinators, or anyone responsible for dividing students into balanced classroom groups.

---

## Configuration Management

### Global Assignment Rules
- As a user, I can configure which student properties should be balanced across classes (gender, problematic students, special needs, academic levels)
- As a user, I can set priority weights for each property to control how important balance is for that property (higher weight = higher priority)
- As a user, I can adjust the friend placement weight to control how much the optimizer tries to place students with their friends
- As a user, I can save my configuration and it persists across sessions
- As a user, I am prompted to configure rules before I can run assignments

## Grade Management

### Importing Student Data
- As a user, I can import student data for a grade by uploading a CSV file
- As a user, I can specify the grade name (e.g., "1st Grade", "2nd Grade")
- As a user, I can specify how many classes students should be divided into
- As a user, I can preview the first few rows of my CSV before importing
- As a user, I can map CSV columns to student properties (name, gender, problematic, special needs, math level, reading level, friends)
- As a user, I can see all imported grades in a list
- As a user, I can select a grade to view and work with its students

### Managing Grades
- As a user, I can re-import student data for an existing grade to replace the current data
- As a user, I can delete a grade and all its associated data
- As a user, I can see how many students are in each grade

## Student Data

### Student Properties
- As a user, each student has a name
- As a user, each student has a gender (girl/boy)
- As a user, each student can be marked as problematic (requiring careful distribution)
- As a user, each student can be marked as having special needs (requiring careful distribution)
- As a user, each student has a math level (high/medium/low)
- As a user, each student has a reading level (high/medium/low)
- As a user, each student can have a list of friends they want to be placed with
- As a user, each student can have a list of incompatible students they cannot be placed with (hard constraint)

### Viewing Students
- As a user, I can view all students for a selected grade in an unorganized list before assignment
- As a user, I can see student count and grade information
- As a user, I can click on a student to view their detailed information in a side panel
- As a user, I can see all properties and friend/incompatible lists for a student

## Class Assignment

### Running the Optimizer
- As a user, I can specify the number of classes to create for a grade
- As a user, I can run the optimizer to automatically assign students to classes
- As a user, I see a progress indicator while the optimizer runs (showing phases like "Loading students", "Building constraints", "Balancing demographics", "Optimizing friend placement", "Finalizing")
- As a user, I see a success notification when the assignment completes, showing key statistics
- As a user, I can view the assignment results after completion

### Assignment Algorithm
- As a user, the optimizer ensures students are distributed as evenly as possible across classes
- As a user, the optimizer balances gender distribution across classes
- As a user, the optimizer distributes problematic students evenly to avoid clustering
- As a user, the optimizer distributes special needs students evenly
- As a user, the optimizer balances math levels across classes
- As a user, the optimizer balances reading levels across classes
- As a user, the optimizer tries to place students with their requested friends when possible
- As a user, the optimizer enforces hard constraints that incompatible students are never placed together
- As a user, the optimizer uses configurable weights to prioritize different balancing factors

### Viewing Assignment Results
- As a user, I can see an overall balance report showing how well each property was balanced
- As a user, I can see balance quality ratings (Perfect/Excellent/Good/Fair) based on variance
- As a user, I can see the variance metric for each property (lower = better balance)
- As a user, I can see friend satisfaction percentage (how many students got placed with at least one friend)
- As a user, I can click an info icon to learn what the balance metrics mean
- As a user, I can see each class with its students
- As a user, I can see summary statistics for each class (gender count, problematic count, special needs count, math/reading level distribution, friend satisfaction)
- As a user, I can toggle the student list for each class to see individual students
- As a user, I can see icons indicating student properties (gender, problematic, special needs, math/reading levels, has friend in class)
- As a user, I can click on a student in a class to view their detailed information
- As a user, I can switch between viewing assignment results and the original unorganized student list

### Managing Assignments
- As a user, I can export assignment results to a CSV file
- As a user, I can run a new assignment to regenerate the class assignments (useful if I want to try different outcomes)
- As a user, assignment results persist and I can view them later when I return to the app

## Help & Information

### Understanding the App
- As a user, I can see a welcome screen explaining how to use the app (configure rules, import students, assign classes)
- As a user, I can see an icon legend explaining what each icon means
- As a user, I can access a modal explaining what balance metrics mean and how to interpret variance
- As a user, I can see tooltips and help text throughout the app

## Data Persistence

### Local Storage
- As a user, all my data stays local on my machine (no cloud upload)
- As a user, my configuration settings persist between sessions
- As a user, my imported grades and students persist between sessions
- As a user, my assignment results persist between sessions

## Constraints & Optimization

### Hard Constraints (Must Be Satisfied)
- As a user, incompatible students will never be placed in the same class
- As a user, the optimizer will fail if constraints cannot be satisfied (e.g., asking for 3 classes with 90 students but requiring incompatible students be separated with insufficient space)

### Soft Constraints (Optimized, But Not Required)
- As a user, gender balance is optimized but not guaranteed perfect (uses configurable weight)
- As a user, problematic student distribution is optimized (uses high weight)
- As a user, special needs distribution is optimized (uses high weight)
- As a user, math level balance is optimized (uses medium-high weight)
- As a user, reading level balance is optimized (uses medium-high weight)
- As a user, friend placement is optimized but lowest priority (uses low weight)
- As a user, the optimizer finds the best solution given all constraints and weights

## Performance

### Solver Execution
- As a user, the optimizer typically runs in 20-40 seconds for 90 students across 5 classes
- As a user, I see simulated progress during optimization to understand what's happening
- As a user, complex constraint problems may take longer to solve
- As a user, unsatisfiable constraint problems are detected and reported
