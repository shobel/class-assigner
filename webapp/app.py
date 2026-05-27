"""
Class Assignment Optimizer - Web App
Flask backend for the assignment tool
"""

from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for
import json
import math
import os
import sys
import io
import uuid
import zipfile
import socket
import platform
import sqlite3
import secrets
import pandas as pd
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime, timedelta
import threading
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash as _gen_hash

def generate_password_hash(password):
    return _gen_hash(password, method='pbkdf2:sha256')

__version__ = '1.1.1'
_UPDATE_URL = 'https://shobel.github.io/classify-website/releases/latest.json'

# Sentinel stored in password column for accounts awaiting invite setup
_INVITE_PENDING = '__invite_pending__'


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


def find_free_port(preferred=5001):
    """Return preferred port if available, otherwise any free port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('', preferred))
            return preferred
        except OSError:
            s.bind(('', 0))
            return s.getsockname()[1]


def get_local_ip():
    """Get the machine's local network IP address."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('8.8.8.8', 80))
            return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'


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

# SQLite database (single file, replaces all JSON files)
DB_FILE = DATA_DIR / "classify.db"
_db_write_lock = threading.Lock()

# Legacy JSON paths — kept only for one-time migration detection
_LEGACY_CONFIG_FILE   = DATA_DIR / "config.json"
_LEGACY_HISTORY_FILE  = DATA_DIR / "history.json"
_LEGACY_YEARS_DIR     = DATA_DIR / "school_years"
_LEGACY_STUDENTS_FILE = DATA_DIR / "students.json"

# ============================================================================
# Multi-User Sync State
# ============================================================================

# Per-grade lock state: {grade_id: {session_id, held_by, acquired_at, expires}}
active_locks = {}
lock_mutex = threading.Lock()

# Last modification timestamp for sync
last_modified = {
    'timestamp': datetime.now().isoformat(),
    'changed_by': None,
    'scope': None,
}
sync_mutex = threading.Lock()

# Session registry: session_id -> display name (populated from lock acquire)
session_registry = {}


# ============================================================================
# Database Initialisation & Access
# ============================================================================

@contextmanager
def get_db():
    """Yield a SQLite connection with WAL mode and row_factory set."""
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


_SCHEMA_VERSION = 2  # Bump when schema changes

def init_db():
    """Create tables if they don't exist yet, and run incremental migrations."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS config (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS school_years (
                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            );

            -- One row per grade per school year.
            -- Complex / dynamic fields stored as JSON text columns.
            CREATE TABLE IF NOT EXISTS grades (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                school_year_id     INTEGER NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
                name               TEXT    NOT NULL,
                num_classes        INTEGER NOT NULL DEFAULT 5,
                min_students       INTEGER NOT NULL DEFAULT 18,
                max_students       INTEGER NOT NULL DEFAULT 26,
                enforce_class_size INTEGER NOT NULL DEFAULT 0,
                assignment_stale   INTEGER NOT NULL DEFAULT 0,
                solver_status      TEXT,
                solver_elapsed     REAL,
                solver_combinations TEXT,
                class_names        TEXT    NOT NULL DEFAULT '{}',
                custom_rules       TEXT,
                teachers           TEXT    NOT NULL DEFAULT '[]',
                available_teachers TEXT    NOT NULL DEFAULT '[]',
                assignment_config  TEXT,
                students           TEXT    NOT NULL DEFAULT '[]',
                assignments        TEXT    NOT NULL DEFAULT '[]',
                solver_baseline    TEXT    NOT NULL DEFAULT '[]',
                UNIQUE(school_year_id, name)
            );

            CREATE TABLE IF NOT EXISTS history (
                id           TEXT PRIMARY KEY,
                timestamp    TEXT NOT NULL,
                session_name TEXT,
                category     TEXT NOT NULL,
                action       TEXT NOT NULL,
                grade        TEXT,
                details      TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT    UNIQUE NOT NULL,
                password   TEXT,
                is_admin   INTEGER NOT NULL DEFAULT 0,
                created_at TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS invite_codes (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                code_hash  TEXT    NOT NULL,
                expires_at TEXT    NOT NULL,
                used_at    TEXT
            );
        """)

    _run_migrations()


