import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import install  # noqa: E402


class OriginForm(unittest.TestCase):
    def test_one_form_matches_what_a_browser_sends(self):
        for typed, expected in (("https://localhost:443", "https://localhost"), ("https://LOCALHOST", "https://localhost"), ("https://Baby.Example.org:8443/", "https://baby.example.org:8443"),
                                ("https://localhost/", "https://localhost"), ("https://[::1]:443", "https://[::1]")):
            self.assertEqual(install.normalize_origin(typed), expected, typed)
            self.assertEqual(install.normalize_origin(expected), expected)

    def test_a_bad_address_is_still_refused(self):
        with self.assertRaises(install.AnswerError):
            install.normalize_origin("http://localhost:443")

    def test_invalid_ports_and_hosts_return_an_answer_error(self):
        for address in ("https://localhost:bad", "https://localhost:65536", "https://localhost:0", "https://[::1"):
            with self.subTest(address=address), self.assertRaises(install.AnswerError):
                install.normalize_origin(address)

    def test_the_stored_origin_and_the_host_and_port_come_from_that_one_form(self):
        lines = dict(line.split("=", 1) for line in install.env_text("https://LOCALHOST:443", "UTC", 1, 1).splitlines() if line and not line.startswith("#"))
        self.assertEqual((lines["LITTLE_DAYS_ORIGIN"], lines["LITTLE_DAYS_HOST"], lines["LITTLE_DAYS_HTTPS_PORT"]), ("https://localhost", "localhost", "443"))


class SecretsStayOutOfGit(unittest.TestCase):
    def test_env_file_and_data_folder_are_ignored(self):
        root = Path(__file__).resolve().parent.parent
        if subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], cwd=root, capture_output=True).returncode != 0:
            self.skipTest("not a git checkout")
        for path in (".env", "data/"):
            self.assertEqual(subprocess.run(["git", "check-ignore", "-q", path], cwd=root).returncode, 0, f"{path} is not ignored by git")


class AnswerChecks(unittest.TestCase):
    def test_origin_must_be_https_and_gives_a_host_and_a_port(self):
        self.assertEqual(install.origin_parts("https://localhost"), ("localhost", 443))
        self.assertEqual(install.origin_parts("https://baby.example.org:8443/"), ("baby.example.org", 8443))
        for bad in ("http://localhost", "localhost", "https://", "https://host/path", "https://user@host"):
            with self.assertRaises(install.AnswerError, msg=bad):
                install.origin_parts(bad)

    def test_username_follows_the_baby_buddy_account_rule(self):
        self.assertEqual(install.check_username(" river "), "river")
        for bad in ("", "has space", "x" * 151, "a/b"):
            with self.assertRaises(install.AnswerError, msg=bad):
                install.check_username(bad)

    def test_household_needs_one_owner_and_no_repeated_name(self):
        adults = [{"username": "river", "role": "owner"}, {"username": "wren", "role": "caregiver", "label": "Grandma"}]
        self.assertEqual(json.loads(install.household_text(adults)), {"adults": adults})
        with self.assertRaises(install.AnswerError):
            install.household_text([{"username": "wren", "role": "caregiver"}])
        with self.assertRaises(install.AnswerError):
            install.household_text([{"username": "river", "role": "owner"}, {"username": "river", "role": "owner"}])
        with self.assertRaises(install.AnswerError):
            install.household_text([])

    def test_passcode_uses_the_gateway_length_rule_after_normalizing(self):
        self.assertEqual(install.check_passcode("ten-chars!!"), "ten-chars!!")
        with self.assertRaises(install.AnswerError):
            install.check_passcode("short")
        with self.assertRaises(install.AnswerError):
            install.check_passcode("x" * 257)
        with self.assertRaises(install.AnswerError):
            install.check_passcode("abcdefghi")
        self.assertEqual(install.check_passcode("\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18\uff19\uff10"), "\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18\uff19\uff10")

    def test_role_and_child_name_have_simple_rules(self):
        self.assertEqual(install.check_role("owner"), "owner")
        with self.assertRaises(install.AnswerError):
            install.check_role("admin")
        self.assertEqual(install.check_child_name(" Juniper "), "Juniper")
        with self.assertRaises(install.AnswerError):
            install.check_child_name("  ")

    def test_birth_date_is_a_real_past_or_today_date(self):
        self.assertEqual(install.check_birth_date("2026-09-01"), "2026-09-01")
        for bad in ("2026-13-01", "09/01/2026", "", "2999-01-01"):
            with self.assertRaises(install.AnswerError, msg=bad):
                install.check_birth_date(bad)

    def test_the_computer_zone_is_a_valid_name_or_utc(self):
        self.assertEqual(install.check_zone(install.local_zone()), install.local_zone())

    def test_time_zone_must_be_a_real_name(self):
        self.assertEqual(install.check_zone("America/Chicago"), "America/Chicago")
        with self.assertRaises(install.AnswerError):
            install.check_zone("Mars/Base")


class WrittenFiles(unittest.TestCase):
    def test_env_file_has_the_settings_the_compose_file_reads_and_no_secret(self):
        text = install.env_text("https://baby.example.org:8443", "America/Chicago", 1000, 1001)
        lines = dict(line.split("=", 1) for line in text.splitlines() if line and not line.startswith("#"))
        self.assertEqual(lines["LITTLE_DAYS_ORIGIN"], "https://baby.example.org:8443")
        self.assertEqual((lines["LITTLE_DAYS_HOST"], lines["LITTLE_DAYS_HTTPS_PORT"]), ("baby.example.org", "8443"))
        self.assertEqual((lines["TZ"], lines["LITTLE_DAYS_UID"], lines["LITTLE_DAYS_GID"]), ("America/Chicago", "1000", "1001"))
        self.assertEqual(lines["LITTLE_DAYS_BIND"], "127.0.0.1")
        self.assertNotIn("KEY", text.replace("LITTLE_DAYS_ANTHROPIC_API_KEY", ""))

    def test_dry_run_must_report_the_expected_number_of_new_accounts(self):
        install.expect_accounts('{"mode": "dry-run", "accountChanges": 2}', 2)
        with self.assertRaises(install.StepError):
            install.expect_accounts('{"mode": "dry-run", "accountChanges": 0}', 2)
        with self.assertRaises(install.StepError):
            install.expect_accounts("not json", 2)


class TimerGrant(unittest.TestCase):
    def test_every_owner_may_stop_and_switch_timers_and_no_caregiver_may(self):
        adults = [{"username": "river", "role": "owner"}, {"username": "wren", "role": "caregiver"}, {"username": "ash", "role": "owner"}]
        self.assertEqual(install.timer_flags(adults), ["--timer-stop-adult", "river", "--timer-stop-adult", "ash"])


class StepOrder(unittest.TestCase):
    def test_a_failing_step_stops_the_run_and_later_steps_never_start(self):
        ran = []
        steps = [("one", lambda: ran.append("one")), ("two", lambda: (_ for _ in ()).throw(install.StepError("two", "broke"))), ("three", lambda: ran.append("three"))]
        with self.assertRaises(install.StepError):
            install.run_steps(steps)
        self.assertEqual(ran, ["one"])


if __name__ == "__main__":
    unittest.main()
