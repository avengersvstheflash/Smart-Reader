import sys
import os
import time
import threading
import unittest

# Ensure sidecars/python directory is in sys.path
sys_path_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if sys_path_dir not in sys.path:
    sys.path.insert(0, sys_path_dir)

from lifecycle import LifecycleManager, ModelState


class TestLifecycleManager(unittest.TestCase):
    def test_t1_register_status_unloaded(self):
        """T1. register + status returns UNLOADED"""
        manager = LifecycleManager()
        # Empty status before registration
        self.assertEqual(manager.status(), {})

        manager.register("dummy_model")
        status = manager.status()
        self.assertIn("dummy_model", status)
        self.assertEqual(status["dummy_model"]["state"], "UNLOADED")
        self.assertEqual(status["dummy_model"]["in_flight"], 0)

    def test_t2_warm_transitions_unloaded_to_loaded(self):
        """T2. warm() transitions UNLOADED -> LOADED, idempotent if already LOADED"""
        manager = LifecycleManager()
        load_count = 0

        def dummy_load():
            nonlocal load_count
            load_count += 1

        manager.register("m1", load_fn=dummy_load)
        self.assertEqual(manager.get_state("m1"), "UNLOADED")

        ok = manager.warm("m1")
        self.assertTrue(ok)
        self.assertEqual(manager.get_state("m1"), "LOADED")
        self.assertEqual(load_count, 1)

        # Idempotent call
        ok2 = manager.warm("m1")
        self.assertTrue(ok2)
        self.assertEqual(manager.get_state("m1"), "LOADED")
        self.assertEqual(load_count, 1)

    def test_t3_unload_transitions_loaded_to_unloaded(self):
        """T3. unload() transitions LOADED -> UNLOADED"""
        manager = LifecycleManager()
        unload_count = 0

        def dummy_unload():
            nonlocal unload_count
            unload_count += 1

        manager.register("m1", unload_fn=dummy_unload)
        manager.warm("m1")
        self.assertEqual(manager.get_state("m1"), "LOADED")

        ok = manager.unload("m1")
        self.assertTrue(ok)
        self.assertEqual(manager.get_state("m1"), "UNLOADED")
        self.assertEqual(unload_count, 1)

        # Subsequent unload returns False because already UNLOADED
        self.assertFalse(manager.unload("m1"))

    def test_t4_unload_during_inflight_returns_false_and_stays_loaded(self):
        """T4. unload() during in-flight returns False and stays LOADED"""
        manager = LifecycleManager()
        manager.register("m1")
        manager.warm("m1")
        self.assertEqual(manager.get_state("m1"), "LOADED")

        with manager.acquire("m1"):
            self.assertEqual(manager.get_in_flight("m1"), 1)
            ok = manager.unload("m1")
            self.assertFalse(ok)
            self.assertEqual(manager.get_state("m1"), "LOADED")

        self.assertEqual(manager.get_in_flight("m1"), 0)
        # Once outside in-flight context, unload succeeds
        self.assertTrue(manager.unload("m1"))
        self.assertEqual(manager.get_state("m1"), "UNLOADED")

    def test_t5_concurrent_acquire_serialize_through_loading(self):
        """T5. concurrent acquire() from two threads serialize through LOADING"""
        manager = LifecycleManager()
        load_calls = 0
        load_lock = threading.Lock()

        def slow_load():
            nonlocal load_calls
            with load_lock:
                load_calls += 1
            time.sleep(0.08)

        manager.register("m1", load_fn=slow_load)

        acquired_results = []

        def worker(w_id):
            with manager.acquire("m1"):
                time.sleep(0.02)
                acquired_results.append(w_id)

        t1 = threading.Thread(target=worker, args=(1,))
        t2 = threading.Thread(target=worker, args=(2,))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(len(acquired_results), 2)
        self.assertEqual(load_calls, 1)
        self.assertEqual(manager.get_state("m1"), "LOADED")

    def test_t6_status_reports_idle_seconds_monotonic(self):
        """T6. status() reports idle_seconds as monotonic increasing"""
        manager = LifecycleManager()
        manager.register("m1")
        s1 = manager.status()["m1"]["idle_seconds"]
        time.sleep(0.06)
        s2 = manager.status()["m1"]["idle_seconds"]
        self.assertGreater(s2, s1)

    def test_t7_invalid_model_returns_404_from_route(self):
        """T7. invalid model name -> 404 from the route layer (mock FastAPI TestClient)"""
        import asyncio
        import httpx
        from main import app

        async def _test():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                r_status = await client.get("/v1/lifecycle/status")
                self.assertEqual(r_status.status_code, 200)

                r_warm = await client.post("/v1/lifecycle/warm?model=nonexistent_model")
                self.assertEqual(r_warm.status_code, 404)
                self.assertEqual(r_warm.json(), {"error": "unknown_model", "model": "nonexistent_model"})

                r_unload = await client.post("/v1/lifecycle/unload?model=nonexistent_model")
                self.assertEqual(r_unload.status_code, 404)
                self.assertEqual(r_unload.json(), {"error": "unknown_model", "model": "nonexistent_model"})

        asyncio.run(_test())

    def test_t8_reclaim_memory_does_not_raise(self):
        """T8. _reclaim_memory() does not raise when torch is absent or present"""
        manager = LifecycleManager()
        try:
            manager._reclaim_memory()
        except Exception as e:
            self.fail(f"_reclaim_memory() raised unexpected exception: {e}")


if __name__ == "__main__":
    unittest.main()
