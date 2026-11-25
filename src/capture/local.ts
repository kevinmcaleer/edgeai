// A camera on the computer running the browser: a USB webcam, a laptop camera,
// or a Pi camera when the app is opened in the Pi's own browser.

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export async function listCameras(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

/** Opens a camera at up to 1280 × 960 px. */
export async function openCamera(deviceId?: string): Promise<MediaStream> {
  if (!cameraSupported()) throw new Error("This browser has no camera access. Try Chrome, Edge or Firefox over https or localhost.");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 960 } },
    });
  } catch (err) {
    throw new Error(cameraErrorText(err));
  }
}

export function cameraErrorText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "The browser blocked the camera. Allow it in the address bar, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found. Plug one in, then try again.";
  if (name === "NotReadableError") return "The camera is busy in another app. Close it there, then try again.";
  return err instanceof Error ? err.message : "The camera could not start.";
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
