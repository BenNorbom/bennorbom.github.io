const { execFile, spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const path = require('node:path')

// Explorer keeps the wallpaper on a WorkerW window that sits behind the desktop icon list.
// Sending 0x052C to Progman asks Explorer to create it, then the wallpaper window is reparented into it.
const hostScript = handle => `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class BhDesktopHost
{
    public delegate bool EnumProc(IntPtr window, IntPtr state);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindWindowW(string className, string windowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindWindowExW(IntPtr parent, IntPtr after, string className, string windowName);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wparam, IntPtr lparam, uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetParent(IntPtr child, IntPtr parent);

    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr window, uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumProc callback, IntPtr state);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindow(IntPtr window);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int index);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr dpiContext);

    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromPoint(Point pt, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr window, ref Point point);

    [DllImport("user32.dll")]
    public static extern bool ScreenToClient(IntPtr window, ref Point point);

    public static void EnablePerMonitorDpi()
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {}
        try { SetProcessDPIAware(); } catch {}
    }

    public static IntPtr FindWallpaperLayer(IntPtr progman)
    {
        // Windows 11 keeps the icon list and the wallpaper WorkerW as siblings under Progman.
        IntPtr layer = FindWindowExW(progman, IntPtr.Zero, "WorkerW", null);
        if (layer != IntPtr.Zero) return layer;
        // Windows 10 hosts the icon list in a top-level WorkerW and puts the wallpaper in the next one.
        EnumWindows(delegate(IntPtr window, IntPtr state)
        {
            if (FindWindowExW(window, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
            {
                IntPtr worker = FindWindowExW(IntPtr.Zero, window, "WorkerW", null);
                if (worker != IntPtr.Zero) layer = worker;
            }
            return true;
        }, IntPtr.Zero);
        return layer;
    }

    public static int Attach(IntPtr target)
    {
        EnablePerMonitorDpi();
        if (!IsWindow(target)) return 1;
        IntPtr progman = FindWindowW("Progman", null);
        if (progman == IntPtr.Zero) return 2;
        IntPtr layer = IntPtr.Zero;
        IntPtr ignored;
        for (int attempt = 0; attempt < 2 && layer == IntPtr.Zero; attempt++)
        {
            IntPtr wparam = attempt == 0 ? IntPtr.Zero : new IntPtr(0x0D);
            IntPtr lparam = attempt == 0 ? IntPtr.Zero : new IntPtr(0x01);
            SendMessageTimeout(progman, 0x052C, wparam, lparam, 0x0002, 2000, out ignored);
            layer = FindWallpaperLayer(progman);
        }
        if (layer == IntPtr.Zero) layer = progman;
        SetParent(target, layer);
        if (GetAncestor(target, 1) != layer) return 3;

        // Measure the primary monitor in physical screen pixels and map directly into the wallpaper host layer's client coordinates.
        // This works across all screen sizes, aspect ratios, multi-monitor layouts (including negative offsets), and Windows DPI scales (100%-300%).
        int x = -GetSystemMetrics(76);
        int y = -GetSystemMetrics(77);
        int width = GetSystemMetrics(0);
        int height = GetSystemMetrics(1);

        MonitorInfo monInfo = new MonitorInfo();
        monInfo.Size = Marshal.SizeOf(typeof(MonitorInfo));
        IntPtr primaryMonitor = MonitorFromPoint(new Point { X = 0, Y = 0 }, 1);
        if (primaryMonitor != IntPtr.Zero && GetMonitorInfo(primaryMonitor, ref monInfo))
        {
            width = monInfo.Monitor.Right - monInfo.Monitor.Left;
            height = monInfo.Monitor.Bottom - monInfo.Monitor.Top;
            Point monTopLeft = new Point { X = monInfo.Monitor.Left, Y = monInfo.Monitor.Top };
            if (ScreenToClient(layer, ref monTopLeft))
            {
                x = monTopLeft.X;
                y = monTopLeft.Y;
            }
        }

        // HWND_BOTTOM keeps the scene under the desktop icons even when Progman is the only available host.
        if (!SetWindowPos(target, new IntPtr(1), x, y, width, height, 0x0010 | 0x0040)) return 4;

        // Chromium keeps invisible resize borders outside the painted area, so grow past them until the canvas covers the monitor edge-to-edge.
        Rect windowRect;
        Rect clientRect;
        Point origin = new Point();
        if (GetWindowRect(target, out windowRect) && GetClientRect(target, out clientRect) && ClientToScreen(target, ref origin))
        {
            int left = origin.X - windowRect.Left;
            int top = origin.Y - windowRect.Top;
            int extraWidth = (windowRect.Right - windowRect.Left) - clientRect.Right;
            int extraHeight = (windowRect.Bottom - windowRect.Top) - clientRect.Bottom;
            if (left != 0 || top != 0 || extraWidth != 0 || extraHeight != 0)
                SetWindowPos(target, new IntPtr(1), x - left, y - top, width + extraWidth, height + extraHeight, 0x0010 | 0x0040);
        }
        return 0;
    }
}
"@
$status = [BhDesktopHost]::Attach([IntPtr][int64]${handle})
if ($status -ne 0) { throw "Windows refused to host the Black Hole Wallpaper window on the desktop (status $status)." }
`

const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

function nativeHandle(window) {
  const buffer = window.getNativeWindowHandle()
  const value = buffer.length >= 8 ? buffer.readBigUInt64LE(0).toString() : String(buffer.readUInt32LE(0))
  return /^\d+$/.test(value) ? value : null
}

/** Draws the given window behind the desktop icons of the primary display. Resolves false when Windows declines. */
function attachToDesktop(window, report = true) {
  return new Promise(resolve => {
    if (process.platform !== 'win32' || !window || window.isDestroyed()) return resolve(false)
    const handle = nativeHandle(window)
    if (!handle) return resolve(false)
    execFile(
      powershell,
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(hostScript(handle), 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 30_000 },
      (error, _stdout, stderr) => {
        if (error && report) console.error('Wallpaper attach failed:', String(stderr).trim() || error.message)
        resolve(!error)
      },
    )
  })
}

const visibilityScript = handle => `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;

public static class BhVisibility
{
  public delegate bool EnumProc(IntPtr window, IntPtr state);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr dpiContext);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr state);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder name, int count);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr window, int index);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr window, uint attribute, out int value, int size);

  public static bool Covered(IntPtr target)
  {
    MonitorInfo info = new MonitorInfo();
    info.Size = Marshal.SizeOf(typeof(MonitorInfo));
    if (!GetMonitorInfo(MonitorFromWindow(target, 2), ref info)) return true;
    bool covered = false;
    EnumWindows(delegate(IntPtr window, IntPtr state)
    {
      if (window == target || !IsWindowVisible(window) || IsIconic(window)) return true;
      int cloaked;
      if (DwmGetWindowAttribute(window, 14, out cloaked, sizeof(int)) == 0 && cloaked != 0) return true;
      if ((GetWindowLong(window, -20) & 0x08000080) != 0) return true;
      StringBuilder name = new StringBuilder(256);
      GetClassName(window, name, name.Capacity);
      string className = name.ToString();
      if (className == "Progman" || className == "WorkerW" || className == "Shell_TrayWnd" || className == "Shell_SecondaryTrayWnd") return true;
      Rect rect;
      if (!GetWindowRect(window, out rect)) return true;
      covered = Math.Min(rect.Right, info.Monitor.Right) > Math.Max(rect.Left, info.Monitor.Left)
        && Math.Min(rect.Bottom, info.Monitor.Bottom) > Math.Max(rect.Top, info.Monitor.Top);
      return !covered;
    }, IntPtr.Zero);
    return covered;
  }

  public static void Watch(IntPtr target)
  {
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {}
    try { SetProcessDPIAware(); } catch {}
    bool? previous = null;
    using (AutoResetEvent tick = new AutoResetEvent(false))
    {
      while (IsWindow(target))
      {
        bool covered = Covered(target);
        if (covered != previous)
        {
          Console.WriteLine(covered ? "paused" : "visible");
          Console.Out.Flush();
          previous = covered;
        }
        tick.WaitOne(750);
      }
    }
  }
}
"@
[BhVisibility]::Watch([IntPtr][int64]${handle})
`

function watchDesktopVisibility(window, onChange) {
  if (process.platform !== 'win32' || !window || window.isDestroyed()) return () => {}
  const handle = nativeHandle(window)
  if (!handle) return () => {}
  const helper = spawn(
    powershell,
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(visibilityScript(handle), 'utf16le').toString('base64')],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const lines = createInterface({ input: helper.stdout })
  let stopped = false
  lines.on('line', line => {
    if (!stopped && (line === 'paused' || line === 'visible')) onChange(line === 'paused')
  })
  helper.stderr.on('data', data => console.error('Wallpaper visibility:', String(data).trim()))
  helper.on('error', error => console.error('Wallpaper visibility failed:', error.message))
  helper.on('exit', code => {
    if (stopped) return
    onChange(true)
    if (code) console.error('Wallpaper visibility helper exited:', code)
  })
  return () => {
    stopped = true
    lines.close()
    helper.kill()
  }
}

module.exports = { attachToDesktop, watchDesktopVisibility }
