# -*- mode: python ; coding: utf-8 -*-
import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules, copy_metadata

block_cipher = None

# Base directory for sidecar python
sidecar_dir = os.path.abspath(os.path.dirname(SPEC))

# Data files
datas = [
    (os.path.join(sidecar_dir, 'common.py'), '.'),
    (os.path.join(sidecar_dir, 'lifecycle.py'), '.'),
]

# Explicitly ensure paddleocr assets and internal packages (ppocr, tools) are bundled
try:
    import paddleocr
    p_dir = os.path.dirname(paddleocr.__file__)
    datas.append((os.path.join(p_dir, 'ppocr'), 'ppocr'))
    datas.append((os.path.join(p_dir, 'tools'), 'tools'))
    datas.append((p_dir, 'paddleocr'))
except Exception as e:
    print(f"[sidecar.spec] Warning: direct paddleocr path collection failed: {e}")

# Explicitly ensure transformers models are bundled (avoids ModuleNotFoundError for dynamic tokenizer auto-discovery)
try:
    import transformers
    t_dir = os.path.dirname(transformers.__file__)
    datas.append((os.path.join(t_dir, 'models'), 'transformers/models'))
except Exception as e:
    print(f"[sidecar.spec] Warning: direct transformers models collection failed: {e}")

# Collect data files from installed packages
for pkg in ['paddleocr', 'paddle', 'pysbd', 'kokoro', 'misaki', 'transformers', 'sentence_transformers']:
    try:
        datas += collect_data_files(pkg)
    except Exception as e:
        print(f"[sidecar.spec] Warning: collect_data_files failed for {pkg}: {e}")

# Collect package dist-info metadata (required for packages using importlib.metadata.version)
for pkg in ['imageio', 'tqdm', 'regex', 'requests', 'packaging', 'transformers', 'torch', 'paddleocr', 'kokoro', 'misaki', 'tokenizers', 'safetensors', 'filelock', 'numpy', 'scipy', 'pydantic', 'fastapi']:
    try:
        datas += copy_metadata(pkg)
    except Exception as e:
        print(f"[sidecar.spec] Warning: copy_metadata failed for {pkg}: {e}")

# Collect dynamic libraries (DLLs)
binaries = []
for pkg in ['torch', 'paddle']:
    try:
        binaries += collect_dynamic_libs(pkg)
    except Exception as e:
        print(f"[sidecar.spec] Warning: collect_dynamic_libs failed for {pkg}: {e}")

# Explicit hidden imports
hiddenimports = [
    # Uvicorn ASGI internals
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',

    # Frameworks & Validation
    'fastapi',
    'starlette',
    'pydantic',
    'pydantic_core',
    'multipart',
    'unittest',

    # PyTorch & Neural Models
    'torch',
    'torch.utils',
    'torch.distributions',
    'sentence_transformers',
    'transformers',
    'transformers.models.xlm_roberta',
    'transformers.models.auto',
    'tokenizers',
    'safetensors',

    # Document Parsers & NLP
    'pymupdf',
    'fitz',
    'docx',
    'striprtf',
    'pysbd',

    # Text-to-Speech (Kokoro & Phonemizers)
    'kokoro',
    'soundfile',
    'misaki',
    'espeakng_loader',

    # PaddleOCR & Computer Vision
    'paddleocr',
    'paddle',
    'cv2',
    'PIL',
    'scipy.signal',
    'scipy.io.wavfile',
    'tools',
    'tools.infer',
    'tools.infer.predict_system',

    # Sidecar internal modules
    'common',
    'lifecycle',
    'ocr.routes',
    'nlp.routes',
    'nlp.sanitize',
    'embed.routes',
    'parse.routes',
    'parse.structure',
    'pdfmath_sidecar.extract',
    'tts.routes',
    'tts.synthesize',
]

# Collect submodules for core dynamic packages
for pkg in ['pydantic', 'pydantic_core', 'uvicorn', 'fastapi', 'sentence_transformers']:
    try:
        hiddenimports += collect_submodules(pkg)
    except Exception as e:
        print(f"[sidecar.spec] Warning: collect_submodules failed for {pkg}: {e}")

hiddenimports = list(set(hiddenimports))

a = Analysis(
    [os.path.join(sidecar_dir, 'main.py')],
    pathex=[sidecar_dir],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib.tests',
        'scipy.tests',
        'numpy.tests',
        'IPython',
        'jupyter',
        'pytest',
    ],
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
    name='omnitome-sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='omnitome-sidecar',
)