def _run_migrations():
    """Apply incremental schema migrations based on stored version."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT value FROM config WHERE key = 'schema_version'"
        ).fetchone()
        current = int(row['value']) if row else 1

    if current >= _SCHEMA_VERSION:
        return

    with _db_write_lock:
        with get_db() as conn:
            if current < 2:
                # v2: invite_codes table (already created above via IF NOT EXISTS)
                # v2: users.password may need NOT NULL removed on old databases
                cols = conn.execute("PRAGMA table_info(users)").fetchall()
                pw_col = next((c for c in cols if c['name'] == 'password'), None)
                if pw_col and pw_col['notnull']:
                    # Recreate users table to drop NOT NULL on password.
                    # Use legacy_alter_table so SQLite doesn't rewrite FK references
                    # in other tables (e.g. invite_codes) to point at _users_old.
                    conn.executescript("""
                        PRAGMA legacy_alter_table = ON;
                        ALTER TABLE users RENAME TO _users_old;
                        CREATE TABLE users (
                            id         INTEGER PRIMARY KEY AUTOINCREMENT,
                            username   TEXT    UNIQUE NOT NULL,
                            password   TEXT,
                            is_admin   INTEGER NOT NULL DEFAULT 0,
                            created_at TEXT    NOT NULL
                        );
                        INSERT INTO users (id, username, password, is_admin, created_at)
                            SELECT id, username, password, is_admin, created_at FROM _users_old;
                        DROP TABLE _users_old;
                        PRAGMA legacy_alter_table = OFF;
                    """)

            conn.execute(
                "INSERT OR REPLACE INTO config (key, value) VALUES ('schema_version', ?)",
                (str(_SCHEMA_VERSION),)
            )


def _row_to_grade_data(row):
    """Convert a grades table sqlite3.Row to a grade_data dict."""
    return {
        'num_classes':        row['num_classes'],
        'min_students':       row['min_students'],
        'max_students':       row['max_students'],
        'enforce_class_size': bool(row['enforce_class_size']),
        'assignment_stale':   bool(row['assignment_stale']),
        'solver_status':      row['solver_status'],
        'solver_elapsed':     row['solver_elapsed'],
        'solver_combinations':row['solver_combinations'],
        'class_names':        json.loads(row['class_names'] or '{}'),
        'custom_rules':       json.loads(row['custom_rules']) if row['custom_rules'] else None,
        'teachers':           json.loads(row['teachers'] or '[]'),
        'available_teachers': json.loads(row['available_teachers'] or '[]'),
        'assignment_config':  json.loads(row['assignment_config']) if row['assignment_config'] else None,
        'students':           json.loads(row['students'] or '[]'),
        'assignments':        json.loads(row['assignments'] or '[]'),
        'solver_baseline':    json.loads(row['solver_baseline'] or '[]'),
    }


def _grade_data_params(grade_data):
    """Return a tuple of all updateable grade_data values, in column order."""
    return (
        grade_data.get('num_classes', 5),
        grade_data.get('min_students', 18),
        grade_data.get('max_students', 26),
        int(grade_data.get('enforce_class_size', False)),
        int(grade_data.get('assignment_stale', False)),
        grade_data.get('solver_status'),
        grade_data.get('solver_elapsed'),
        grade_data.get('solver_combinations'),
        json.dumps(grade_data.get('class_names') or {}),
        json.dumps(grade_data['custom_rules']) if grade_data.get('custom_rules') else None,
        json.dumps(grade_data.get('teachers') or []),
        json.dumps(grade_data.get('available_teachers') or []),
        json.dumps(grade_data['assignment_config']) if grade_data.get('assignment_config') else None,
        json.dumps(grade_data.get('students') or [], allow_nan=False),
        json.dumps(grade_data.get('assignments') or [], allow_nan=False),
        json.dumps(grade_data.get('solver_baseline') or [], allow_nan=False),
    )


# ============================================================================
# Utility Functions
# ============================================================================

def get_school_year():
    """Calculate current school year (e.g., 2025–26 if it's after July 2025)"""
    now = datetime.now()
    year = now.year
    if now.month >= 7:
        return f"{year}–{str(year + 1)[-2:]}"
    else:
        return f"{year - 1}–{str(year)[-2:]}"


def list_school_years():
    """List all available school years from the database."""
    with get_db() as conn:
        rows = conn.execute("SELECT name FROM school_years ORDER BY name").fetchall()
    return [r['name'] for r in rows]


def load_school_year_data(school_year):
    """Load all grade data for a school year as a dict keyed by grade name."""
    with get_db() as conn:
        sy = conn.execute(
            "SELECT id FROM school_years WHERE name = ?", (school_year,)
        ).fetchone()
        if not sy:
            return {}
        rows = conn.execute(
            "SELECT * FROM grades WHERE school_year_id = ?", (sy['id'],)
        ).fetchall()
    return {r['name']: _row_to_grade_data(r) for r in rows}


def save_school_year_data(school_year, data):
    """Persist the full grade dict for a school year to SQLite."""
    with _db_write_lock:
        with get_db() as conn:
            # Ensure school year row exists
            sy = conn.execute(
                "SELECT id FROM school_years WHERE name = ?", (school_year,)
            ).fetchone()
            if sy:
                sy_id = sy['id']
            else:
                conn.execute("INSERT INTO school_years (name) VALUES (?)", (school_year,))
                sy_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

            # Current grade names in DB
            existing = {
                r['name']: r['id']
                for r in conn.execute(
                    "SELECT id, name FROM grades WHERE school_year_id = ?", (sy_id,)
                ).fetchall()
            }

            # Remove grades that are no longer in data
            for name in list(existing):
                if name not in data:
                    conn.execute("DELETE FROM grades WHERE id = ?", (existing[name],))

            # Upsert each grade
            for grade_name, grade_data in data.items():
                params = _grade_data_params(grade_data)
                if grade_name in existing:
                    conn.execute("""
                        UPDATE grades SET
                            num_classes=?, min_students=?, max_students=?,
                            enforce_class_size=?, assignment_stale=?,
                            solver_status=?, solver_elapsed=?, solver_combinations=?,
                            class_names=?, custom_rules=?,
                            teachers=?, available_teachers=?,
                            assignment_config=?, students=?, assignments=?, solver_baseline=?
                        WHERE id=?
                    """, params + (existing[grade_name],))
                else:
                    conn.execute("""
                        INSERT INTO grades (
                            school_year_id, name,
                            num_classes, min_students, max_students,
                            enforce_class_size, assignment_stale,
                            solver_status, solver_elapsed, solver_combinations,
                            class_names, custom_rules,
                            teachers, available_teachers,
                            assignment_config, students, assignments, solver_baseline
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (sy_id, grade_name) + params)


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


def migrate_from_json():
    """One-time migration: import legacy JSON files into the SQLite database."""
    migrated = False

    # Config
    if _LEGACY_CONFIG_FILE.exists():
        try:
            with open(_LEGACY_CONFIG_FILE) as f:
                cfg = json.load(f)
            save_config(cfg)
            _LEGACY_CONFIG_FILE.rename(_LEGACY_CONFIG_FILE.with_suffix('.json.migrated'))
            migrated = True
        except Exception as e:
            print(f"Warning: could not migrate config.json: {e}")

    # School years
    if _LEGACY_YEARS_DIR.exists():
        for jf in _LEGACY_YEARS_DIR.glob("*.json"):
            try:
                year_str = jf.stem.replace('-', '–')
                with open(jf) as f:
                    data = json.load(f)
                save_school_year_data(year_str, data)
                jf.rename(jf.with_suffix('.json.migrated'))
                migrated = True
            except Exception as e:
                print(f"Warning: could not migrate {jf.name}: {e}")

    # History
    if _LEGACY_HISTORY_FILE.exists():
        try:
            with open(_LEGACY_HISTORY_FILE) as f:
                history = json.load(f)
            with _db_write_lock:
                with get_db() as conn:
                    for entry in history:
                        conn.execute(
                            """INSERT OR IGNORE INTO history
                               (id, timestamp, session_name, category, action, grade, details)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (
                                entry.get('id', str(uuid.uuid4())),
                                entry['timestamp'],
                                entry.get('session_name'),
                                entry['category'],
                                entry['action'],
                                entry.get('grade'),
                                json.dumps(entry.get('details', {})),
                            ),
                        )
            _LEGACY_HISTORY_FILE.rename(_LEGACY_HISTORY_FILE.with_suffix('.json.migrated'))
            migrated = True
        except Exception as e:
            print(f"Warning: could not migrate history.json: {e}")

    if migrated:
        print("Migrated legacy JSON data to SQLite.")


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
    """Load configuration from SQLite, applying defaults and migrations."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT value FROM config WHERE key = 'config'"
        ).fetchone()
    config = json.loads(row['value']) if row else DEFAULT_CONFIG.copy()

    # Migrate old property names
    if 'properties' in config:
        old_names = {p['name'] for p in config['properties']}
        if 'problematic' in old_names or 'special_needs' in old_names:
            config['properties'] = DEFAULT_CONFIG['properties'].copy()
            save_config(config)

    # Ensure enabled field on all properties
    for prop in config.get('properties', []):
        if 'enabled' not in prop:
            prop['enabled'] = True

    # Ensure friends / teacher_uniqueness properties exist
    if 'properties' in config:
        for prop_name in ('friends', 'teacher_uniqueness'):
            if prop_name not in {p['name'] for p in config['properties']}:
                default_prop = next(
                    (p for p in DEFAULT_CONFIG['properties'] if p['name'] == prop_name), None
                )
                if default_prop:
                    config['properties'].append(default_prop.copy())
                    save_config(config)

    if not config.get('school_year'):
        config['school_year'] = get_school_year()
    if not config.get('school_name'):
        config['school_name'] = 'School'
    if not config.get('active_school_year'):
        config['active_school_year'] = config['school_year']

    config['available_school_years'] = list_school_years()
    return config


def save_config(config):
    """Persist configuration to SQLite (strips derived available_school_years)."""
    to_save = {k: v for k, v in config.items() if k != 'available_school_years'}
    with _db_write_lock:
        with get_db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO config (key, value) VALUES ('config', ?)",
                (json.dumps(to_save),),
            )


# Legacy stubs — used by old /api/students routes that still reference STUDENTS_FILE.
# These routes are effectively unused in the new UI but kept to avoid breaking anything.
def load_students_data():
    if _LEGACY_STUDENTS_FILE.exists():
        with open(_LEGACY_STUDENTS_FILE) as f:
            return json.load(f)
    return {}

def save_students_data(data):
    with open(_LEGACY_STUDENTS_FILE, 'w') as f:
        json.dump(data, f, indent=2)


# ============================================================================
# History / Action Log
# ============================================================================

def log_action(session_id, category, action, grade=None, details=None):
    """Append an action entry to the history table, capped at 2000 rows."""
    with _db_write_lock:
        with get_db() as conn:
            conn.execute(
                """INSERT INTO history (id, timestamp, session_name, category, action, grade, details)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()),
                    datetime.now().isoformat(),
                    session_registry.get(session_id, 'Unknown'),
                    category,
                    action,
                    grade,
                    json.dumps(details or {}),
                ),
            )
            # Keep only the 2000 most recent rows
            conn.execute("""
                DELETE FROM history WHERE id NOT IN (
                    SELECT id FROM history ORDER BY timestamp DESC LIMIT 2000
                )
            """)


