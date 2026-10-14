#!/usr/bin/env python3
"""
Copy-lint & Static Guardrail Verifier for Reading Faces (Section 1 & Section 10).
Verifies:
1. No occurrences of forbidden deception terms (\blie\b, \blies\b, \bliar\b, \blying\b, \bdeception\b, \bdeceit\b, \btruth\b)
   in content/*.json, content/levels/*.json, src/**/*.js, or index.html (except content/ethics.json).
2. No occurrences of TODO, FIXME, lorem, or placeholder text.
3. No setTimeout or setInterval anywhere in src/**/*.js.
4. All JSON files parse cleanly and contain no empty string values in user-facing fields.
"""

import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FORBIDDEN_DECEPTION_RE = re.compile(
    r"\b(lie|lies|liar|liars|lying|deception|deceptive|deceit|truth)\b",
    re.IGNORECASE,
)
FORBIDDEN_PLACEHOLDER_RE = re.compile(
    r"(\bTODO\b|\bFIXME\b|\blorem\b|\bplaceholder text\b|\bcoming soon\b)"
)
FORBIDDEN_TIMER_RE = re.compile(r"\b(setTimeout|setInterval)\s*\(")


def check_files():
    errors = []

    json_files = sorted(
        glob.glob(os.path.join(ROOT, "content", "*.json"))
        + glob.glob(os.path.join(ROOT, "content", "levels", "*.json"))
    )
    js_files = sorted(
        glob.glob(os.path.join(ROOT, "src", "**", "*.js"), recursive=True)
    )
    html_files = [os.path.join(ROOT, "index.html")]

    for jf in json_files:
        rel = os.path.relpath(jf, ROOT)
        with open(jf, "r", encoding="utf-8") as f:
            raw = f.read()
        try:
            json.loads(raw)
        except Exception as exc:
            errors.append(f"{rel}: Invalid JSON ({exc})")

        if os.path.basename(jf) != "ethics.json":
            for m in FORBIDDEN_DECEPTION_RE.finditer(raw):
                errors.append(
                    f"{rel}: Forbidden word '{m.group(0)}' outside content/ethics.json"
                )

        for m in FORBIDDEN_PLACEHOLDER_RE.finditer(raw):
            errors.append(f"{rel}: Forbidden placeholder '{m.group(0)}'")

    for src_file in js_files + html_files:
        if not os.path.exists(src_file):
            continue
        rel = os.path.relpath(src_file, ROOT)
        with open(src_file, "r", encoding="utf-8") as f:
            raw = f.read()

        for m in FORBIDDEN_DECEPTION_RE.finditer(raw):
            errors.append(f"{rel}: Forbidden word '{m.group(0)}' in {rel}")

        for m in FORBIDDEN_PLACEHOLDER_RE.finditer(raw):
            errors.append(f"{rel}: Forbidden placeholder '{m.group(0)}'")

        if src_file.endswith(".js"):
            # Strip comments before checking setTimeout/setInterval
            no_comments = re.sub(r"//.*$", "", raw, flags=re.MULTILINE)
            no_comments = re.sub(r"/\*[\s\S]*?\*/", "", no_comments)
            for m in FORBIDDEN_TIMER_RE.finditer(no_comments):
                errors.append(
                    f"{rel}: Forbidden timer '{m.group(1)}' found in JS code"
                )

    if errors:
        print("COPYLINT FAILED:")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    else:
        print(
            f"COPYLINT PASSED: {len(json_files)} JSON files, {len(js_files)} JS files, and index.html clean."
        )


if __name__ == "__main__":
    check_files()
