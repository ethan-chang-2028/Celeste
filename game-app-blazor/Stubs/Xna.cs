// Minimal stubs for the Microsoft.Xna.Framework surface that Player.cs touches.
// Only the members Player.cs actually uses are defined.
// This file is hand-written. It is NOT a real MonoGame implementation.

using System;

namespace Microsoft.Xna.Framework
{
    public struct Vector2 : IEquatable<Vector2>
    {
        public float X;
        public float Y;

        public Vector2(float x, float y) { X = x; Y = y; }
        public Vector2(float v) { X = v; Y = v; }

        public static readonly Vector2 Zero  = new Vector2(0, 0);
        public static readonly Vector2 One   = new Vector2(1, 1);
        public static readonly Vector2 UnitX = new Vector2(1, 0);
        public static readonly Vector2 UnitY = new Vector2(0, 1);

        public float Length()        => (float)Math.Sqrt(X * X + Y * Y);
        public float LengthSquared() => X * X + Y * Y;

        public void Normalize()
        {
            float len = Length();
            if (len > 0) { X /= len; Y /= len; }
        }

        public static Vector2 operator +(Vector2 a, Vector2 b) => new Vector2(a.X + b.X, a.Y + b.Y);
        public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.X - b.X, a.Y - b.Y);
        public static Vector2 operator -(Vector2 v)            => new Vector2(-v.X, -v.Y);
        public static Vector2 operator *(Vector2 a, Vector2 b) => new Vector2(a.X * b.X, a.Y * b.Y);
        public static Vector2 operator *(Vector2 v, float s)   => new Vector2(v.X * s, v.Y * s);
        public static Vector2 operator *(float s, Vector2 v)   => new Vector2(v.X * s, v.Y * s);
        public static Vector2 operator *(Vector2 v, int s)     => new Vector2(v.X * s, v.Y * s);
        public static Vector2 operator *(int s, Vector2 v)     => new Vector2(v.X * s, v.Y * s);
        public static Vector2 operator /(Vector2 v, float s)   => new Vector2(v.X / s, v.Y / s);
        public static bool    operator ==(Vector2 a, Vector2 b)=> a.X == b.X && a.Y == b.Y;
        public static bool    operator !=(Vector2 a, Vector2 b)=> a.X != b.X || a.Y != b.Y;

        public bool Equals(Vector2 o) => X == o.X && Y == o.Y;
        public override bool Equals(object o) => o is Vector2 v && Equals(v);
        public override int GetHashCode() => X.GetHashCode() ^ Y.GetHashCode();
        public override string ToString() => $"({X}, {Y})";
    }

    public struct Vector3
    {
        public float X, Y, Z;
        public Vector3(float x, float y, float z) { X = x; Y = y; Z = z; }
    }

    public struct Color
    {
        public byte R, G, B, A;
        public Color(byte r, byte g, byte b, byte a = 255) { R = r; G = g; B = b; A = a; }
        public Color(int r, int g, int b) : this((byte)r, (byte)g, (byte)b, 255) {}
        public Color(float r, float g, float b, float a = 1f)
            : this((byte)(r * 255), (byte)(g * 255), (byte)(b * 255), (byte)(a * 255)) {}
        public static readonly Color White = new Color(255, 255, 255);
        public static readonly Color Black = new Color(0, 0, 0);
        public static readonly Color Red   = new Color(255, 0, 0);
        public static Color operator *(Color c, float s)
            => new Color((byte)(c.R * s), (byte)(c.G * s), (byte)(c.B * s), (byte)(c.A * s));
    }

    public struct Rectangle
    {
        public int X, Y, Width, Height;
        public Rectangle(int x, int y, int w, int h) { X = x; Y = y; Width = w; Height = h; }
        public int Left   => X;
        public int Right  => X + Width;
        public int Top    => Y;
        public int Bottom => Y + Height;
    }

    public static class MathHelper
    {
        public const float Pi      = (float)Math.PI;
        public const float TwoPi   = (float)(Math.PI * 2);
        public const float PiOver2 = (float)(Math.PI / 2);
        public const float PiOver4 = (float)(Math.PI / 4);

        public static float Lerp(float a, float b, float t) => a + (b - a) * t;
        public static float Clamp(float v, float min, float max) => v < min ? min : (v > max ? max : v);
        public static int   Clamp(int v, int min, int max)       => v < min ? min : (v > max ? max : v);
        public static float ToRadians(float deg) => deg * Pi / 180f;
        public static float ToDegrees(float rad) => rad * 180f / Pi;
        public static float Min(float a, float b) => a < b ? a : b;
        public static float Max(float a, float b) => a > b ? a : b;
    }
}

namespace Microsoft.Xna.Framework.Input
{
    public enum Keys
    {
        None = 0,
        Left, Right, Up, Down, Space, LeftShift, RightShift, LeftControl, RightControl,
        A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
        Escape, Enter, Tab, Back,
        D0, D1, D2, D3, D4, D5, D6, D7, D8, D9,
        F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12,
    }

    public enum Buttons
    {
        None = 0,
        A, B, X, Y,
        LeftShoulder, RightShoulder, LeftTrigger, RightTrigger,
        DPadUp, DPadDown, DPadLeft, DPadRight,
        LeftStick, RightStick,
        Start, Back,
    }
}