# ============================================================================
# Multi-User Sync Helpers
# ============================================================================

def update_last_modified(changed_by=None, scope=None):
    """Update last modified timestamp for sync"""
    global last_modified
    with sync_mutex:
        last_modified = {
            'timestamp': datetime.now().isoformat(),
            'changed_by': changed_by,
            'scope': scope,
        }



def load_assignments_data():
    """Legacy stub — old assignments.json is no longer used."""
    _legacy = DATA_DIR / "assignments.json"
    if _legacy.exists():
        with open(_legacy) as f:
            return json.load(f)
    return {}


def save_assignments_data(data):
    """Legacy stub — no-op under SQLite storage."""
    pass


# Initialise DB and migrate any legacy JSON files — runs once at startup.
init_db()
migrate_from_json()

# Load or generate a persistent secret key for Flask sessions.
def _get_or_create_secret_key():
    with get_db() as conn:
        row = conn.execute(
            "SELECT value FROM config WHERE key = 'secret_key'"
        ).fetchone()
        if row:
            return row['value']
        key = secrets.token_hex(32)
        conn.execute(
            "INSERT INTO config (key, value) VALUES ('secret_key', ?)", (key,)
        )
    return key

app.secret_key = _get_or_create_secret_key()

# ============================================================================
# Auth helpers
# ============================================================================

def _count_users():
    with get_db() as conn:
        return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

def _get_user_by_id(uid):
    with get_db() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()

def current_user():
    uid = session.get('user_id')
    return _get_user_by_id(uid) if uid else None


@app.before_request
def require_login():
    """Block unauthenticated access to everything except login and static files."""
    public = {'login', 'logout', 'static', 'setup', 'admin_recovery', 'health'}
    if request.endpoint in public:
        return None
    if not session.get('user_id'):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Not authenticated'}), 401
        return redirect(url_for('login', next=request.path))


