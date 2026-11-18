import unittest

import child_tools as remove


class FixtureTargetTests(unittest.TestCase):
    def test_a_summary_with_a_number_and_the_fixture_prefix_is_the_only_target(self):
        self.assertEqual(remove.target({"childId": 7, "name": "LittleDaysRuntimeTest-ab12cd34"}), (7, "LittleDaysRuntimeTest-ab12cd34"))

    def test_a_missing_child_means_nothing_to_remove(self):
        self.assertIsNone(remove.target({"childId": None, "name": "LittleDaysRuntimeTest-ab12cd34"}))
        self.assertIsNone(remove.target({"childId": None, "name": ""}))

    def test_anything_else_is_refused_so_a_real_child_is_never_deleted(self):
        for summary in ({"childId": 7, "name": "Real child"}, {"childId": "7", "name": "LittleDaysRuntimeTest-x"}, {"childId": True, "name": "LittleDaysRuntimeTest-x"}, {"childId": 0, "name": "LittleDaysRuntimeTest-x"}, {"childId": 7}, []):
            with self.assertRaises(RuntimeError, msg=str(summary)):
                remove.target(summary)


if __name__ == "__main__":
    unittest.main()
