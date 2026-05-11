"""
Class Assignment Optimizer - Web App
Flask backend for the assignment tool
"""

from flask import Flask, render_template, request, jsonify, send_file
import json
import math
import os
import sys
import io
import zipfile
import socket
import platform
import pandas as pd
from pathlib import Path
from datetime import datetime


def get_resource_path(relative_path):
    """Get absolute path to a resource — works in dev and PyInstaller bundle."""
    if getattr(sys, 'frozen', False):
        base = Path(sys._MEIPASS)
    else:
        base = Path(__file__).parent
    return str(base / relative_path)


def get_data_dir():
    """Return platform-appropriate user data directory."""
    if getattr(sys, 'frozen', False):
        system = platform.system()
        if system == 'Darwin':
            data_dir = Path.home() / 'Library' / 'Application Support' / 'Classify'
        elif system == 'Windows':
            data_dir = Path(os.environ.get('APPDATA', Path.home())) / 'Classify'
        else:
            data_dir = Path.home() / '.config' / 'Classify'
    else:
        data_dir = Path(__file__).parent / 'data'
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def find_free_port():
    """Find an available TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


def format_combinations(n_students, n_classes):
    """Format the number of unordered partitions of n_students into n_classes unlabeled groups."""
    if n_students <= 0 or n_classes <= 1:
        return "1"

    # Distribute students as evenly as possible
    base = n_students // n_classes
    remainder = n_students % n_classes
    sizes = [base + 1] * remainder + [base] * (n_classes - remainder)

    # Compute log10 of n! / (s1! * s2! * ... * sk! * k!)
    log_result = math.lgamma(n_students + 1) / math.log(10)
    for s in sizes:
        log_result -= math.lgamma(s + 1) / math.log(10)
    log_result -= math.log10(math.factorial(n_classes))

    if log_result < 4:
        return f"{int(round(10 ** log_result)):,}"

    # Map exponent to number name (short scale, groups of 10^3)
    names = [
        (303, 'centillion'), (63, 'vigintillion'), (60, 'novemdecillion'),
        (57, 'octodecillion'), (54, 'septendecillion'), (51, 'sexdecillion'),
        (48, 'quindecillion'), (45, 'quattuordecillion'), (42, 'tredecillion'),
        (39, 'duodecillion'), (36, 'undecillion'), (33, 'decillion'),
        (30, 'nonillion'), (27, 'octillion'), (24, 'septillion'),
        (21, 'sextillion'), (18, 'quintillion'), (15, 'quadrillion'),
        (12, 'trillion'), (9, 'billion'), (6, 'million'), (3, 'thousand'),
    ]
    for exp, name in names:
        if log_result >= exp:
            coeff = 10 ** (log_result - exp)
            return f"{coeff:.0f} {name}"

    return f"10^{int(log_result)}"

# Add parent directory to path to import solver (dev mode); PyInstaller bundles it alongside
sys.path.insert(0, str(Path(__file__).parent.parent))
from class_solver_v2 import solve_classes, load_students

app = Flask(__name__,
    template_folder=get_resource_path('templates'),
    static_folder=get_resource_path('static'))
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

DATA_DIR = get_data_dir()

SCHOOL_YEARS_DIR = DATA_DIR / "school_years"
SCHOOL_YEARS_DIR.mkdir(exist_ok=True)

CONFIG_FILE = DATA_DIR / "config.json"

# Legacy files for migration
STUDENTS_FILE = DATA_DIR / "students.json"
ASSIGNMENTS_FILE = DATA_DIR / "assignments.json"


# ============================================================================
# Utility Functions
# ============================================================================

def get_school_year():
    """Calculate current school year (e.g., 2025–26 if it's after July 2025)"""
    now = datetime.now()
    year = now.year
    # School year starts in August/September, so if we're past July, it's the next school year
    if now.month >= 7:
        return f"{year}–{str(year + 1)[-2:]}"
    else:
        return f"{year - 1}–{str(year)[-2:]}"


def get_school_year_file(school_year):
    """Get the file path for a school year's data"""
    # Sanitize the year string for filename (replace – with -)
    safe_year = school_year.replace('–', '-')
    return SCHOOL_YEARS_DIR / f"{safe_year}.json"


def list_school_years():
    """List all available school years"""
    years = []
    for file in SCHOOL_YEARS_DIR.glob("*.json"):
        year_str = file.stem.replace('-', '–')
        years.append(year_str)
    return sorted(years)


def load_school_year_data(school_year):
    """Load data for a specific school year"""
    file_path = get_school_year_file(school_year)
    if file_path.exists():
        with open(file_path, 'r') as f:
            return json.load(f)
    return {}


def save_school_year_data(school_year, data):
    """Save data for a specific school year"""
    file_path = get_school_year_file(school_year)
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2, allow_nan=False)