# ============================================================================
# Routes
# ============================================================================

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login page — also handles first-run account creation."""
    is_setup = _count_users() == 0
    error = None

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')

        if is_setup:
            # First run: create admin account
            confirm = request.form.get('confirm_password', '')
            if not username:
                error = 'Username is required.'
            elif len(password) < 6:
                error = 'Password must be at least 6 characters.'
            elif password != confirm:
                error = 'Passwords do not match.'
            else:
                with _db_write_lock:
                    with get_db() as conn:
                        conn.execute(
                            "INSERT INTO users (username, password, is_admin, created_at) VALUES (?, ?, 1, ?)",
                            (username, generate_password_hash(password), datetime.now().isoformat())
                        )
                with get_db() as conn:
                    user = conn.execute(
                        "SELECT * FROM users WHERE username = ?", (username,)
                    ).fetchone()
                session.permanent = True
                session['user_id'] = user['id']
                session['username'] = user['username']
                session['is_admin'] = bool(user['is_admin'])
                return redirect(request.args.get('next') or '/')
        else:
            # Normal login
            with get_db() as conn:
                user = conn.execute(
                    "SELECT * FROM users WHERE username = ?", (username,)
                ).fetchone()
            if user and user['password'] and user['password'] != _INVITE_PENDING and check_password_hash(user['password'], password):
                remember = bool(request.form.get('remember'))
                session.permanent = remember
                session['user_id'] = user['id']
                session['username'] = user['username']
                session['is_admin'] = bool(user['is_admin'])
                return redirect(request.args.get('next') or '/')
            elif user and user['password'] == _INVITE_PENDING:
                error = 'Account setup not complete. Use your invite code at /setup to set your password.'
            else:
                error = 'Invalid username or password.'

    return render_template('login.html', is_setup=is_setup, error=error)


@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('login'))


# ============================================================================
# User management API
# ============================================================================

@app.route('/api/users', methods=['GET'])
def api_list_users():
    if not session.get('is_admin'):
        return jsonify({'error': 'Admin only'}), 403
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, username, password, is_admin, created_at FROM users ORDER BY id"
        ).fetchall()
    return jsonify([{
        'id': r['id'],
        'username': r['username'] if not r['username'].startswith('_invite_') else None,
        'is_admin': bool(r['is_admin']), 'created_at': r['created_at'],
        'has_password': bool(r['password'] and r['password'] != _INVITE_PENDING),
        'pending': r['username'].startswith('_invite_'),
    } for r in rows])


@app.route('/api/users', methods=['POST'])
def api_create_user():
    if not session.get('is_admin'):
        return jsonify({'error': 'Admin only'}), 403
    data = request.json or {}
    is_admin = bool(data.get('is_admin', False))

    # Placeholder username replaced by the teacher during setup
    temp_username = f'_invite_{secrets.token_hex(6)}'
    raw_code = secrets.token_urlsafe(12)
    code_hash = generate_password_hash(raw_code)
    expires_at = (datetime.now() + timedelta(days=7)).isoformat()

    with _db_write_lock:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (username, password, is_admin, created_at) VALUES (?, ?, ?, ?)",
                (temp_username, _INVITE_PENDING, int(is_admin), datetime.now().isoformat())
            )
            user_id = conn.execute("SELECT id FROM users WHERE username = ?", (temp_username,)).fetchone()['id']
            conn.execute(
                "INSERT INTO invite_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)",
                (user_id, code_hash, expires_at)
            )
    return jsonify({'status': 'success', 'invite_code': raw_code})


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def api_delete_user(user_id):
    if not session.get('is_admin'):
        return jsonify({'error': 'Admin only'}), 403
    if user_id == session.get('user_id'):
        return jsonify({'error': "Can't delete your own account"}), 400
    with _db_write_lock:
        with get_db() as conn:
            conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return jsonify({'status': 'success'})


@app.route('/api/users/<int:user_id>/invite', methods=['POST'])
def api_regenerate_invite(user_id):
    """Generate a new invite code for a user (admin only)."""
    if not session.get('is_admin'):
        return jsonify({'error': 'Admin only'}), 403
    raw_code = secrets.token_urlsafe(12)
    code_hash = generate_password_hash(raw_code)
    expires_at = (datetime.now() + timedelta(days=7)).isoformat()
    with _db_write_lock:
        with get_db() as conn:
            # Invalidate old unused codes for this user
            conn.execute(
                "DELETE FROM invite_codes WHERE user_id = ? AND used_at IS NULL", (user_id,)
            )
            conn.execute(
                "INSERT INTO invite_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)",
                (user_id, code_hash, expires_at)
            )
    return jsonify({'status': 'success', 'invite_code': raw_code})


@app.route('/api/users/<int:user_id>/password', methods=['POST'])
def api_change_password(user_id):
    is_self = user_id == session.get('user_id')
    is_admin = session.get('is_admin')
    if not is_self and not is_admin:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.json or {}
    new_password = data.get('new_password', '')
    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    if is_self and not is_admin:
        # Require current password for non-admins changing their own
        current = data.get('current_password', '')
        with get_db() as conn:
            user = conn.execute("SELECT password FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user or not check_password_hash(user['password'], current):
            return jsonify({'error': 'Current password is incorrect'}), 400
    with _db_write_lock:
        with get_db() as conn:
            conn.execute(
                "UPDATE users SET password = ? WHERE id = ?",
                (generate_password_hash(new_password), user_id)
            )
    return jsonify({'status': 'success'})


@app.route('/api/me', methods=['GET'])
def api_me():
    return jsonify({
        'id': session.get('user_id'),
        'username': session.get('username'),
        'is_admin': session.get('is_admin', False),
    })


@app.route('/setup', methods=['GET', 'POST'])
def setup():
    """Teacher account setup via invite code."""
    error = None
    success = False

    if request.method == 'POST':
        code = request.form.get('code', '').strip()
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')

        if not username:
            error = 'Please choose a username.'
        elif len(username) < 2:
            error = 'Username must be at least 2 characters.'
        elif len(password) < 6:
            error = 'Password must be at least 6 characters.'
        elif password != confirm:
            error = 'Passwords do not match.'
        else:
            # Find a matching unused, unexpired invite code
            with get_db() as conn:
                codes = conn.execute(
                    "SELECT ic.id, ic.user_id, ic.code_hash FROM invite_codes ic "
                    "WHERE ic.used_at IS NULL AND ic.expires_at > ?",
                    (datetime.now().isoformat(),)
                ).fetchall()
                existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()

            matched = None
            for c in codes:
                if check_password_hash(c['code_hash'], code):
                    matched = c
                    break

            if not matched:
                error = 'Invalid or expired invite code.'
            elif existing:
                error = 'That username is already taken.'
            else:
                with _db_write_lock:
                    with get_db() as conn:
                        conn.execute(
                            "UPDATE users SET username = ?, password = ? WHERE id = ?",
                            (username, generate_password_hash(password), matched['user_id'])
                        )
                        conn.execute(
                            "UPDATE invite_codes SET used_at = ? WHERE id = ?",
                            (datetime.now().isoformat(), matched['id'])
                        )
                success = True

    return render_template('setup.html', error=error, success=success)


@app.route('/admin-recovery', methods=['GET', 'POST'])
def admin_recovery():
    """Emergency admin password reset — only accessible from localhost."""
    # Only allow access from the local machine
    remote = request.remote_addr
    if remote not in ('127.0.0.1', '::1', 'localhost'):
        return "Access denied. This page is only available from the server machine.", 403

    error = None
    success = False

    with get_db() as conn:
        admins = conn.execute(
            "SELECT id, username FROM users WHERE is_admin = 1 ORDER BY id"
        ).fetchall()

    if request.method == 'POST':
        user_id = request.form.get('user_id', type=int)
        password = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')

        if not user_id:
            error = 'Select an admin account.'
        elif len(password) < 6:
            error = 'Password must be at least 6 characters.'
        elif password != confirm:
            error = 'Passwords do not match.'
        else:
            with _db_write_lock:
                with get_db() as conn:
                    conn.execute(
                        "UPDATE users SET password = ? WHERE id = ? AND is_admin = 1",
                        (generate_password_hash(password), user_id)
                    )
            success = True

    return render_template('admin_recovery.html', admins=admins, error=error, success=success)


@app.route('/health')
def health():
    return jsonify({'status': 'ok'})


@app.route('/')
def index():
    """Main page"""
    return render_template(
        'homeroom.html',
        username=session.get('username', ''),
        is_admin=session.get('is_admin', False),
        current_version=__version__,
    )

@app.route('/old')
def old_index():
    """Old interface"""
    return render_template('index.html')


# ============================================================================
# Multi-User Sync API
# ============================================================================

@app.route('/api/lock/status', methods=['GET'])
def api_lock_status():
    """Get current lock status for a grade"""
    session_id = request.args.get('session') or request.headers.get('X-Session-ID')
    grade_id = request.args.get('grade_id')

    if not grade_id:
        return jsonify({'locked': False, 'held_by': None, 'expires_in': 0, 'is_holder': False})

    with lock_mutex:
        lock = active_locks.get(grade_id, {})

        # Check if lock has expired
        if lock.get('expires') and datetime.fromisoformat(lock['expires']) < datetime.now():
            active_locks[grade_id] = {}
            lock = {}

        locked = lock.get('session_id') is not None
        is_holder = locked and lock.get('session_id') == session_id

        expires_in = 0
        if locked and lock.get('expires'):
            expires_in = max(0, (datetime.fromisoformat(lock['expires']) - datetime.now()).total_seconds())

        return jsonify({
            'locked': locked,
            'held_by': lock.get('held_by'),
            'expires_in': int(expires_in),
            'is_holder': is_holder,
            'grade_id': grade_id
        })


@app.route('/api/lock/acquire', methods=['POST'])
def api_lock_acquire():
    """Attempt to acquire the edit lock for a grade"""
    data = request.json or {}
    session_id = data.get('session_id')
    held_by = data.get('held_by', 'Unknown')
    grade_id = data.get('grade_id')

    if not session_id:
        return jsonify({'ok': False, 'error': 'No session ID provided'}), 400
    if not grade_id:
        return jsonify({'ok': False, 'error': 'No grade_id provided'}), 400

    # Register session name for history logging
    if held_by and held_by != 'Unknown':
        session_registry[session_id] = held_by

    with lock_mutex:
        lock = active_locks.get(grade_id, {})

        # Check if lock is already held
        if lock.get('session_id') and lock.get('expires'):
            if datetime.fromisoformat(lock['expires']) > datetime.now():
                # Lock is still valid
                if lock['session_id'] == session_id:
                    # Renew if same session
                    lock['expires'] = (datetime.now() + timedelta(seconds=30)).isoformat()
                    active_locks[grade_id] = lock
                    return jsonify({'ok': True, 'lock': lock})
                else:
                    return jsonify({
                        'ok': False,
                        'error': 'Lock held by another session',
                        'held_by': lock['held_by']
                    }), 409

        # Lock is free or expired - acquire it
        new_lock = {
            'session_id': session_id,
            'held_by': held_by,
            'acquired_at': datetime.now().isoformat(),
            'expires': (datetime.now() + timedelta(seconds=30)).isoformat()
        }
        active_locks[grade_id] = new_lock
        return jsonify({'ok': True, 'lock': new_lock})


@app.route('/api/lock/heartbeat', methods=['POST'])
def api_lock_heartbeat():
    """Renew lock expiry for a grade"""
    data = request.json or {}
    session_id = data.get('session_id')
    grade_id = data.get('grade_id')

    if not session_id:
        return jsonify({'ok': False, 'error': 'No session ID provided'}), 400
    if not grade_id:
        return jsonify({'ok': False, 'error': 'No grade_id provided'}), 400

    with lock_mutex:
        lock = active_locks.get(grade_id, {})
        if lock.get('session_id') != session_id:
            return jsonify({'ok': False, 'error': 'not_holder'}), 403

        # Renew expiry
        lock['expires'] = (datetime.now() + timedelta(seconds=30)).isoformat()
        active_locks[grade_id] = lock
        return jsonify({'ok': True})


@app.route('/api/lock/release', methods=['POST'])
def api_lock_release():
    """Release the edit lock for a grade (or all grades)"""
    data = request.get_json(force=True, silent=True) or {}
    session_id = data.get('session_id')
    grade_id = data.get('grade_id')

    if not session_id:
        return jsonify({'ok': False, 'error': 'No session ID provided'}), 400

    with lock_mutex:
        if grade_id:
            # Release specific grade
            lock = active_locks.get(grade_id, {})
            if lock.get('session_id') == session_id:
                active_locks[grade_id] = {}
        else:
            # Release all locks for this session
            for gid in list(active_locks.keys()):
                if active_locks[gid].get('session_id') == session_id:
                    active_locks[gid] = {}

        return jsonify({'ok': True})


@app.route('/api/sync-status', methods=['GET'])
def api_sync_status():
    """Get last modification timestamp for polling"""
    with sync_mutex:
        return jsonify(last_modified)


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


@app.route('/api/school-years/import', methods=['POST'])
def api_school_year_import():
    """Bulk import students across multiple grades (admin only)."""
    if not session.get('is_admin'):
        return jsonify({'error': 'Admin only'}), 403
    data = request.json
    grades_data = data.get('grades')  # { grade_name: [students] }
    if not grades_data or not isinstance(grades_data, dict):
        return jsonify({'error': 'Missing grades data'}), 400

    config = load_config()
    active_year = config.get('active_school_year', config['school_year'])

    # Check for duplicate names within each grade
    for grade_name, students in grades_data.items():
        names = [s['name'] for s in students if s.get('name')]
        if len(names) != len(set(names)):
            dupes = [n for n in set(names) if names.count(n) > 1]
            return jsonify({'error': f"Duplicate names in {grade_name}: {', '.join(dupes)}"}), 400

    students_data = load_school_year_data(active_year)
    for grade_name, students in grades_data.items():
        # Check if any student has an assignedClass — if so, build assignments from it
        class_order = []  # preserves insertion order of first appearance
        for s in students:
            cls = s.get('assignedClass', '').strip()
            if cls and cls not in class_order:
                class_order.append(cls)
        has_assignments = len(class_order) > 0

        # Strip assignedClass from student records before storing
        clean_students = [{k: v for k, v in s.items() if k != 'assignedClass'} for s in students]

        if has_assignments:
            class_index = {name: i + 1 for i, name in enumerate(class_order)}
            assignments = [
                {'name': s['name'], 'assigned_class': class_index[s.get('assignedClass', '').strip()]}
                for s in students if s.get('name') and s.get('assignedClass', '').strip() in class_index
            ]
            class_names = {str(i + 1): name for i, name in enumerate(class_order)}
            num_classes = len(class_order)
            avg = len(clean_students) / num_classes if num_classes else 20
        else:
            assignments = []
            class_names = {}
            num_classes = 3 if grade_name == 'Kindergarten' else 5
            avg = len(clean_students) / num_classes if clean_students else 20

        if grade_name in students_data:
            students_data[grade_name]['students'] = clean_students
            students_data[grade_name]['assignment_stale'] = not has_assignments
            if has_assignments:
                students_data[grade_name]['assignments'] = assignments
                students_data[grade_name]['solver_baseline'] = assignments.copy()
                students_data[grade_name]['class_names'] = class_names
                students_data[grade_name]['num_classes'] = num_classes
                students_data[grade_name]['available_teachers'] = class_order
        else:
            grade_entry = {
                'students': clean_students,
                'num_classes': num_classes,
                'min_students': max(1, int(avg * 0.8)),
                'max_students': int(avg * 1.2) + 2,
                'assignments': assignments,
                'assignment_stale': not has_assignments,
            }
            if has_assignments:
                grade_entry['solver_baseline'] = assignments.copy()
                grade_entry['class_names'] = class_names
                grade_entry['available_teachers'] = class_order
            students_data[grade_name] = grade_entry
    save_school_year_data(active_year, students_data)

    total = sum(len(s) for s in grades_data.values())
    return jsonify({'status': 'success', 'grades': len(grades_data), 'students': total})


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


@app.route('/api/school-years/create', methods=['POST'])
def api_create_school_year():
    """Create an empty school year and set it as active (admin only)."""
    if not session.get('is_admin'):
        return jsonify({'error': 'Admin only'}), 403
    data = request.json
    year = (data.get('year') or '').strip()
    if not year:
        return jsonify({'error': 'Missing year'}), 400
    save_school_year_data(year, {})
    config = load_config()
    config['active_school_year'] = year
    config['available_school_years'] = list_school_years()
    save_config(config)
    return jsonify({'status': 'success', 'year': year})


@app.route('/api/school-years/<school_year>/clear', methods=['POST'])
def api_clear_school_year(school_year):
    """Clear all data for a school year"""
    if not session.get('is_admin'):
        return jsonify({'error': 'Admin only'}), 403
    with _db_write_lock:
        with get_db() as conn:
            conn.execute("DELETE FROM school_years WHERE name = ?", (school_year,))

    config = load_config()
    config['available_school_years'] = list_school_years()
    if not config['available_school_years']:
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
    if not session.get('is_admin'):
        return jsonify({'error': 'Admin only'}), 403
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

    grade_data = students_data[grade_name]

    if request.method == 'POST':
        # Update students
        data = request.json
        if 'students' in data:
            names = [s['name'] for s in data['students'] if s.get('name')]
            if len(names) != len(set(names)):
                dupes = [n for n in set(names) if names.count(n) > 1]
                return jsonify({'error': f"Duplicate student names: {', '.join(dupes)}"}), 400
            old_students = {s['name']: s for s in grade_data.get('students', [])}
            new_students = {s['name']: s for s in data['students']}
            added = [n for n in new_students if n not in old_students]
            removed = [n for n in old_students if n not in new_students]
            edited = [n for n in new_students if n in old_students and new_students[n] != old_students[n]]
            session_id = request.headers.get('X-Session-ID', '')
            # Mark assignment stale when student data changes (not just adds,
            # since adds surface as "unassigned" separately)
            if edited or removed:
                students_data[grade_name]['assignment_stale'] = True
            if added:
                log_action(session_id, 'students', 'add_student', grade_name, {'students': added})
            if removed:
                log_action(session_id, 'students', 'remove_student', grade_name, {'students': removed})
            if edited:
                edited_details = []
                for n in edited:
                    changes = []
                    for k in set(list(old_students[n].keys()) + list(new_students[n].keys())):
                        if k == 'name':
                            continue
                        old_v = old_students[n].get(k)
                        new_v = new_students[n].get(k)
                        if old_v != new_v:
                            changes.append({'field': k, 'from': old_v, 'to': new_v})
                    edited_details.append({'name': n, 'changes': changes})
                log_action(session_id, 'students', 'edit_student', grade_name, {'students': edited_details})
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
        'custom_rules': grade_data.get('custom_rules'),
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
                # Manual save invalidates the solver's optimal claim
                students_data[grade_name]['solver_status'] = None
                # Rename flow saves baseline immediately after student rename — clear stale flag
                students_data[grade_name]['assignment_stale'] = False
                session_id = request.headers.get('X-Session-ID', '')
                log_action(session_id, 'assignment', 'save_manual', grade_name)
            save_school_year_data(active_year, students_data)
            return jsonify({'status': 'success'})
        return jsonify({'error': 'No assignments data provided'}), 400

    # GET request
    grade_data = students_data[grade_name]

    # Merge live student attributes into assignment data so analysis always reflects
    # current student properties (IEP, gender, etc.), even if changed since last run.
    students_by_name = {s['name']: s for s in grade_data.get('students', [])}
    merged_assignments = []
    for a in grade_data.get('assignments', []):
        name = a.get('name')
        if name in students_by_name:
            merged = {**students_by_name[name], 'assigned_class': a.get('assigned_class'),
                      'has_friend_in_class': a.get('has_friend_in_class')}
        else:
            merged = a  # student was removed from roster; keep stale entry
        merged_assignments.append(merged)

    return jsonify({
        'assignments': merged_assignments,
        'solver_baseline': grade_data.get('solver_baseline', []),
        'num_classes': grade_data.get('num_classes', 5),
        'solver_status': grade_data.get('solver_status'),
        'solver_elapsed': grade_data.get('solver_elapsed'),
        'solver_combinations': grade_data.get('solver_combinations'),
        'class_names': grade_data.get('class_names', {}),
        'assignment_config': grade_data.get('assignment_config'),
        'assignment_stale': grade_data.get('assignment_stale', False),
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


@app.route('/api/grades/<grade_id>/custom-rules', methods=['POST', 'DELETE'])
def api_grade_custom_rules(grade_id):
    """Save or delete custom rules for a grade"""
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
        # Save custom rules — diff to detect what changed
        data = request.json or {}
        new_rules = data.get('custom_rules', {})
        old_rules = students_data[grade_name].get('custom_rules') or {}
        old_props = {p['name']: p for p in (old_rules.get('properties') or [])}
        new_props = {p['name']: p for p in (new_rules.get('properties') or [])}
        changes = []
        for name, prop in new_props.items():
            old = old_props.get(name)
            if old is None:
                continue
            if prop.get('enabled') != old.get('enabled'):
                state = 'enabled' if prop.get('enabled') else 'disabled'
                changes.append(f"{prop.get('display_name', name)} {state}")
            elif prop.get('weight') != old.get('weight'):
                changes.append(f"{prop.get('display_name', name)} weight {old.get('weight')}→{prop.get('weight')}")
        students_data[grade_name]['custom_rules'] = new_rules
        save_school_year_data(active_year, students_data)
        session_id = request.headers.get('X-Session-ID', '')
        log_action(session_id, 'assignment', 'update_rules', grade_name, {'changes': changes})
        return jsonify({'status': 'success'})

    elif request.method == 'DELETE':
        # Remove custom rules (revert to global)
        if 'custom_rules' in students_data[grade_name]:
            del students_data[grade_name]['custom_rules']
        save_school_year_data(active_year, students_data)
        session_id = request.headers.get('X-Session-ID', '')
        log_action(session_id, 'assignment', 'reset_rules', grade_name)
        return jsonify({'status': 'success'})


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
    new_names = data.get('class_names', {})
    students_data[grade_name]['class_names'] = new_names
    save_school_year_data(active_year, students_data)
    session_id = request.headers.get('X-Session-ID', '')
    log_action(session_id, 'assignment', 'rename_classes', grade_name, {'class_names': new_names})
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
    session_id = request.headers.get('X-Session-ID', '')
    grade_data = students_data[grade_name]

    if 'num_classes' in data:
        students_data[grade_name]['num_classes'] = data['num_classes']
    if 'min_students' in data:
        students_data[grade_name]['min_students'] = data['min_students']
    if 'max_students' in data:
        students_data[grade_name]['max_students'] = data['max_students']
    if 'enforce_class_size' in data:
        students_data[grade_name]['enforce_class_size'] = data['enforce_class_size']
    if 'teachers' in data:
        old_teachers = set(t.get('name', '') for t in (grade_data.get('teachers') or []))
        new_teachers = set(t.get('name', '') for t in (data['teachers'] or []))
        added = list(new_teachers - old_teachers)
        removed = list(old_teachers - new_teachers)
        if added:
            log_action(session_id, 'teachers', 'add_teacher', grade_name, {'teachers': added})
        if removed:
            log_action(session_id, 'teachers', 'remove_teacher', grade_name, {'teachers': removed})
        if not added and not removed and data['teachers'] != grade_data.get('teachers'):
            log_action(session_id, 'teachers', 'update_teacher_assignments', grade_name)
        students_data[grade_name]['teachers'] = data['teachers']
    if 'available_teachers' in data:
        old_avail = set(grade_data.get('available_teachers') or [])
        new_avail = set(data['available_teachers'] or [])
        added = list(new_avail - old_avail)
        removed = list(old_avail - new_avail)
        if added:
            log_action(session_id, 'teachers', 'add_teacher', grade_name, {'teachers': added})
        if removed:
            log_action(session_id, 'teachers', 'remove_teacher', grade_name, {'teachers': removed})
        students_data[grade_name]['available_teachers'] = data['available_teachers']
    if any(k in data for k in ('num_classes', 'min_students', 'max_students', 'enforce_class_size')):
        log_action(session_id, 'assignment', 'update_settings', grade_name, {
            k: data[k] for k in ('num_classes', 'min_students', 'max_students', 'enforce_class_size') if k in data
        })

    save_school_year_data(active_year, students_data)
    return jsonify({'status': 'success'})


@app.route('/api/export-data', methods=['GET'])
def api_export_data():
    """Export all school data as a .classify zip file (JSON format for portability)."""
    config = load_config()
    years  = list_school_years()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        config_export = {k: v for k, v in config.items() if k != 'available_school_years'}
        zf.writestr('config.json', json.dumps(config_export, indent=2))
        for year in years:
            data = load_school_year_data(year)
            safe_year = year.replace('–', '-')
            zf.writestr(
                f'school_years/{safe_year}.json',
                json.dumps(data, indent=2, allow_nan=False),
            )
    buf.seek(0)
    timestamp = datetime.now().strftime('%Y%m%d')
    return send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'classify-backup-{timestamp}.classify',
    )


@app.route('/api/import-data', methods=['POST'])
def api_import_data():
    """Import a .classify backup file, restoring all school data into SQLite."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    f = request.files['file']
    if not f.filename.endswith('.classify'):
        return jsonify({'error': 'Invalid file type'}), 400
    try:
        with zipfile.ZipFile(io.BytesIO(f.read())) as zf:
            names = zf.namelist()
            if 'config.json' in names:
                current_config = load_config()
                imported = json.loads(zf.read('config.json'))
                # Preserve activation status
                imported['activated'] = current_config.get('activated', False)
                imported['activation_code'] = current_config.get('activation_code')
                save_config(imported)
            for name in names:
                if name.startswith('school_years/') and name.endswith('.json'):
                    year_str = Path(name).stem.replace('-', '–')
                    data = json.loads(zf.read(name))
                    save_school_year_data(year_str, data)
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


