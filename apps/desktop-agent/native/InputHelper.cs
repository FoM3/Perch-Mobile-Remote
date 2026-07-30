using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

// Reads one JSON control message per stdin line and injects it via SendInput.
// The desktop agent validates every message with Zod before it reaches here.
class InputHelper
{
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Explicit)]
    struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public INPUTUNION u; }

    const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const uint MOUSEEVENTF_MOVE = 0x0001, MOUSEEVENTF_ABSOLUTE = 0x8000;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008, MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020, MOUSEEVENTF_MIDDLEUP = 0x0040;
    const uint MOUSEEVENTF_WHEEL = 0x0800, MOUSEEVENTF_HWHEEL = 0x01000;
    const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
    const uint KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_UNICODE = 0x0004;
    const int SM_CXSCREEN = 0, SM_CYSCREEN = 1;
    const int SM_XVIRTUALSCREEN = 76, SM_YVIRTUALSCREEN = 77;
    const int SM_CXVIRTUALSCREEN = 78, SM_CYVIRTUALSCREEN = 79;

    // Active capture monitor; primary uses the simple absolute-to-primary mapping
    static bool monPrimary = true;
    static double monX = 0, monY = 0, monW = 0, monH = 0;

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")]
    static extern int GetSystemMetrics(int nIndex);

    static readonly Dictionary<string, ushort> Keys = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase)
    {
        {"CTRL",0x11},{"CONTROL",0x11},{"ALT",0x12},{"SHIFT",0x10},{"WIN",0x5B},
        {"ESC",0x1B},{"ESCAPE",0x1B},{"TAB",0x09},{"ENTER",0x0D},{"RETURN",0x0D},
        {"BACKSPACE",0x08},{"DELETE",0x2E},{"DEL",0x2E},{"SPACE",0x20},
        {"LEFT",0x25},{"UP",0x26},{"RIGHT",0x27},{"DOWN",0x28},
        {"HOME",0x24},{"END",0x23},{"PAGEUP",0x21},{"PAGEDOWN",0x22},
        {"`",0xC0},{"BACKTICK",0xC0},
        {"F1",0x70},{"F2",0x71},{"F3",0x72},{"F4",0x73},{"F5",0x74},{"F6",0x75},
        {"F7",0x76},{"F8",0x77},{"F9",0x78},{"F10",0x79},{"F11",0x7A},{"F12",0x7B},
    };

    static ushort ResolveVk(string name)
    {
        if (name == null) return 0;
        if (Keys.ContainsKey(name)) return Keys[name];
        if (name.Length == 1)
        {
            char c = char.ToUpperInvariant(name[0]);
            if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return (ushort)c;
        }
        return 0;
    }

    static void SendMouse(uint flags, int dx, int dy, uint data)
    {
        var inp = new INPUT { type = INPUT_MOUSE };
        inp.u.mi = new MOUSEINPUT { dx = dx, dy = dy, mouseData = data, dwFlags = flags };
        SendInput(1, new[] { inp }, Marshal.SizeOf(typeof(INPUT)));
    }

    static void SendKey(ushort vk, bool up)
    {
        var inp = new INPUT { type = INPUT_KEYBOARD };
        inp.u.ki = new KEYBDINPUT { wVk = vk, dwFlags = up ? KEYEVENTF_KEYUP : 0 };
        SendInput(1, new[] { inp }, Marshal.SizeOf(typeof(INPUT)));
    }

    static void SendUnicode(char c, bool up)
    {
        var inp = new INPUT { type = INPUT_KEYBOARD };
        inp.u.ki = new KEYBDINPUT { wScan = c, dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0) };
        SendInput(1, new[] { inp }, Marshal.SizeOf(typeof(INPUT)));
    }

    // Normalized 0..1 within the captured monitor maps to absolute mouse space.
    // Primary: the simple 0..65535 primary mapping. Other monitors: place the point
    // inside that monitor's bounds and map across the whole virtual desktop.
    static void MoveAbsolute(double x, double y)
    {
        if (monPrimary || monW <= 0 || monH <= 0)
        {
            int nx = (int)Math.Round(x * 65535.0);
            int ny = (int)Math.Round(y * 65535.0);
            SendMouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, nx, ny, 0);
            return;
        }
        double sx = monX + x * monW;
        double sy = monY + y * monH;
        int vx0 = GetSystemMetrics(SM_XVIRTUALSCREEN), vy0 = GetSystemMetrics(SM_YVIRTUALSCREEN);
        int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN), vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if (vw <= 0 || vh <= 0) return;
        int mx = (int)Math.Round((sx - vx0) * 65535.0 / vw);
        int my = (int)Math.Round((sy - vy0) * 65535.0 / vh);
        SendMouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, mx, my, 0);
    }

    static double Num(object v) { return v == null ? 0.0 : Convert.ToDouble(v); }
    static string Str(object v) { return v == null ? null : v.ToString(); }
    static bool Flag(object v) { return v != null && Convert.ToBoolean(v); }

    static void Handle(Dictionary<string, object> msg)
    {
        string type = Str(msg.ContainsKey("type") ? msg["type"] : null);
        var p = msg.ContainsKey("payload") ? msg["payload"] as Dictionary<string, object> : null;
        if (type == null || p == null) return;

        switch (type)
        {
            case "pointer.absolute":
                MoveAbsolute(Num(p["x"]), Num(p["y"]));
                break;
            case "pointer.relative":
                SendMouse(MOUSEEVENTF_MOVE, (int)Math.Round(Num(p["deltaX"])), (int)Math.Round(Num(p["deltaY"])), 0);
                break;
            case "pointer.scroll":
                if (p.ContainsKey("deltaY") && Num(p["deltaY"]) != 0)
                    SendMouse(MOUSEEVENTF_WHEEL, 0, 0, unchecked((uint)(int)Math.Round(-Num(p["deltaY"]))));
                if (p.ContainsKey("deltaX") && Num(p["deltaX"]) != 0)
                    SendMouse(MOUSEEVENTF_HWHEEL, 0, 0, unchecked((uint)(int)Math.Round(Num(p["deltaX"]))));
                break;
            case "pointer.click":
                {
                    if (p.ContainsKey("x") && p.ContainsKey("y")) MoveAbsolute(Num(p["x"]), Num(p["y"]));
                    string btn = Str(p.ContainsKey("button") ? p["button"] : "left");
                    Click(btn);
                    if (Flag(p.ContainsKey("double") ? p["double"] : null)) Click(btn);
                    break;
                }
            case "pointer.button":
                {
                    if (p.ContainsKey("x") && p.ContainsKey("y")) MoveAbsolute(Num(p["x"]), Num(p["y"]));
                    string btn = Str(p.ContainsKey("button") ? p["button"] : "left");
                    bool up = Str(p.ContainsKey("action") ? p["action"] : "down") == "up";
                    Button(btn, up);
                    break;
                }
            case "keyboard.text":
                {
                    string text = Str(p.ContainsKey("text") ? p["text"] : null);
                    if (text != null) foreach (char c in text) { SendUnicode(c, false); SendUnicode(c, true); }
                    break;
                }
            case "keyboard.key":
                {
                    ushort vk = ResolveVk(Str(p.ContainsKey("key") ? p["key"] : null));
                    if (vk == 0) break;
                    string action = Str(p.ContainsKey("action") ? p["action"] : "press");
                    if (action == "down") SendKey(vk, false);
                    else if (action == "up") SendKey(vk, true);
                    else { SendKey(vk, false); SendKey(vk, true); }
                    break;
                }
            case "keyboard.shortcut":
                {
                    var arr = p.ContainsKey("keys") ? p["keys"] as object[] : null;
                    if (arr == null) break;
                    var vks = new List<ushort>();
                    foreach (var k in arr) { ushort vk = ResolveVk(Str(k)); if (vk != 0) vks.Add(vk); }
                    foreach (var vk in vks) SendKey(vk, false);
                    for (int i = vks.Count - 1; i >= 0; i--) SendKey(vks[i], true);
                    break;
                }
            case "monitor.set":
                monPrimary = Flag(p.ContainsKey("primary") ? p["primary"] : true);
                monX = Num(p.ContainsKey("x") ? p["x"] : 0);
                monY = Num(p.ContainsKey("y") ? p["y"] : 0);
                monW = Num(p.ContainsKey("width") ? p["width"] : 0);
                monH = Num(p.ContainsKey("height") ? p["height"] : 0);
                break;
        }
    }

    static void Button(string btn, bool up)
    {
        if (btn == "right") SendMouse(up ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_RIGHTDOWN, 0, 0, 0);
        else if (btn == "middle") SendMouse(up ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0);
        else SendMouse(up ? MOUSEEVENTF_LEFTUP : MOUSEEVENTF_LEFTDOWN, 0, 0, 0);
    }

    static void Click(string btn) { Button(btn, false); Button(btn, true); }

    static void Main()
    {
        var serializer = new JavaScriptSerializer();
        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            if (line.Length == 0) continue;
            try
            {
                var msg = serializer.Deserialize<Dictionary<string, object>>(line);
                if (msg != null) Handle(msg);
            }
            catch { /* ignore malformed lines; the agent already validates */ }
        }
    }
}
