"""Contrato del arranque docente: configuración local sin cuenta de Discord."""

import contextlib
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "start.py"


class StartTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dasradio launch ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        template = SOURCE.parent.parent / ".env.example"
        (self.root / ".env.example").write_bytes(template.read_bytes())
        spec = importlib.util.spec_from_file_location("start_under_test", SOURCE)
        self.start = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.start)
        self.start.__file__ = str(self.root / "scripts" / "start.py")
        self.calls = []
        self.config = {"services": {
            "radio-service": {"environment": {
                "POSTGRES_PASSWORD": "test-password", "SERVICE_TOKEN": "test-token"
            }, "ports": [{"target": 8000, "published": "8123"}]},
            "web-service": {"ports": [{"target": 8080, "published": "8088"}]},
            "discord-service": {"environment": {
                "DISCORD_TOKEN": "", "DISCORD_CLIENT_ID": "", "DISCORD_GUILD_ID": ""
            }},
        }}

    def run_launcher(self, *args, daemon_ok=True, config_ok=True):
        def run(command, **_kwargs):
            self.calls.append(command)
            if "config" in command:
                return subprocess.CompletedProcess(
                    command, 0 if config_ok else 1, json.dumps(self.config), "private detail"
                )
            if command == ["docker", "info"] and not daemon_ok:
                return subprocess.CompletedProcess(command, 1)
            return subprocess.CompletedProcess(command, 0)

        self.output = io.StringIO()
        with (
            patch("sys.argv", ["start.py", *args]),
            patch.object(self.start.shutil, "which", return_value="/usr/bin/docker"),
            patch.object(self.start.subprocess, "run", side_effect=run),
            contextlib.redirect_stdout(self.output),
            contextlib.redirect_stderr(self.output),
        ):
            return self.start.main()

    def existing_env(self):
        content = b"# existing credentials\r\nSERVICE_TOKEN=$(do-not-execute)\r\n"
        (self.root / ".env").write_bytes(content)
        return content

    def test_first_default_launch_creates_private_secrets_and_starts_web_without_discord(self):
        self.assertEqual(self.run_launcher(), 0)
        env_path = self.root / ".env"
        if os.name != "nt":
            self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)
        values = dict(line.split("=", 1) for line in env_path.read_text().splitlines()
                      if "=" in line and not line.startswith("#"))
        self.assertEqual(len(values["SERVICE_TOKEN"]), 64)
        self.assertNotEqual(values["SERVICE_TOKEN"], values["POSTGRES_PASSWORD"])
        self.assertNotIn(values["SERVICE_TOKEN"], self.output.getvalue())
        self.assertEqual(self.calls[-1][-5:], ["up", "-d", "--build", "--wait", "web-service"])
        self.assertIn("http://127.0.0.1:8088", self.output.getvalue())
        self.assertIn("/ayuda/discord", self.output.getvalue())
        self.assertIn("ayuda opcional", self.output.getvalue())

    def test_existing_config_is_preserved_and_never_executed_or_passed_as_argument(self):
        original = self.existing_env()
        self.assertEqual(self.run_launcher(), 0)
        self.assertEqual((self.root / ".env").read_bytes(), original)
        self.assertNotIn("do-not-execute", repr(self.calls))

    def test_discord_requires_credentials_and_never_starts_on_missing_values(self):
        self.existing_env()
        self.assertEqual(self.run_launcher("--discord"), 1)
        self.assertIn("DISCORD_TOKEN", self.output.getvalue())
        self.assertIn("configurar-discord.md", self.output.getvalue())
        self.assertIn("--web-only", self.output.getvalue())
        self.assertFalse(any("up" in call for call in self.calls))

    def test_first_discord_launch_stops_for_external_configuration(self):
        self.assertEqual(self.run_launcher("--discord"), 0)
        self.assertTrue((self.root / ".env").exists())
        self.assertEqual(self.calls, [])

    def test_discord_mode_starts_web_and_bot_with_explicit_profile(self):
        self.existing_env()
        self.config["services"]["discord-service"]["environment"].update({
            "DISCORD_TOKEN": "bot-test-token", "DISCORD_CLIENT_ID": "123",
            "DISCORD_GUILD_ID": "456",
        })
        self.assertEqual(self.run_launcher("--discord"), 0)
        self.assertIn("--profile", self.calls[-1])
        self.assertEqual(self.calls[-1][-2:], ["web-service", "discord-service"])
        self.assertNotIn("bot-test-token", self.output.getvalue())

    def test_api_only_does_not_start_web_or_bot(self):
        self.existing_env()
        self.assertEqual(self.run_launcher("--api-only"), 0)
        self.assertEqual(self.calls[-1][-5:], ["up", "-d", "--build", "--wait", "radio-service"])

    def configured_discord(self):
        self.config["services"]["discord-service"]["environment"].update({
            "DISCORD_TOKEN": "bot-test-token", "DISCORD_CLIENT_ID": "123",
            "DISCORD_GUILD_ID": "456",
        })

    def test_default_detects_configured_discord_and_preserves_env(self):
        original = self.existing_env()
        self.configured_discord()
        self.assertEqual(self.run_launcher(), 0)
        self.assertEqual(self.calls[-1][-2:], ["web-service", "discord-service"])
        self.assertIn("--profile", self.calls[-1])
        config_call = next(call for call in self.calls if "config" in call)
        self.assertIn("--profile", config_call)
        self.assertEqual((self.root / ".env").read_bytes(), original)
        self.assertIn("se incluirá el bot", self.output.getvalue())
        self.assertNotIn("bot-test-token", self.output.getvalue())

    def test_partial_invalid_or_placeholder_discord_config_falls_back_to_web(self):
        for key, value in [("DISCORD_GUILD_ID", ""), ("DISCORD_CLIENT_ID", "invalid"),
                           ("DISCORD_TOKEN", "TU_TOKEN"), ("DISCORD_GUILD_ID", "0")]:
            with self.subTest(key=key, value=value):
                self.calls.clear()
                self.configured_discord()
                self.config["services"]["discord-service"]["environment"][key] = value
                self.assertEqual(self.run_launcher(), 0)
                self.assertEqual(self.calls[-1][-1], "web-service")
                self.assertNotIn("discord-service", self.calls[-1])
                self.assertIn(key, self.output.getvalue())
                self.assertNotIn("bot-test-token", self.output.getvalue())

    def test_web_only_ignores_complete_discord_configuration(self):
        self.existing_env()
        self.configured_discord()
        self.assertEqual(self.run_launcher("--web-only"), 0)
        self.assertEqual(self.calls[-1][-1], "web-service")
        self.assertNotIn("discord-service", self.calls[-1])

    def test_api_only_ignores_complete_discord_configuration(self):
        self.existing_env()
        self.configured_discord()
        self.assertEqual(self.run_launcher("--api-only"), 0)
        self.assertEqual(self.calls[-1][-1], "radio-service")
        self.assertNotIn("discord-service", self.calls[-1])

    def test_conflicting_modes_are_rejected_before_running_docker(self):
        with self.assertRaises(SystemExit):
            self.run_launcher("--web-only", "--discord")
        self.assertEqual(self.calls, [])

    def test_config_errors_hide_captured_details_and_do_not_start(self):
        self.existing_env()
        self.assertEqual(self.run_launcher(config_ok=False), 1)
        self.assertNotIn("private detail", self.output.getvalue())
        self.assertFalse(any("up" in call for call in self.calls))

    def test_unavailable_daemon_does_not_start(self):
        self.existing_env()
        self.assertEqual(self.run_launcher(daemon_ok=False), 1)
        self.assertIn("motor Docker", self.output.getvalue())
        self.assertFalse(any("up" in call for call in self.calls))


if __name__ == "__main__":
    unittest.main()