@app.route('/api/history', methods=['GET'])
def api_get_history():
    """Return action history log (newest first)"""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM history ORDER BY timestamp DESC LIMIT 2000"
        ).fetchall()
    return jsonify([{
        'id':           r['id'],
        'timestamp':    r['timestamp'],
        'session_name': r['session_name'],
        'category':     r['category'],
        'action':       r['action'],
        'grade':        r['grade'],
        'details':      json.loads(r['details']),
    } for r in rows])


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

        # Get properties config - use grade-specific custom rules if available
        if grade_data.get('custom_rules') and grade_data['custom_rules'].get('properties'):
            properties_config = grade_data['custom_rules']['properties']
            print(f"Using custom rules for {grade_name}")
        else:
            properties_config = config.get('properties', [])
            print(f"Using global rules for {grade_name}")

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
        students_data[grade_name]['assignment_stale'] = False  # fresh run clears staleness

        # Save a snapshot of the config at assignment time (use effective properties_config, not global)
        students_data[grade_name]['assignment_config'] = {
            'properties': properties_config,
            'friend_weight': config.get('friend_weight', 30),
            'timestamp': pd.Timestamp.now().isoformat()
        }

        # Save auto-assigned teachers if the solver produced them
        teacher_assignments = solver_result.get('teacher_assignments', []) if solver_result else []
        if teacher_assignments:
            students_data[grade_name]['teachers'] = teacher_assignments
        save_school_year_data(active_year, students_data)

        # Clean up temp files
        temp_input.unlink()
        temp_output.unlink()

        session_id = request.headers.get('X-Session-ID', '')
        log_action(session_id, 'assignment', 'run_optimizer', grade_name, {
            'num_classes': num_classes,
            'student_count': len(students),
            'solver_status': solver_result.get('status') if solver_result else None,
        })

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