def migrate_legacy_data(current_year):
    """Migrate old students.json to new school year structure"""
    if STUDENTS_FILE.exists():
        # Load old data
        old_data = load_students_data()

        # Save to current year
        save_school_year_data(current_year, old_data)

        # Rename old file to backup
        STUDENTS_FILE.rename(DATA_DIR / "students.json.backup")
        print(f"Migrated legacy data to {current_year}")


def create_next_school_year(current_year):
    """
    Create next school year by promoting all students up one grade.
    Returns the new school year name.
    """
    # Parse current year (e.g., "2025–26" -> 2025, 2026)
    start_year = int(current_year.split('–')[0])
    next_year = f"{start_year + 1}–{str(start_year + 2)[-2:]}"

    # Load current year data
    current_data = load_school_year_data(current_year)

    # Grade promotion map (K->1st, 1st->2nd, etc.)
    grade_map = {
        'Kindergarten': '1st Grade',
        '1st Grade': '2nd Grade',
        '2nd Grade': '3rd Grade',
        '3rd Grade': '4th Grade',
        '4th Grade': '5th Grade',
        '5th Grade': '6th Grade',
        '6th Grade': '7th Grade',
        '7th Grade': '8th Grade',
        # 8th grade graduates (not promoted)
    }

    # Create new year structure
    next_data = {}

    for grade_name, grade_data in current_data.items():
        # Promote to next grade
        next_grade = grade_map.get(grade_name)
        if next_grade:
            # Copy students and clear assignments
            next_data[next_grade] = {
                'students': grade_data.get('students', []),
                'num_classes': grade_data.get('num_classes', 5),
                'assignments': []  # Clear assignments for new year
            }

    # Create empty Kindergarten for new students
    next_data['Kindergarten'] = {
        'students': [],
        'num_classes': 3,
        'assignments': []
    }

    # Save new year
    save_school_year_data(next_year, next_data)

    return next_year


# ============================================================================
# Default Configuration
# ============================================================================

DEFAULT_CONFIG = {
    "properties": [
        {
            "name": "gender",
            "display_name": "Gender",
            "type": "categorical",
            "values": ["g", "b"],
            "weight": 40,
            "enabled": True,
            "icon": "♀️♂️"
        },
        {
            "name": "behavior",
            "display_name": "Behavior",
            "type": "categorical",
            "values": ["cooperative", "neutral", "disruptive"],
            "weight": 100,
            "enabled": True,
            "icon": "⚠️"
        },
        {
            "name": "independence",
            "display_name": "Independence",
            "type": "categorical",
            "values": ["high", "neutral", "low"],
            "weight": 60,
            "enabled": True,
            "icon": "🎯"
        },
        {
            "name": "iep",
            "display_name": "IEP",
            "type": "boolean",
            "weight": 100,
            "enabled": True,
            "icon": "📋"
        },
        {
            "name": "504",
            "display_name": "504 Plan",
            "type": "boolean",
            "weight": 100,
            "enabled": True,
            "icon": "📄"
        },
        {
            "name": "esl",
            "display_name": "ESL",
            "type": "boolean",
            "weight": 80,
            "enabled": True,
            "icon": "🌐"
        },
        {
            "name": "gate",
            "display_name": "GATE",
            "type": "boolean",
            "weight": 60,
            "enabled": True,
            "icon": "⭐"
        },
        {
            "name": "math",
            "display_name": "Math Level",
            "type": "categorical",
            "values": ["h", "m", "l"],
            "weight": 60,
            "enabled": True,
            "icon": "📐"
        },
        {
            "name": "reading",
            "display_name": "Reading Level",
            "type": "categorical",
            "values": ["h", "m", "l"],
            "weight": 60,
            "enabled": True,
            "icon": "📚"
        },
        {
            "name": "friends",
            "display_name": "Friendships",
            "type": "relationship",
            "weight": 30,
            "enabled": True,
            "icon": "🤝"
        },
        {
            "name": "teacher_uniqueness",
            "display_name": "Teacher uniqueness",
            "type": "hard_toggle",
            "enabled": True,
            "icon": "👩‍🏫"
        }
    ],
    "friend_weight": 30,  # Kept for backward compatibility
    "school_name": "School",
    "school_year": None,  # Will be auto-calculated
    "active_school_year": None,  # Currently selected year for viewing
    "current_school_year": None,  # User-designated "current" year (visual only)
    "available_school_years": [],  # List of all years with data
    "activated": False,
    "activation_code": None
}


