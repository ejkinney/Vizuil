using System.Diagnostics;
using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace VisualWaltz.Audio;

internal sealed record AudioState(string Source, string Status, string? Device, int Generation, SpectrumFrame Spectrum);

internal sealed class AudioEngine : IAsyncDisposable
{
    private readonly CancellationTokenSource shutdown = new();
    private readonly Func<MMDeviceEnumerator, MMDevice?> selectEndpoint;
    private readonly Task worker;
    private volatile string requestedSource = "off";
    private volatile AudioState current = new("off", "off", null, 0, SpectrumFrame.Empty);
    public AudioState Current => current;

    public AudioEngine(Func<MMDeviceEnumerator, MMDevice?>? selectEndpoint = null)
    {
        this.selectEndpoint = selectEndpoint ?? (devices => devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia));
        worker = Task.Run(Run);
    }
    public void SelectSource(string source) => requestedSource = source;

    private async Task Run()
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(20));
        var silence = new float[Spectrum.Hop * 2];
        var block = new float[silence.Length];
        Capture? capture = null;
        Spectrum? spectrum = null;
        DemoTrack? demo = null;
        string source = "off";
        int generation = 0;
        long checkDeviceAt = 0;
        int quiet = 0;
        try
        {
            while (await timer.WaitForNextTickAsync(shutdown.Token))
            {
                string next = requestedSource;
                if (next != source)
                {
                    capture?.Dispose();
                    capture = null;
                    source = next;
                    spectrum = next == "off" ? null : new Spectrum();
                    demo = next == "demo" ? new DemoTrack() : null;
                    current = new(source, source == "live" ? "connecting" : source, null, ++generation, SpectrumFrame.Empty);
                    checkDeviceAt = 0;
                    quiet = 0;
                }
                if (spectrum is null) continue;
                if (demo is not null)
                {
                    demo.Fill(block);
                    current = new(source, "demo", null, generation, spectrum.Analyze(block));
                    continue;
                }

                long now = Stopwatch.GetTimestamp();
                if (now >= checkDeviceAt || capture?.Failed == true)
                {
                    checkDeviceAt = now + Stopwatch.Frequency;
                    try
                    {
                        using var devices = new MMDeviceEnumerator();
                        using var endpoint = selectEndpoint(devices);
                        if (endpoint is null) throw new InvalidOperationException("No default audio output.");
                        if (capture?.DeviceId != endpoint.ID || capture.Failed)
                        {
                            capture?.Dispose();
                            capture = null;
                            capture = new Capture(endpoint);
                            spectrum = new Spectrum();
                            quiet = 0;
                            current = new(source, "quiet", capture.Name, ++generation, SpectrumFrame.Empty);
                        }
                    }
                    catch (Exception ex) when (ex is COMException or InvalidOperationException or ArgumentException or NotSupportedException)
                    {
                        capture?.Dispose();
                        capture = null;
                        current = new(source, "unavailable", null, generation, SpectrumFrame.Empty);
                    }
                }
                if (capture is null) continue;

                SpectrumFrame? frame = null;
                for (int i = 0; i < 8 && capture.Read(block); i++) frame = spectrum.Analyze(block);
                if (frame is null && capture.IsIdle) frame = spectrum.Analyze(silence);
                if (frame is null) continue;
                quiet = frame.Level < 0.025f ? Math.Min(30, quiet + 1) : 0;
                current = new(source, quiet >= 12 || frame.Level < 0.025f && current.Status != "live" ? "quiet" : "live",
                    capture.Name, generation, frame);
            }
        }
        catch (OperationCanceledException) when (shutdown.IsCancellationRequested) { }
        finally { capture?.Dispose(); }
    }

    public async ValueTask DisposeAsync()
    {
        shutdown.Cancel();
        await worker;
        shutdown.Dispose();
    }

    private sealed class Capture : IDisposable
    {
        private readonly WasapiRecorder recorder;
        private readonly MMDevice device;
        private readonly object gate = new();
        private readonly float[] buffer = new float[Spectrum.Hop * 2 * 8];
        private int start;
        private int count;
        private long lastPacket = Stopwatch.GetTimestamp();
        private volatile bool failed;
        public string Name { get; }
        public string DeviceId { get; }
        public bool Failed => failed;
        public bool IsIdle => Stopwatch.GetElapsedTime(Interlocked.Read(ref lastPacket)).TotalMilliseconds > 95;

        public Capture(MMDevice endpoint)
        {
            DeviceId = endpoint.ID;
            Name = endpoint.FriendlyName;
            // The recorder may reuse the device during reinitialization, so own its wrapper until disposal.
            using var devices = new MMDeviceEnumerator();
            device = devices.GetDevice(DeviceId);
            try
            {
                recorder = new WasapiRecorderBuilder().WithDevice(device).WithLoopbackCapture()
                    .WithFormat(WaveFormat.CreateIeeeFloatWaveFormat(Spectrum.SampleRate, 2))
                    .WithBufferLength(30).Build();
                recorder.DataAvailable += OnData;
                recorder.RecordingStopped += (_, _) => failed = true;
                try { recorder.StartRecording(); }
                catch { recorder.Dispose(); throw; }
            }
            catch { device.Dispose(); throw; }
        }

        private void OnData(ReadOnlySpan<byte> bytes, AudioClientBufferFlags flags, long devicePosition, long qpcPosition)
        {
            ReadOnlySpan<float> incoming = MemoryMarshal.Cast<byte, float>(bytes);
            if (incoming.Length > buffer.Length) incoming = incoming[^buffer.Length..];
            lock (gate)
            {
                if (IsIdle) count = 0;
                int discard = Math.Max(0, count + incoming.Length - buffer.Length);
                start = (start + discard) % buffer.Length;
                count -= discard;
                int write = (start + count) % buffer.Length;
                int tail = Math.Min(incoming.Length, buffer.Length - write);
                incoming[..tail].CopyTo(buffer.AsSpan(write));
                incoming[tail..].CopyTo(buffer);
                count += incoming.Length;
                Interlocked.Exchange(ref lastPacket, Stopwatch.GetTimestamp());
            }
        }

        public bool Read(Span<float> destination)
        {
            lock (gate)
            {
                if (count < destination.Length) return false;
                int tail = Math.Min(destination.Length, buffer.Length - start);
                buffer.AsSpan(start, tail).CopyTo(destination);
                buffer.AsSpan(0, destination.Length - tail).CopyTo(destination[tail..]);
                start = (start + destination.Length) % buffer.Length;
                count -= destination.Length;
                return true;
            }
        }

        public void Dispose()
        {
            recorder.DataAvailable -= OnData;
            recorder.Dispose();
            device.Dispose();
        }
    }
}
