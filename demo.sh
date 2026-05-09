#!/bin/bash

# Class Assignment Solver - Interactive Demo
# This script walks you through all the capabilities

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       CLASS ASSIGNMENT OPTIMIZER - INTERACTIVE DEMO           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "This demo will:"
echo "  1. Run the basic solver on sample data"
echo "  2. Generate and test 5 different scenarios"
echo "  3. Show visualizations of results"
echo ""
read -p "Press Enter to start..."

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Running Basic Solver on Sample Data"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will generate 90 sample students and assign them to 5 classes..."
echo ""

python3 class_solver.py

echo ""
echo "✓ Generated: students_sample.csv (input data)"
echo "✓ Generated: class_assignments.csv (results)"
echo ""
read -p "Press Enter to continue to comprehensive testing..."

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Generating Test Scenarios"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Creating 5 challenging test cases..."
echo ""

python3 test_scenarios.py

echo ""
read -p "Press Enter to run all tests (this will take ~2 minutes)..."

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3: Running Comprehensive Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 run_tests.py

echo ""
read -p "Press Enter to see a detailed visualization of the best result..."

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 4: Visualizing Best Case (100% Friend Satisfaction)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 visualize_results.py result_friend_clusters.csv

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DEMO COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Generated Files:"
echo "   • students_sample.csv - Original sample data"
echo "   • class_assignments.csv - Original results"
echo "   • test_*.csv (5 files) - Test scenario inputs"
echo "   • result_*.csv (5 files) - Test scenario outputs"
echo ""
echo "📚 Documentation:"
echo "   • README.md - Implementation details"
echo "   • PROJECT_SUMMARY.md - High-level overview"
echo "   • TESTING_GUIDE.md - How to run tests"
echo "   • TEST_RESULTS.md - Detailed test analysis"
echo ""
echo "🚀 Next Steps:"
echo "   1. Review the CSV files to see actual assignments"
echo "   2. Modify weights in class_solver.py to change priorities"
echo "   3. Create custom test scenarios"
echo "   4. Build a UI for teacher input"
echo ""
echo "💡 Quick Commands:"
echo "   python3 class_solver.py              # Run basic solver"
echo "   python3 run_tests.py                 # Run all tests"
echo "   python3 visualize_results.py <file>  # Visualize results"
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║          Thank you for trying the Class Assignment            ║"
echo "║                    Optimizer Demo!                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
