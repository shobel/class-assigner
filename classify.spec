# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Classify
# Run: pyinstaller classify.spec

import sys
from pathlib import Path

block_cipher = None

a = Analysis(
    ['webapp/app.py'],
    pathex=[str(Path('.').resolve())],
    binaries=[],
    datas=[
        ('webapp/templates', 'templates'),
        ('webapp/static',    'static'),
        ('class_solver_v2.py', '.'),
    ],
    hiddenimports=[
        'ortools',
        'ortools.sat',
        'ortools.sat.python',
        'ortools.sat.python.cp_model',
        'ortools.util.python.sorted_interval_list',
        'pandas',
        'numpy',
        'flask',
        'werkzeug',
        'werkzeug.serving',
        'jinja2',
        'click',
    ],
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
    console=True,  # needs stdout for port reporting
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
