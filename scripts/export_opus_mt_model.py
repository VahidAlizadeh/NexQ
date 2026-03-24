"""
Export an OPUS-MT model to ONNX format for use in NexQ.

Prerequisites:
    pip install optimum[exporters] torch sentencepiece

Usage:
    python export_opus_mt_model.py en fa        # English -> Farsi
    python export_opus_mt_model.py fa en        # Farsi -> English
    python export_opus_mt_model.py en tr        # English -> Turkish (any pair)

This downloads the Helsinki-NLP model, exports to ONNX, and places
the files in NexQ's model directory so they appear in the app.
"""

import sys
import os
import shutil
import subprocess
from pathlib import Path


def get_nexq_models_dir():
    """Get the NexQ OPUS-MT models directory."""
    appdata = os.environ.get("APPDATA", "")
    if not appdata:
        print("ERROR: APPDATA environment variable not set")
        sys.exit(1)
    return Path(appdata) / "com.nexq.app" / "models" / "opus_mt"


def main():
    if len(sys.argv) < 3:
        print("Usage: python export_opus_mt_model.py <source_lang> <target_lang>")
        print("Example: python export_opus_mt_model.py en fa")
        sys.exit(1)

    src = sys.argv[1].lower()
    tgt = sys.argv[2].lower()
    model_name = f"Helsinki-NLP/opus-mt-{src}-{tgt}"
    model_id = f"opus-mt-{src}-{tgt}"

    print(f"\n{'='*60}")
    print(f"Exporting {model_name} to ONNX")
    print(f"{'='*60}\n")

    # Create temp output directory
    tmp_dir = Path(f"./opus_mt_export_{src}_{tgt}")
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)

    # Export using optimum-cli
    print("Step 1/3: Exporting model to ONNX (this may take a few minutes)...")
    result = subprocess.run(
        [
            sys.executable, "-m", "optimum.exporters.onnx",
            "--model", model_name,
            "--task", "text2text-generation-with-past",
            str(tmp_dir),
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"ERROR: Export failed:\n{result.stderr}")
        # Try without --task flag
        print("\nRetrying with default task...")
        result = subprocess.run(
            [
                sys.executable, "-m", "optimum.exporters.onnx",
                "--model", model_name,
                str(tmp_dir),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"ERROR: Export failed:\n{result.stderr}")
            sys.exit(1)

    print("Export complete!\n")

    # Verify expected files exist
    expected_files = {
        "encoder_model.onnx": tmp_dir / "encoder_model.onnx",
        "decoder_model_merged.onnx": tmp_dir / "decoder_model_merged.onnx",
        "tokenizer.json": tmp_dir / "tokenizer.json",
        "config.json": tmp_dir / "config.json",
    }

    # Check for alternative decoder name
    if not expected_files["decoder_model_merged.onnx"].exists():
        alt = tmp_dir / "decoder_with_past_model.onnx"
        if alt.exists():
            expected_files["decoder_model_merged.onnx"] = alt

    missing = [name for name, path in expected_files.items() if not path.exists()]
    if missing:
        print(f"WARNING: Missing files: {missing}")
        print(f"Available files in {tmp_dir}:")
        for f in sorted(tmp_dir.rglob("*")):
            if f.is_file():
                size_mb = f.stat().st_size / 1_000_000
                print(f"  {f.relative_to(tmp_dir)} ({size_mb:.1f} MB)")
        sys.exit(1)

    # Copy to NexQ model directory
    print("Step 2/3: Copying to NexQ models directory...")
    dest_dir = get_nexq_models_dir() / model_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    for name, src_path in expected_files.items():
        dest_path = dest_dir / name
        print(f"  {name} -> {dest_path}")
        shutil.copy2(src_path, dest_path)

    # Cleanup temp directory
    print("\nStep 3/3: Cleaning up temporary files...")
    shutil.rmtree(tmp_dir)

    print(f"\n{'='*60}")
    print(f"SUCCESS! Model '{model_id}' is ready.")
    print(f"Restart NexQ and activate it in Settings > Translation.")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
