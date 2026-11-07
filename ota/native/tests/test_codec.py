#!/usr/bin/env python3
"""Real-file tests. VR_OTA_CODEC_LIBRARY and VALDI_HDIFFZ select local tools."""
import concurrent.futures
import ctypes
import hashlib
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import unittest

LIMIT = 64 * 1024 * 1024


def unpack_header(data):
    pos = data.index(b"\0") + 1
    values = []
    for _ in range(6):
        value = 0
        while True:
            part = data[pos]
            pos += 1
            value = (value << 7) | (part & 127)
            if part < 128:
                break
        values.append(value)
    return data[:data.index(b"\0") + 1], values, data[pos:]


def pack_uint(value):
    parts = [value & 127]
    value >>= 7
    while value:
        parts.append((value & 127) | 128)
        value >>= 7
    return bytes(reversed(parts))


def changed_patch(data, index, value):
    prefix, values, payload = unpack_header(data)
    values[index] = value
    return prefix + b"".join(map(pack_uint, values)) + payload


def raw_frame(data=b"small unknown size", window=0):
    # Standard ZSTD frame, unknown content size, one final raw block.
    return b"\x28\xb5\x2f\xfd\0" + bytes([window]) + (
        (len(data) << 3) | 1).to_bytes(3, "little") + data


class CodecTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lib = ctypes.CDLL(os.environ["VR_OTA_CODEC_LIBRARY"])
        for name in ("encode", "decode"):
            func = getattr(cls.lib, "vr_ota_zstd_" + name)
            func.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint64]
            func.restype = ctypes.c_int
        cls.lib.vr_ota_hdiff_patch.argtypes = [
            ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint64]
        cls.lib.vr_ota_hdiff_patch.restype = ctypes.c_int
        cls.fixtures = tempfile.TemporaryDirectory(prefix="valdi-codec-fixtures-")
        root = Path(cls.fixtures.name)
        rng = random.Random(472)
        cls.old_data = rng.randbytes(22000) + b"old business bytecode\n" * 12000
        cls.new_data = cls.old_data[:17000] + b"new bytecode\n" * 8000 + cls.old_data[20000:]
        cls.old = root / "old.hbc"
        cls.new = root / "new.hbc"
        cls.patch = root / "entry.hdiff"
        cls.old.write_bytes(cls.old_data)
        cls.new.write_bytes(cls.new_data)
        hdiffz = os.environ.get("VALDI_HDIFFZ") or shutil.which("hdiffz")
        if not hdiffz:
            raise RuntimeError("Set VALDI_HDIFFZ to an existing local hdiffz; no downloads.")
        subprocess.run([hdiffz, "-SD", "-s-64", "-c-zlib-6", "-p-1",
                        str(cls.old), str(cls.new), str(cls.patch)],
                       check=True, capture_output=True)
        cls.patch_data = cls.patch.read_bytes()
        prefix, values, _ = unpack_header(cls.patch_data)
        assert prefix == b"HDIFFSF20&zlib\0" and values[5] > 0
        cls.empty = root / "empty"
        cls.empty.write_bytes(b"")
        cls.empty_patch = root / "empty.hdiff"
        subprocess.run([hdiffz, "-SD", "-s-64", "-c-zlib-6", "-p-1",
                        str(cls.old), str(cls.empty), str(cls.empty_patch)],
                       check=True, capture_output=True)
        print("HDiff fixture SHA256:", hashlib.sha256(cls.patch_data).hexdigest())

    @classmethod
    def tearDownClass(cls):
        cls.fixtures.cleanup()

    def setUp(self):
        self.work = tempfile.TemporaryDirectory(prefix="valdi-codec-test-")
        self.root = Path(self.work.name)
        self.addCleanup(self.work.cleanup)
        self.out = self.root / "out"

    def write(self, data, name="input"):
        path = self.root / name
        path.write_bytes(data)
        return path

    def codec(self, mode, source, output=None, limit=LIMIT):
        return getattr(self.lib, "vr_ota_zstd_" + mode)(
            os.fsencode(source) if source is not None else None,
            os.fsencode(output or self.out), limit)

    def patch_call(self, patch=None, output=None, size=None, old=None):
        return self.lib.vr_ota_hdiff_patch(
            os.fsencode(old or self.old), os.fsencode(patch or self.patch),
            os.fsencode(output or self.out),
            len(self.new_data) if size is None else size)

    def rejected(self, status):
        self.assertNotEqual(status, 0, "invalid input unexpectedly succeeded")
        self.assertFalse(self.out.exists(), "partial output survived failure")

    def test_default_zstd_roundtrip(self):
        self.assertEqual(self.codec("encode", self.new), 0,
                         "default ZSTD file encoding is unavailable")
        encoded = self.out
        decoded = self.root / "decoded"
        self.assertEqual(self.codec("decode", encoded, decoded), 0)
        self.assertEqual(decoded.read_bytes(), self.new_data)

    def test_hdiff_real_fixture(self):
        self.assertEqual(self.patch_call(), 0)
        self.assertEqual(self.out.read_bytes(), self.new_data)

    def test_hdiff_rejects_trailing_data(self):
        self.rejected(self.patch_call(self.write(self.patch_data + b"trailing")))

    def test_hdiff_exact_size_and_empty_output(self):
        for size in (len(self.new_data) - 1, len(self.new_data) + 1, LIMIT + 1,
                     (1 << 64) - 1):
            self.rejected(self.patch_call(size=size))
        self.assertEqual(self.patch_call(self.empty_patch, size=0), 0)
        self.assertEqual(self.out.read_bytes(), b"")

    def test_hdiff_header_resource_limits(self):
        # newSize, oldSize, coverCount, stepMemSize, uncompressedSize, compressedSize
        for index, value in ((0, LIMIT + 1), (1, LIMIT + 1),
                             (2, (1 << 64) - 1), (3, 32 * 1024 * 1024 + 1),
                             (4, LIMIT + 1), (5, (1 << 64) - 1)):
            with self.subTest(index=index):
                self.rejected(self.patch_call(self.write(
                    changed_patch(self.patch_data, index, value))))
        # Keep the other header fields valid so this reaches the step-memory
        # guard rather than merely failing exact-size or upstream header checks.
        prefix, values, payload = unpack_header(self.patch_data)
        values[0], values[3], values[4] = LIMIT, 32 * 1024 * 1024 + 1, LIMIT
        self.rejected(self.patch_call(self.write(
            prefix + b"".join(map(pack_uint, values)) + payload), size=LIMIT))

    def test_hdiff_rejects_every_truncated_tail(self):
        for length in range(len(self.patch_data)):
            self.rejected(self.patch_call(self.write(self.patch_data[:length])))

    def test_hdiff_rejects_embedded_zlib_trailing_or_missing_end(self):
        prefix, values, payload = unpack_header(self.patch_data)
        for mutated in (payload[:-1], payload + b"x", payload + payload[1:]):
            altered = values.copy()
            altered[5] = len(mutated)
            patch = prefix + b"".join(map(pack_uint, altered)) + mutated
            self.rejected(self.patch_call(self.write(patch)))

    def test_hdiff_rejects_other_formats_and_window(self):
        for patch in (self.patch_data.replace(b"HDIFFSF20", b"HDIFFSF21", 1),
                      self.patch_data.replace(b"zlib", b"lzma", 1)):
            self.rejected(self.patch_call(self.write(patch)))
        prefix, values, payload = unpack_header(self.patch_data)
        self.rejected(self.patch_call(self.write(
            prefix + b"".join(map(pack_uint, values)) + b"\x7f" + payload[1:])))

    def test_zstd_unknown_size_and_zero_size(self):
        data = b"small unknown size"
        self.assertEqual(self.codec("decode", self.write(raw_frame(data)), limit=len(data)), 0)
        self.assertEqual(self.out.read_bytes(), data)
        self.out.unlink()
        self.assertEqual(self.codec("decode", self.write(raw_frame(b"")), limit=0), 0)
        self.assertEqual(self.out.read_bytes(), b"")

    def test_zstd_empty_and_large_incompressible_roundtrips(self):
        for data in (b"", random.Random(132).randbytes(400000)):
            source = self.write(data)
            self.assertEqual(self.codec("encode", source), 0)
            restored = self.root / "restored"
            self.assertEqual(self.codec("decode", self.out, restored, len(data)), 0)
            self.assertEqual(restored.read_bytes(), data)
            self.out.unlink()
            restored.unlink()

    def test_zstd_rejects_truncation_trailing_concatenation_and_skippable(self):
        data = raw_frame()
        invalid = [data[:i] for i in range(len(data))]
        invalid += [data + b"x", data + data,
                    b"\x50\x2a\x4d\x18\0\0\0\0", b"not zstd"]
        for item in invalid:
            self.rejected(self.codec("decode", self.write(item)))

    def test_zstd_output_and_window_bounds(self):
        self.rejected(self.codec("decode", self.write(raw_frame()), limit=3))
        # The window descriptor advertises 128 MiB, despite tiny actual output.
        self.rejected(self.codec("decode", self.write(raw_frame(window=17 << 3))))
        oversized = b"\x28\xb5\x2f\xfd\xa0" + (LIMIT + 1).to_bytes(4, "little")
        self.rejected(self.codec("decode", self.write(oversized)))
        for value in (LIMIT + 1, (1 << 64) - 1):
            self.rejected(self.codec("decode", self.write(raw_frame()), limit=value))
            self.rejected(self.codec("encode", self.new, limit=value))
        self.rejected(self.codec("encode", self.new, limit=1))

    def test_no_overwrite_input_alias_directory_and_symlink(self):
        sentinel = b"must survive unchanged"
        self.out.write_bytes(sentinel)
        for invoke in (lambda: self.codec("encode", self.new),
                       lambda: self.codec("decode", self.write(raw_frame())),
                       self.patch_call):
            self.assertNotEqual(invoke(), 0)
            self.assertEqual(self.out.read_bytes(), sentinel)
        self.out.unlink()
        target = self.write(sentinel, "sentinel")
        self.out.symlink_to(target)
        self.assertNotEqual(self.patch_call(), 0)
        self.assertTrue(self.out.is_symlink())
        self.assertEqual(target.read_bytes(), sentinel)
        self.out.unlink()
        self.out.symlink_to(self.root / "missing")
        self.assertNotEqual(self.codec("encode", self.new), 0)
        self.assertTrue(self.out.is_symlink())
        self.out.unlink()
        self.out.mkdir()
        self.assertNotEqual(self.patch_call(), 0)
        self.assertTrue(self.out.is_dir())
        self.out.rmdir()
        before = self.new.read_bytes()
        self.assertNotEqual(self.codec("encode", self.new, self.new), 0)
        self.assertEqual(self.new.read_bytes(), before)

    def test_invalid_paths_and_oversized_files(self):
        for mode in ("encode", "decode"):
            for source in (None, self.root / "missing", self.root):
                self.rejected(self.codec(mode, source))
        self.rejected(self.patch_call(old=self.root / "missing"))
        sparse = self.write(b"")
        with sparse.open("r+b") as file:
            file.truncate(LIMIT + 1)
        for mode in ("encode", "decode"):
            self.rejected(self.codec(mode, sparse))
        self.rejected(self.patch_call(old=sparse))
        self.rejected(self.patch_call(patch=sparse))

    def test_null_output_paths_and_nonregular_input(self):
        for mode in ("encode", "decode"):
            func = getattr(self.lib, "vr_ota_zstd_" + mode)
            self.assertNotEqual(func(os.fsencode(self.new), None, LIMIT), 0)
        self.assertNotEqual(self.lib.vr_ota_hdiff_patch(
            None, os.fsencode(self.patch), os.fsencode(self.out), 0), 0)
        self.assertNotEqual(self.lib.vr_ota_hdiff_patch(
            os.fsencode(self.old), None, os.fsencode(self.out), 0), 0)
        self.assertNotEqual(self.lib.vr_ota_hdiff_patch(
            os.fsencode(self.old), os.fsencode(self.patch), None, 0), 0)
        fifo = self.root / "fifo"
        os.mkfifo(fifo)
        for mode in ("encode", "decode"):
            self.rejected(self.codec(mode, fifo))
        self.rejected(self.patch_call(old=fifo))

    def test_write_failures_remove_partial_outputs(self):
        compressed = self.write(raw_frame(b"output" * 100))
        # A real kernel short write followed by EFBIG; no codec mocks.
        script = r"""
import ctypes, os, resource, signal, sys
lib = ctypes.CDLL(sys.argv[1])
signal.signal(signal.SIGXFSZ, signal.SIG_IGN)
resource.setrlimit(resource.RLIMIT_FSIZE, (32, 32))
for mode, source in [("encode", sys.argv[2]), ("decode", sys.argv[3])]:
    fun = getattr(lib, "vr_ota_zstd_" + mode)
    fun.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint64]
    output = os.fsencode(sys.argv[6] + mode)
    assert fun(os.fsencode(source), output, 64 * 1024 * 1024) != 0
    assert not os.path.lexists(output), "short-write partial survived"
fun = lib.vr_ota_hdiff_patch
fun.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint64]
output = os.fsencode(sys.argv[6] + "patch")
assert fun(os.fsencode(sys.argv[4]), os.fsencode(sys.argv[5]), output, int(sys.argv[7])) != 0
assert not os.path.lexists(output), "patch short-write partial survived"
"""
        result = subprocess.run([
            sys.executable, "-c", script, os.environ["VR_OTA_CODEC_LIBRARY"],
            str(self.new), str(compressed), str(self.old), str(self.patch),
            str(self.root / "partial-"), str(len(self.new_data))], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_exclusive_create_under_contention(self):
        def run(_):
            return self.patch_call()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            statuses = list(pool.map(run, range(16)))
        self.assertEqual(statuses.count(0), 1)
        self.assertEqual(self.out.read_bytes(), self.new_data)

    def test_zstd_default_matches_reference_and_actual_module(self):
        reference = os.environ.get("VR_OTA_ZSTD_REFERENCE")
        if not reference:
            self.skipTest("reference executable not selected")
        expected = self.root / "reference.zst"
        subprocess.run([reference, str(self.new), str(expected)], check=True)
        self.assertEqual(self.codec("encode", self.new), 0)
        self.assertEqual(self.out.read_bytes(), expected.read_bytes())
        self.out.unlink()
        module = os.environ.get("VR_OTA_TEST_MODULE")
        if not module:
            self.skipTest("set VR_OTA_TEST_MODULE to check an actual current .valdimodule")
        packet = self.root / "packet"
        self.assertEqual(self.codec("decode", Path(module), packet), 0)
        self.assertEqual(self.codec("encode", packet), 0)
        self.assertEqual(self.out.read_bytes(), Path(module).read_bytes(),
                         "recompression mismatch: clients MUST discard delta and fetch full")
        print("Actual module exact default-ZSTD SHA256:",
              hashlib.sha256(self.out.read_bytes()).hexdigest(), module)

    def test_fuzzed_patch_headers_return_without_crash_or_partial(self):
        rng = random.Random(678)
        for _ in range(300):
            data = bytearray(self.patch_data)
            for _ in range(rng.randint(1, 4)):
                data[rng.randrange(len(data))] = rng.randrange(256)
            status = self.patch_call(self.write(data))
            if status == 0:
                self.assertEqual(self.out.stat().st_size, len(self.new_data))
                self.out.unlink()  # Hash validation belongs to clients.
            else:
                self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
