#!/usr/bin/env python3
"""Share a Raspberry Pi camera with the EdgeAI web app.

Serves, on port 8000 by default:
  /info          JSON: the Pi's name, the camera and the frame size
  /snapshot.jpg  the latest frame as a JPEG (what Capture saves)
  /stream.mjpg   a live MJPEG preview

Every answer carries CORS headers so the EdgeAI page, opened on another computer, can fetch frames.

Uses Picamera2 for a ribbon camera (Camera Module 3, AI Camera, HQ Camera). With --usb, or when Picamera2
is not installed, it uses OpenCV for a USB webcam instead.

    sudo apt install -y python3-picamera2        # ribbon cameras (already on Raspberry Pi OS)
    sudo apt install -y python3-opencv           # only for --usb
    python3 edgeai_stream.py [--port 8000] [--width 1280 --height 960] [--usb [--device 0]]
"""
from __future__ import annotations

import argparse
import io
import json
import socket
import threading
import time
from http import server
from socketserver import ThreadingMixIn

BOUNDARY = "FRAME"


class FrameBuffer(io.BufferedIOBase):
    """Holds the newest JPEG frame and wakes anyone waiting for the next one."""

    def __init__(self) -> None:
        self.frame: bytes | None = None
        self.condition = threading.Condition()

    def write(self, buf: bytes) -> int:  # called by the Picamera2 encoder for each JPEG
        with self.condition:
            self.frame = bytes(buf)
            self.condition.notify_all()
        return len(buf)

    def latest(self, timeout: float = 5.0) -> bytes:
        with self.condition:
            if self.frame is None:
                self.condition.wait(timeout)
            if self.frame is None:
                raise TimeoutError("The camera has not produced a frame yet")
            return self.frame

    def next(self, timeout: float = 5.0) -> bytes:
        with self.condition:
            self.condition.wait(timeout)
            if self.frame is None:
                raise TimeoutError("The camera has not produced a frame yet")
            return self.frame


def start_picamera2(buf: FrameBuffer, width: int, height: int) -> tuple[str, int, int, object]:
    from picamera2 import Picamera2  # type: ignore
    from picamera2.encoders import JpegEncoder  # type: ignore
    from picamera2.outputs import FileOutput  # type: ignore

    cam = Picamera2()
    config = cam.create_video_configuration(main={"size": (width, height)})
    cam.configure(config)
    model = cam.camera_properties.get("Model", "Raspberry Pi camera")
    names = {"imx708": "Camera Module 3", "imx500": "AI Camera", "imx477": "HQ Camera", "imx219": "Camera Module 2", "ov5647": "Camera Module 1"}
    w, h = config["main"]["size"]
    cam.start_recording(JpegEncoder(q=90), FileOutput(buf))
    return names.get(str(model).lower(), str(model)), w, h, cam


def start_opencv(buf: FrameBuffer, width: int, height: int, device: int) -> tuple[str, int, int, object]:
    import cv2  # type: ignore

    cap = cv2.VideoCapture(device)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    if not cap.isOpened():
        raise SystemExit(f"No USB camera at /dev/video{device}. Try --device 1, or leave out --usb for a ribbon camera.")
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    def loop() -> None:
        while True:
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.05)
                continue
            ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if ok:
                buf.write(jpg.tobytes())

    threading.Thread(target=loop, daemon=True).start()
    return f"USB camera {device}", w, h, cap


def make_handler(buf: FrameBuffer, info: dict):
    class Handler(server.BaseHTTPRequestHandler):
        def cors(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "*")
            # Lets Chrome reach a device on the local network from a public page.
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Cache-Control", "no-store")

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            path = self.path.split("?", 1)[0]
            try:
                if path in ("/", "/info"):
                    body = json.dumps(info).encode()
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                elif path == "/snapshot.jpg":
                    frame = buf.latest()
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(frame)))
                    self.end_headers()
                    self.wfile.write(frame)
                elif path == "/stream.mjpg":
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY}")
                    self.end_headers()
                    while True:
                        frame = buf.next()
                        self.wfile.write(f"--{BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: {len(frame)}\r\n\r\n".encode())
                        self.wfile.write(frame)
                        self.wfile.write(b"\r\n")
                else:
                    self.send_error(404, "Try /info, /snapshot.jpg or /stream.mjpg")
            except (BrokenPipeError, ConnectionResetError):
                pass  # the browser closed the preview
            except TimeoutError as err:
                self.send_error(503, str(err))

        def log_message(self, fmt: str, *args) -> None:  # quieter: only errors
            if len(args) > 1 and str(args[1])[:1] in ("4", "5"):
                super().log_message(fmt, *args)

    return Handler


class StreamingServer(ThreadingMixIn, server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    ap = argparse.ArgumentParser(description="Share this Pi's camera with the EdgeAI web app.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=960)
    ap.add_argument("--usb", action="store_true", help="use a USB webcam through OpenCV")
    ap.add_argument("--device", type=int, default=0, help="USB camera number (/dev/videoN)")
    args = ap.parse_args()

    buf = FrameBuffer()
    if args.usb:
        camera, w, h, handle = start_opencv(buf, args.width, args.height, args.device)
    else:
        try:
            camera, w, h, handle = start_picamera2(buf, args.width, args.height)
        except ImportError:
            print("Picamera2 is not installed, so trying a USB webcam through OpenCV.")
            camera, w, h, handle = start_opencv(buf, args.width, args.height, args.device)

    host = socket.gethostname()
    info = {"name": host, "camera": camera, "width": w, "height": h}
    httpd = StreamingServer(("", args.port), make_handler(buf, info))
    print(f"{camera} at {w} x {h} px.")
    print(f"In EdgeAI, choose Raspberry Pi camera and type:  {host}.local:{args.port}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        stop = getattr(handle, "stop_recording", None) or getattr(handle, "release", None)
        if stop:
            stop()


if __name__ == "__main__":
    main()
