"""Checks the HTTP side of edgeai_stream.py with a fake camera: python3 -m unittest pi/test_edgeai_stream.py"""
import json
import os
import sys
import threading
import unittest
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import edgeai_stream as es  # noqa: E402

JPEG = b"\xff\xd8\xff\xe0fakejpeg\xff\xd9"


class StreamTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.buf = es.FrameBuffer()
        cls.buf.write(JPEG)
        info = {"name": "robot", "camera": "Camera Module 3", "width": 1280, "height": 960}
        cls.httpd = es.StreamingServer(("127.0.0.1", 0), es.make_handler(cls.buf, info))
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_info_has_cors_and_json(self):
        with urllib.request.urlopen(self.base + "/info") as r:
            self.assertEqual(r.headers["Access-Control-Allow-Origin"], "*")
            self.assertEqual(json.loads(r.read())["camera"], "Camera Module 3")

    def test_snapshot_returns_latest_frame(self):
        with urllib.request.urlopen(self.base + "/snapshot.jpg") as r:
            self.assertEqual(r.headers["Content-Type"], "image/jpeg")
            self.assertEqual(r.read(), JPEG)

    def test_preflight_allows_private_network(self):
        req = urllib.request.Request(self.base + "/snapshot.jpg", method="OPTIONS")
        with urllib.request.urlopen(req) as r:
            self.assertEqual(r.status, 204)
            self.assertEqual(r.headers["Access-Control-Allow-Private-Network"], "true")

    def test_unknown_path_is_404(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.base + "/nope")
        self.assertEqual(ctx.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