# ============================================================================
# Helper Functions
# ============================================================================

def load_config():
    """Load configuration or return default"""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
    else:
        config = DEFAULT_CONFIG.copy()

    # Migrate old config structure to new one
    if 'properties' in config:
        # Check if we need to migrate from old property structure
        old_property_names = {p['name'] for p in config['properties']}
        if 'problematic' in old_property_names or 'special_needs' in old_property_names:
            # Replace with new structure
            config['properties'] = DEFAULT_CONFIG['properties'].copy()
            # Save the migrated config
            save_config(config)

    # Ensure all properties have 'enabled' field
    for prop in config.get('properties', []):
        if 'enabled' not in prop:
            prop['enabled'] = True

    # Ensure friends property exists (migration)
    if 'properties' in config:
        existing_names = {p['name'] for p in config['properties']}
        if 'friends' not in existing_names:
            friends_prop = next((p for p in DEFAULT_CONFIG['properties'] if p['name'] == 'friends'), None)
            if friends_prop:
                config['properties'].append(friends_prop.copy())
                save_config(config)

        # Ensure teacher_uniqueness property exists (migration)
        existing_names = {p['name'] for p in config['properties']}
        if 'teacher_uniqueness' not in existing_names:
            tu_prop = next((p for p in DEFAULT_CONFIG['properties'] if p['name'] == 'teacher_uniqueness'), None)
            if tu_prop:
                config['properties'].append(tu_prop.copy())
                save_config(config)

    # Auto-fill school year if not set
    if not config.get('school_year'):
        config['school_year'] = get_school_year()

    # Ensure school_name exists
    if not config.get('school_name'):
        config['school_name'] = 'School'

    # Update available school years
    config['available_school_years'] = list_school_years()

    # Set active school year to current if not set
    if not config.get('active_school_year'):
        config['active_school_year'] = config['school_year']

    # Migrate legacy data if exists
    migrate_legacy_data(config['school_year'])

    return config


def save_config(config):
    """Save configuration"""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)


def load_students_data():
    """Load all student data"""
    if STUDENTS_FILE.exists():
        with open(STUDENTS_FILE, 'r') as f:
            return json.load(f)
    return {}


