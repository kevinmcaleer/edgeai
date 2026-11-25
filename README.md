# EdgeAI

Capture pictures, draw boxes round what matters, train a small vision model in the browser and run it on a Raspberry Pi robot. Everything runs in the browser: projects and pictures are kept in the browser's own storage (IndexedDB) and nothing is uploaded to a server.

This is step 1 of the plan ([epic #1](https://github.com/kevinmcaleer/edgeai/issues/1)): the app shell and image capture. Labelling, training, testing and export come in the next steps.

## What works now

- **Projects**: create, open, rename and delete. Each project is "Find objects" (boxes) or "Name the picture" (one class per picture).
- **Data workspace**: every picture in a grid, filters for All, No boxes yet, Train and Test, and an 80 / 20 train/test split chosen for you.
- **Add pictures** three ways:
  - **Upload** or drag and drop JPEG, PNG or WebP files onto the grid.
  - **This computer's camera**: a USB webcam or laptop camera. Space captures, Shift+Space takes a burst of 10.
  - **Raspberry Pi camera**: a Pi on your network running [`pi/edgeai_stream.py`](pi/edgeai_stream.py), with a live preview.
- Select with click, Shift-click and Ctrl-click; move to Train or Test (T); delete (Del) after a confirmation.
- Pictures are scaled so the long side is at most 1280 px and stored as JPEG, with a small thumbnail for the grid.
- Light and dark themes, from the EdgeAI design system (built on BetterCad's).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # static site in dist/
```

The built `dist/` folder is a static site: host it anywhere, or open it from `npm run preview`.

## Capture from a Raspberry Pi

On the Pi (Raspberry Pi OS Bookworm, with a Camera Module, AI Camera, HQ Camera or a USB webcam):

```sh
sudo apt install -y python3-picamera2     # ribbon cameras; already installed on Raspberry Pi OS
python3 edgeai_stream.py                  # add --usb for a USB webcam (needs python3-opencv)
```

It prints an address such as `robot.local:8000`. In EdgeAI, choose **Raspberry Pi camera**, type that address and press Connect.

The script serves `/info`, `/snapshot.jpg` and `/stream.mjpg` with CORS headers, so the page can fetch frames from another computer.

**https and http:** browsers block a page served over https from loading a Pi on plain http. Use EdgeAI from `npm run dev` or `npm run preview` on your computer (http://localhost), or open it in the Pi's own browser, when capturing from a Pi.

## Layout

```
src/
  main.ts            routes: projects list, or #p/<id>/<workspace>
  db.ts              IndexedDB storage for projects and pictures
  library.ts         adding pictures from files or captures
  imaging.ts         resizing and JPEG encoding
  split.ts           the 80 / 20 train/test split
  capture/local.ts   this computer's camera (getUserMedia)
  capture/pi.ts      talking to edgeai_stream.py
  views/             projects, data workspace, app shell, coming-soon workspaces
  ui/                DOM helpers, icons, dialogs, status line
  styles/            design-system tokens and components, app layout
pi/edgeai_stream.py  shares a Pi camera with the app
```
