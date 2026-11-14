"""Validación de los archivos antes de enviarlos al contenedor propietario de la BD."""

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "import-mp3.py"


class ImportMP3Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dasradio audio ")
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "archivo con espacios.mp3"
        self.path.write_bytes(b"ID3test-audio")
        spec = importlib.util.spec_from_file_location("import_under_test", SOURCE)
        self.importer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.importer)
        self.metadata = {
            "streams": [{"codec_name": "mp3"}],
            "format": {"duration": "12.3456", "tags": {"TITLE": "Prueba", "artist": "Autor"}},
        }

    def inspect(self):
        result = subprocess.CompletedProcess([], 0, json.dumps(self.metadata), "")
        with patch.object(self.importer.subprocess, "run", return_value=result) as run:
            metadata = self.importer.inspect_mp3(self.path)
            self.assertEqual(run.call_args.args[0][-1], str(self.path))
            self.assertNotIn("shell", run.call_args.kwargs)
            return metadata

    def test_metadata_uses_audio_stream_and_id3_with_paths_containing_spaces(self):
        self.assertEqual(self.inspect(), {
            "title": "Prueba", "artist": "Autor", "duration_ms": 12346,
        })

    def test_rejects_other_codecs_before_import(self):
        self.metadata["streams"][0]["codec_name"] = "flac"
        with self.assertRaisesRegex(ValueError, "MP3"):
            self.inspect()

    def test_rejects_non_finite_or_empty_duration(self):
        for duration in ["NaN", "Infinity", "0", "-1"]:
            self.metadata["format"]["duration"] = duration
            with self.subTest(duration=duration), self.assertRaises(ValueError):
                self.inspect()

    def test_missing_tags_have_useful_defaults(self):
        self.metadata["format"].pop("tags")
        metadata = self.inspect()
        self.assertEqual(metadata["title"], self.path.stem)
        self.assertEqual(metadata["artist"], "Artista desconocido")

    def test_missing_file_is_rejected_without_invoking_ffprobe(self):
        self.path.unlink()
        with patch.object(self.importer.subprocess, "run") as run:
            with self.assertRaises(ValueError):
                self.importer.inspect_mp3(self.path)
            run.assert_not_called()