def get_local_ip():
    """Get the machine's local network IP address."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('8.8.8.8', 80))
            return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'


@app.route('/api/server-info')
def api_server_info():
    """Return local network URL so admins can share it with teachers."""
    ip = get_local_ip()
    port = request.host.split(':')[1] if ':' in request.host else '80'
    return jsonify({'ip': ip, 'port': port, 'url': f'http://{ip}:{port}'})


@app.route('/api/check-update')
def api_check_update():
    """Check for app updates by fetching the remote manifest."""
    import urllib.request
    try:
        req = urllib.request.Request(_UPDATE_URL, headers={'User-Agent': f'Classify/{__version__}'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        latest = data.get('version', __version__)
        if _version_tuple(latest) > _version_tuple(__version__):
            system = platform.system()
            url = data.get('mac_url') if system == 'Darwin' else data.get('windows_url', data.get('mac_url'))
            return jsonify({
                'update_available': True,
                'current': __version__,
                'latest': latest,
                'download_url': url,
                'notes': data.get('notes', ''),
            })
        return jsonify({'update_available': False, 'current': __version__})
    except Exception:
        return jsonify({'update_available': False, 'current': __version__})


def _version_tuple(v):
    """Parse '1.2.3' into (1, 2, 3) for comparison."""
    try:
        return tuple(int(x) for x in v.split('.'))
    except (ValueError, AttributeError):
        return (0, 0, 0)


if __name__ == '__main__':
    if os.environ.get('CLASSIFY_SERVICE'):
        # Running as a background launchd/service — fixed port, no debug
        app.run(host='0.0.0.0', port=5001, debug=False, use_reloader=False)
    elif os.environ.get('CLASSIFY_ELECTRON'):
        # Launched by Electron directly — prefer port 5001, signal readiness via stdout
        port = find_free_port()
        print(f'CLASSIFY_PORT:{port}', flush=True)
        app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
    else:
        print("\n" + "="*60)
        print("Classify - Class Assignment Optimizer")
        print("="*60)
        print("\nStarting server on http://0.0.0.0:5001")
        print("Access from this machine: http://localhost:5001")
        print("Access from other machines: http://[this-machine-ip]:5001")
        print("\nPress Ctrl+C to stop\n")
        app.run(host='0.0.0.0', debug=True, port=5001, threaded=True)
