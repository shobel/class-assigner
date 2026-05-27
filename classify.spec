# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Classify

from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# Collect everything for packages that have known PyInstaller issues
flask_datas, flask_bins, flask_hiddenimports = collect_all('flask')
jinja_datas, jinja_bins, jinja_hiddenimports = collect_all('jinja2')
werkzeug_datas, werkzeug_bins, werkzeug_hiddenimports = collect_all('werkzeug')
click_datas, click_bins, click_hiddenimports = collect_all('click')
ortools_datas, ortools_bins, ortools_hiddenimports = collect_all('ortools')
certifi_datas, certifi_bins, certifi_hiddenimports = collect_all('certifi')

all_datas = (
    flask_datas + jinja_datas + werkzeug_datas + click_datas + ortools_datas + certifi_datas +
    [
        ('webapp/templates', 'templates'),
        ('webapp/static',    'static'),
        ('class_solver_v2.py', '.'),
    ]
)

all_binaries = flask_bins + jinja_bins + werkzeug_bins + click_bins + ortools_bins

all_hiddenimports = (
    flask_hiddenimports + jinja_hiddenimports +
    werkzeug_hiddenimports + click_hiddenimports +
    ortools_hiddenimports +
    collect_submodules('ortools') +
    [
        'pandas',
        'numpy',
        'itsdangerous',
        'markupsafe',
        'importlib_metadata',
        'pkg_resources',
        'certifi',
    ]
)

a = Analysis(
    ['webapp/app.py'],
    pathex=[str(Path('.').resolve())],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=all_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy', 'PIL'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='classify-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='classify-server',
)
