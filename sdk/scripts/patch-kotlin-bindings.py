#!/usr/bin/env python3
# The SDK exposes a UniFFI Object named `Library` (the uploaded-music client),
# whose generated Kotlin class collides with the `com.sun.jna.Library` UniFFI
# imports for its own runtime — an unqualified `Library` then resolves to our
# class and `compileKotlin` fails. Alias the JNA import so unqualified `Library`
# stays our Object, and qualify the two JNA usages. Idempotent.
#
# Usage: patch-kotlin-bindings.py <path-to-rocksky_uniffi.kt>
import sys

p = sys.argv[1]
s = open(p).read()
if "import com.sun.jna.Library as JnaLibrary" in s:
    print("  kotlin JNA Library import already patched")
    sys.exit(0)
subs = [
    ("import com.sun.jna.Library\n", "import com.sun.jna.Library as JnaLibrary\n"),
    ("private inline fun <reified Lib : Library> loadIndirect(",
     "private inline fun <reified Lib : JnaLibrary> loadIndirect("),
    ("internal interface UniffiLib : Library {", "internal interface UniffiLib : JnaLibrary {"),
]
for old, new in subs:
    if old not in s:
        sys.exit(f"ABORT: kotlin patch anchor not found — uniffi output changed: {old!r}")
    s = s.replace(old, new, 1)
open(p, "w").write(s)
print("  patched kotlin JNA Library import -> JnaLibrary alias")