def save_students_data(data):
    """Save student data"""
    with open(STUDENTS_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def load_assignments_data():
    """Load assignments"""
    if ASSIGNMENTS_FILE.exists():
        with open(ASSIGNMENTS_FILE, 'r') as f:
            return json.load(f)
    return {}


def save_assignments_data(data):
    """Save assignments"""
    with open(ASSIGNMENTS_FILE, 'w') as f:
        json.dump(data, f, indent=2)


# ============================================================================
# Routes
# ============================================================================

@app.route('/')
def index():
    """Main page"""
    return render_template('homeroom.html')

@app.route('/old')
def old_index():
    """Old interface"""
    return render_template('index.html')


@app.route('/api/onboarding/status', methods=['GET'])
def api_onboarding_status():
    """Check if onboarding is needed"""
    years = list_school_years()
    needs_onboarding = len(years) == 0

    return jsonify({
        'needs_onboarding': needs_onboarding,
        'suggested_year': get_school_year()
    })


@app.route('/api/onboarding/import-roster', methods=['POST'])
def api_onboarding_import():
    """Import entire school roster with grades"""
    data = request.json
    school_year = data.get('school_year')
    roster_data = data.get('roster')  # { 'Kindergarten': [...students], '1st Grade': [...students], ... }

    if not school_year or not roster_data:
        return jsonify({'error': 'Missing school_year or roster data'}), 400

    # Save the roster data for this school year
    year_data = {}
    for grade_name, students in roster_data.items():
        num_students = len(students)
        num_classes = 5 if grade_name != 'Kindergarten' else 3

        # Calculate reasonable defaults based on actual student count
        avg_per_class = num_students / num_classes if num_classes > 0 else 20
        min_students = max(1, int(avg_per_class * 0.8))  # 80% of average
        max_students = int(avg_per_class * 1.2) + 2      # 120% of average + buffer

        year_data[grade_name] = {
            'students': students,
            'num_classes': num_classes,
            'min_students': min_students,
            'max_students': max_students,
            'assignments': []
        }

    save_school_year_data(school_year, year_data)

    # Update config
    config = load_config()
    config['school_year'] = school_year
    config['active_school_year'] = school_year
    config['available_school_years'] = list_school_years()
    save_config(config)

    return jsonify({'status': 'success', 'school_year': school_year})


@app.route('/api/school-years', methods=['GET'])
def api_school_years():
    """Get all available school years"""
    years = list_school_years()
    config = load_config()
    return jsonify({
        'years': years,
        'current': config.get('current_school_year'),
        'active': config['active_school_year']
    })


@app.route('/api/school-years/<school_year>/set-current', methods=['POST'])
def api_set_current_year(school_year):
    """Set the user-designated current school year (visual only)"""
    config = load_config()
    config['current_school_year'] = school_year
    save_config(config)
    return jsonify({'status': 'success', 'current_school_year': school_year})


@app.route('/api/school-years/<school_year>', methods=['POST'])
def api_set_active_year(school_year):
    """Set the active school year for viewing"""
    config = load_config()
    config['active_school_year'] = school_year
    save_config(config)
    return jsonify({'status': 'success', 'active_school_year': school_year})


@app.route('/api/school-years/<school_year>/clear', methods=['POST'])
def api_clear_school_year(school_year):
    """Clear all data for a school year"""
    # Delete the school year file entirely
    file_path = get_school_year_file(school_year)
    if file_path.exists():
        file_path.unlink()

    # Update config
    config = load_config()
    config['available_school_years'] = list_school_years()

    # If there are no more years, clear the active year
    if len(config['available_school_years']) == 0:
        config['active_school_year'] = None

    save_config(config)

    return jsonify({'status': 'success'})


@app.route('/api/school-years/create-next', methods=['POST'])
def api_create_next_year():
    """Create next school year by promoting all students"""
    config = load_config()
    current_year = config['active_school_year']
    next_year = create_next_school_year(current_year)

    # Update config
    config['available_school_years'] = list_school_years()
    config['active_school_year'] = next_year
    save_config(config)

    return jsonify({
        'status': 'success',
        'new_year': next_year,
        'message': f'Created {next_year} with promoted students'
    })


@app.route('/api/school-years/create-next-manual', methods=['POST'])
def api_create_next_year_manual():
    """Create next school year with manually adjusted student data"""
    data = request.json
    next_year = data['year']
    year_data = data['data']

    # Save new year
    save_school_year_data(next_year, year_data)

    # Update config
    config = load_config()
    config['available_school_years'] = list_school_years()
    save_config(config)

    return jsonify({
        'status': 'success',
        'new_year': next_year,
        'message': f'Created {next_year} with {sum(len(g.get("students", [])) for g in year_data.values())} students'
    })


@app.route('/api/grades', methods=['GET'])
def api_grades():
    """Get all grades for active school year"""
    config = load_config()
    active_year = config.get('active_school_year', config['school_year'])
    students_data = load_school_year_data(active_year)

    grades = []
    for grade_name, grade_data in students_data.items():
        students = grade_data.get('students', [])
        has_assignments = len(grade_data.get('assignments', [])) > 0
        grades.append({
            'id': grade_name.lower().replace(' ', '_'),
            'name': grade_name,
            'students': len(students),
            'classes': grade_data.get('num_classes', 5),
            'status': 'assigned' if has_assignments else ('imported' if students else 'empty')
        })
    return jsonify(grades)

@app.route('/api/grades/add-grade', methods=['POST'])
def api_add_grade():
    """Create a new grade in the active school year"""
    data = request.json
    grade_name = data.get('grade_name')
    students = data.get('students', [])

    if not grade_name:
        return jsonify({'error': 'Missing grade_name'}), 400

    config = load_config()
    active_year = config.get('active_school_year', config['school_year'])
    students_data = load_school_year_data(active_year)

    num_classes = 3 if grade_name == 'Kindergarten' else 5
    avg = len(students) / num_classes if num_classes > 0 and students else 20

    students_data[grade_name] = {
        'students': students,
        'num_classes': num_classes,
        'min_students': max(1, int(avg * 0.8)),
        'max_students': int(avg * 1.2) + 2,
        'assignments': []
    }
    save_school_year_data(active_year, students_data)
    return jsonify({'status': 'success', 'count': len(students)})


@app.route('/api/grades/<grade_id>', methods=['DELETE'])
def api_delete_grade(grade_id):
    """Delete a grade from the active school year"""
    config = load_config()
    active_year = config.get('active_school_year', config['school_year'])
    students_data = load_school_year_data(active_year)

    grade_name = None
    for name in students_data.keys():
        if name.lower().replace(' ', '_') == grade_id:
            grade_name = name
            break

    if not grade_name:
        return jsonify({'error': 'Grade not found'}), 404

    del students_data[grade_name]
    save_school_year_data(active_year, students_data)
    return jsonify({'status': 'success'})


@app.route('/api/grades/<grade_id>/students', methods=['GET', 'POST'])
def api_grade_students(grade_id):
    """Get or update students for a grade"""
    config = load_config()
    active_year = config.get('active_school_year', config['school_year'])
    students_data = load_school_year_data(active_year)

    # Find grade by converting ID back to name
    grade_name = None
    for name in students_data.keys():
        if name.lower().replace(' ', '_') == grade_id:
            grade_name = name
            break

    if not grade_name:
        return jsonify({'error': 'Grade not found'}), 404

    if request.method == 'POST':
        # Update students
        data = request.json
        if 'students' in data:
            students_data[grade_name]['students'] = data['students']
            save_school_year_data(active_year, students_data)
            return jsonify({'status': 'success'})
        return jsonify({'error': 'No students data provided'}), 400

    # GET request
    grade_data = students_data[grade_name]
    return jsonify({
        'students': grade_data.get('students', []),
        'num_classes': grade_data.get('num_classes', 5),
        'min_students': grade_data.get('min_students', 18),
        'max_students': grade_data.get('max_students', 26),
        'enforce_class_size': grade_data.get('enforce_class_size', False),
        'teachers': grade_data.get('teachers', []),
        'available_teachers': grade_data.get('available_teachers', []),
    })

@app.route('/api/grades/<grade_id>/assignments', methods=['GET', 'POST'])
def api_grade_assignments(grade_id):
    """Get or update assignments for a grade"""
    config = load_config()
    active_year = config.get('active_school_year', config['school_year'])
    students_data = load_school_year_data(active_year)

    grade_name = None
    for name in students_data.keys():
        if name.lower().replace(' ', '_') == grade_id:
            grade_name = name
            break

    if not grade_name:
        return jsonify({'error': 'Grade not found'}), 404

    if request.method == 'POST':
        # Update assignments (from drag/drop or auto-save)
        data = request.json
        if 'assignments' in data:
            students_data[grade_name]['assignments'] = data['assignments']
            # Only update revert point on explicit saves, not auto-saves from drag/drop
            if data.get('update_baseline', False):
                students_data[grade_name]['solver_baseline'] = data['assignments'].copy()
            save_school_year_data(active_year, students_data)
            return jsonify({'status': 'success'})
        return jsonify({'error': 'No assignments data provided'}), 400

    # GET request
    grade_data = students_data[grade_name]
    return jsonify({
        'assignments': grade_data.get('assignments', []),
        'solver_baseline': grade_data.get('solver_baseline', []),
        'num_classes': grade_data.get('num_classes', 5),
        'solver_status': grade_data.get('solver_status'),
        'solver_elapsed': grade_data.get('solver_elapsed'),
        'solver_combinations': grade_data.get('solver_combinations'),
        'class_names': grade_data.get('class_names', {}),
    })


@app.route('/api/grades/<grade_id>/assignments/revert', methods=['POST'])
def api_revert_assignments(grade_id):
    """Revert assignments to solver baseline"""
    config = load_config()
    active_year = config.get('active_school_year', config['school_year'])
    students_data = load_school_year_data(active_year)

    grade_name = None
    for name in students_data.keys():
        if name.lower().replace(' ', '_') == grade_id:
            grade_name = name
            break

    if not grade_name:
        return jsonify({'error': 'Grade not found'}), 404

    grade_data = students_data[grade_name]
    solver_baseline = grade_data.get('solver_baseline', [])

    if not solver_baseline:
        return jsonify({'error': 'No solver baseline found'}), 404

    # Revert to baseline
    students_data[grade_name]['assignments'] = solver_baseline.copy()
    save_school_year_data(active_year, students_data)

    return jsonify({'status': 'success', 'assignments': solver_baseline})


@app.route('/api/grades/<grade_id>/class-names', methods=['POST'])
def api_save_class_names(grade_id):
    """Save custom class names"""
    config = load_config()
    active_year = config.get('active_school_year', config['school_year'])
    students_data = load_school_year_data(active_year)

    grade_name = None
    for name in students_data.keys():
        if name.lower().replace(' ', '_') == grade_id:
            grade_name = name
            break

    if not grade_name:
        return jsonify({'error': 'Grade not found'}), 404

    data = request.json or {}
    students_data[grade_name]['class_names'] = data.get('class_names', {})
    save_school_year_data(active_year, students_data)
    return jsonify({'status': 'success'})


@app.route('/api/grades/<grade_id>/settings', methods=['POST'])
def api_update_grade_settings(grade_id):
    """Update grade settings (num_classes, min/max students)"""
    config = load_config()
    active_year = config.get('active_school_year', config['school_year'])
    students_data = load_school_year_data(active_year)

    # Find grade
    grade_name = None
    for name in students_data.keys():
        if name.lower().replace(' ', '_') == grade_id:
            grade_name = name
            break

    if not grade_name:
        return jsonify({'error': 'Grade not found'}), 404

    # Update settings
    data = request.json
    if 'num_classes' in data:
        students_data[grade_name]['num_classes'] = data['num_classes']
    if 'min_students' in data:
        students_data[grade_name]['min_students'] = data['min_students']
    if 'max_students' in data:
        students_data[grade_name]['max_students'] = data['max_students']
    if 'enforce_class_size' in data:
        students_data[grade_name]['enforce_class_size'] = data['enforce_class_size']
    if 'teachers' in data:
        students_data[grade_name]['teachers'] = data['teachers']
    if 'available_teachers' in data:
        students_data[grade_name]['available_teachers'] = data['available_teachers']

    save_school_year_data(active_year, students_data)
    return jsonify({'status': 'success'})


@app.route('/api/export-data', methods=['GET'])
def api_export_data():
    """Export all school data as a .classify zip file"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        if CONFIG_FILE.exists():
            zf.write(CONFIG_FILE, 'config.json')
        if SCHOOL_YEARS_DIR.exists():
            for f in SCHOOL_YEARS_DIR.glob('*.json'):
                zf.write(f, f'school_years/{f.name}')
    buf.seek(0)
    timestamp = datetime.now().strftime('%Y%m%d')
    return send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'classify-backup-{timestamp}.classify'
    )


@app.route('/api/import-data', methods=['POST'])
def api_import_data():
    """Import a .classify backup file, restoring all school data"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    f = request.files['file']
    if not f.filename.endswith('.classify'):
        return jsonify({'error': 'Invalid file type'}), 400
    try:
        with zipfile.ZipFile(io.BytesIO(f.read())) as zf:
            names = zf.namelist()
            if 'config.json' in names:
                # Preserve current activation status — don't overwrite it
                current_config = {}
                if CONFIG_FILE.exists():
                    with open(CONFIG_FILE) as cf:
                        current_config = json.load(cf)
                imported = json.loads(zf.read('config.json'))
                imported['activated'] = current_config.get('activated', False)
                imported['activation_code'] = current_config.get('activation_code')
                with open(CONFIG_FILE, 'w') as cf:
                    json.dump(imported, cf, indent=2)
            SCHOOL_YEARS_DIR.mkdir(exist_ok=True)
            for name in names:
                if name.startswith('school_years/') and name.endswith('.json'):
                    dest = SCHOOL_YEARS_DIR / Path(name).name
                    dest.write_bytes(zf.read(name))
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': f'Failed to import: {str(e)}'}), 400


@app.route('/api/activation-status', methods=['GET'])
def api_activation_status():
    """Check whether this installation has been activated"""
    config = load_config()
    return jsonify({'activated': config.get('activated', False)})


@app.route('/api/activate', methods=['POST'])
def api_activate():
    """Save activation after frontend has validated code with Supabase"""
    data = request.json or {}
    code = data.get('code', '').strip()
    if not code:
        return jsonify({'error': 'No code provided'}), 400
    config = load_config()
    config['activated'] = True
    config['activation_code'] = code
    save_config(config)
    return jsonify({'status': 'success'})


@app.route('/api/config', methods=['GET', 'POST'])
def api_config():
    """Get or update configuration"""
    if request.method == 'GET':
        return jsonify(load_config())

    elif request.method == 'POST':
        config = request.json
        save_config(config)
        return jsonify({"status": "success"})


@app.route('/api/students', methods=['GET'])
def api_students():
    """Get all students"""
    return jsonify(load_students_data())


@app.route('/api/students/<grade>', methods=['GET', 'POST', 'DELETE'])
def api_students_grade(grade):
    """Get, update, or delete students for a specific grade"""
    data = load_students_data()

    if request.method == 'GET':
        return jsonify(data.get(grade, {
            "students": [],
            "num_classes": 5
        }))

    elif request.method == 'POST':
        data[grade] = request.json
        save_students_data(data)
        return jsonify({"status": "success"})

    elif request.method == 'DELETE':
        if grade in data:
            del data[grade]
            save_students_data(data)
        return jsonify({"status": "success"})


@app.route('/api/import/preview', methods=['POST'])
def api_import_preview():
    """Preview CSV and suggest column mappings"""
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    try:
        # Read CSV
        df = pd.read_csv(file)

        # Get column names
        columns = df.columns.tolist()

        # Preview first 5 rows
        preview = df.head(5).to_dict('records')

        # Auto-detect mappings
        config = load_config()
        property_names = [p['name'] for p in config['properties']]

        mappings = auto_detect_columns(columns, property_names)

        return jsonify({
            "columns": columns,
            "preview": preview,
            "suggested_mappings": mappings,
            "row_count": len(df)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/import/confirm', methods=['POST'])
def api_import_confirm():
    """Import CSV with confirmed mappings"""
    data = request.json
    grade = data.get('grade')
    mappings = data.get('mappings')
    csv_data = data.get('csv_data')
    num_classes = data.get('num_classes', 5)

    try:
        # Convert CSV data to student objects
        students = []
        for row in csv_data:
            student = {
                "name": row.get(mappings.get('name', 'name'), ''),
            }

            # Map each property
            config = load_config()
            for prop in config['properties']:
                prop_name = prop['name']
                csv_col = mappings.get(prop_name)
                if csv_col and csv_col in row:
                    student[prop_name] = str(row[csv_col]).lower()
                else:
                    # Default value
                    student[prop_name] = prop['values'][0] if prop['values'] else ''

            # Friends and incompatibles
            friends_col = mappings.get('friends')
            if friends_col and friends_col in row and row[friends_col]:
                student['friends'] = str(row[friends_col])
            else:
                student['friends'] = ''

            incomp_col = mappings.get('incompatible')
            if incomp_col and incomp_col in row and row[incomp_col]:
                student['incompatible'] = str(row[incomp_col])
            else:
                student['incompatible'] = ''

            students.append(student)

        # Save to students data
        all_students = load_students_data()
        all_students[grade] = {
            "students": students,
            "num_classes": num_classes
        }
        save_students_data(all_students)

        return jsonify({
            "status": "success",
            "count": len(students)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/assign/<grade_id>', methods=['POST'])
def api_assign(grade_id):
    """Run the assignment solver for a grade"""
    try:
        # Get students for this grade using new storage
        config = load_config()
        active_year = config.get('active_school_year', config['school_year'])
        students_data = load_school_year_data(active_year)

        # Find grade name from ID
        grade_name = None
        for name in students_data.keys():
            if name.lower().replace(' ', '_') == grade_id:
                grade_name = name
                break

        if not grade_name:
            return jsonify({"error": "Grade not found"}), 404

        grade_data = students_data[grade_name]
        students = grade_data.get('students', [])
        num_classes = grade_data.get('num_classes', 5)
        min_students = grade_data.get('min_students', 18)
        max_students = grade_data.get('max_students', 26)
        enforce_class_size = grade_data.get('enforce_class_size', False)

        if len(students) == 0:
            return jsonify({"error": "No students to assign"}), 400

        # Get properties config
        properties_config = config.get('properties', [])

        # Get teacher uniqueness setting
        teacher_uniqueness_prop = next((p for p in properties_config if p.get('name') == 'teacher_uniqueness'), None)
        enforce_teacher_uniqueness = teacher_uniqueness_prop and teacher_uniqueness_prop.get('enabled', True)
        available_teachers = grade_data.get('available_teachers', []) if enforce_teacher_uniqueness else []
        teachers = []  # legacy static mode no longer used when available_teachers present

        # Convert to CSV format for solver
        # Use absolute paths to avoid issues with directory changes
        temp_input = (DATA_DIR / f"temp_{grade_id}_input.csv").resolve()
        temp_output = (DATA_DIR / f"temp_{grade_id}_output.csv").resolve()

        df = pd.DataFrame(students)
        df.to_csv(temp_input, index=False)

        # Change to parent directory where solver is located
        import os
        original_dir = os.getcwd()
        os.chdir(Path(__file__).parent.parent)

        try:
            # Run solver with custom parameters - use absolute paths
            print(f"Running solver with input: {temp_input}, output: {temp_output}")
            solver_result = solve_classes(
                str(temp_input),
                str(temp_output),
                num_classes=num_classes,
                min_students=min_students,
                max_students=max_students,
                enforce_class_size=enforce_class_size,
                properties_config=properties_config,
                available_teachers=available_teachers,
            )
            print(f"Solver completed: {solver_result}")
        except Exception as solver_error:
            os.chdir(original_dir)
            raise Exception(f"Solver failed: {solver_error}")
        finally:
            os.chdir(original_dir)

        # Check if output file was created (shouldn't happen since solver raises on failure, but safety check)
        if not temp_output.exists():
            raise Exception(f"Solver did not produce output for {num_classes} classes. Check server logs for details.")

        # Read results — replace NaN with None so JSON serializes as null not NaN
        results_df = pd.read_csv(temp_output)
        assignments = results_df.where(pd.notnull(results_df), None).to_dict('records')

        combinations = format_combinations(len(students), num_classes)

        # Save assignments back to school year data
        students_data[grade_name]['assignments'] = assignments
        students_data[grade_name]['solver_baseline'] = assignments.copy()
        students_data[grade_name]['solver_status'] = solver_result.get('status') if solver_result else None
        students_data[grade_name]['solver_elapsed'] = solver_result.get('elapsed') if solver_result else None
        students_data[grade_name]['solver_combinations'] = combinations
        # Save auto-assigned teachers if the solver produced them
        teacher_assignments = solver_result.get('teacher_assignments', []) if solver_result else []
        if teacher_assignments:
            students_data[grade_name]['teachers'] = teacher_assignments
        save_school_year_data(active_year, students_data)

        # Clean up temp files
        temp_input.unlink()
        temp_output.unlink()

        return jsonify({
            "status": "success",
            "assignments": assignments,
            "num_classes": num_classes,
            "student_count": len(students),
            "solver_status": solver_result.get('status') if solver_result else None,
            "elapsed": solver_result.get('elapsed') if solver_result else None,
            "combinations": combinations,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/assignments/<grade>', methods=['GET'])
def api_assignments_grade(grade):
    """Get assignments for a grade"""
    all_assignments = load_assignments_data()
    return jsonify(all_assignments.get(grade, []))


def auto_detect_columns(csv_columns, property_names):
    """Auto-detect column mappings"""
    mappings = {}

    # Convert to lowercase for matching
    csv_lower = {col.lower(): col for col in csv_columns}

    # Name detection
    for pattern in ['name', 'student', 'student_name', 'first_name', 'firstname']:
        if pattern in csv_lower:
            mappings['name'] = csv_lower[pattern]
            break

    # Property detection
    for prop in property_names:
        if prop in csv_lower:
            mappings[prop] = csv_lower[prop]
        elif prop + '_level' in csv_lower:
            mappings[prop] = csv_lower[prop + '_level']

    # Friends
    for pattern in ['friends', 'friend', 'friend_list']:
        if pattern in csv_lower:
            mappings['friends'] = csv_lower[pattern]
            break

    # Incompatible
    for pattern in ['incompatible', 'cannot_be_with', 'separate']:
        if pattern in csv_lower:
            mappings['incompatible'] = csv_lower[pattern]
            break

    return mappings


if __name__ == '__main__':
    # If launched by Electron, use a random port and signal readiness via stdout
    if os.environ.get('CLASSIFY_ELECTRON'):
        port = find_free_port()
        # Flush immediately so Electron can read it
        print(f'CLASSIFY_PORT:{port}', flush=True)
        app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False)
    else:
        print("\n" + "="*60)
        print("Classify - Class Assignment Optimizer")
        print("="*60)
        print("\nStarting server on http://localhost:5001")
        print("\nPress Ctrl+C to stop\n")
        app.run(debug=True, port=5001)
