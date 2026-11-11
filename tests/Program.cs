using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using VisualWaltz;
using VisualWaltz.Audio;

if (args.Contains("--rebind"))
{
    using var devices = new MMDeviceEnumerator();
    using var primary = devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
    int exerciseArgument = Array.IndexOf(args, "--exercise-output");
    string? exerciseOutput = exerciseArgument >= 0 ? args.ElementAtOrDefault(exerciseArgument + 1) : null;
    string? alternate = null;
    foreach (var device in devices.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
    {
        using (device)
            if (device.ID != primary.ID && alternate is null && (exerciseOutput is null || device.FriendlyName == exerciseOutput))
                alternate = device.ID;
    }
    Require(alternate is not null, "Endpoint rebinding needs a second active output.");
    string selected = primary.ID;
    using var secondary = devices.GetDevice(alternate!);
    await using var engine = new AudioEngine(enumerator => enumerator.GetDevice(Volatile.Read(ref selected)));
    engine.SelectSource("live");
    await WaitForDevice(primary.FriendlyName);
    int original = engine.Current.Generation;
    Volatile.Write(ref selected, alternate!);
    await WaitForDevice(secondary.FriendlyName);
    Require(engine.Current.Generation > original, "Output rebind must reset the analysis.");
    if (exerciseOutput is not null)
    {
        using var player = new WasapiPlayerBuilder().WithDevice(secondary).Build();
        var tone = new SignalGenerator(48000, 2) { Frequency = 110, Gain = 0.07, Type = SignalGeneratorType.Sin };
        player.Init(tone.ToWaveProvider());
        await WaitFor(() => engine.Current.Status == "quiet", "The test output is already playing audio.");
        player.Play();
        await WaitFor(() => engine.Current is { Status: "live", Spectrum.Energy: var energy } && energy[0] > 0.4, "Missed alternate-output playback.");
        player.Stop();
        await WaitFor(() => engine.Current.Status == "quiet", "Loopback did not return to quiet after playback stopped.");
        player.Play();
        await WaitFor(() => engine.Current.Status == "live", "Loopback did not resume after playback started again.");
        player.Stop();
        Console.WriteLine("Live quiet, playback, silence, and resume passed on the alternate output.");
    }
    Volatile.Write(ref selected, primary.ID);
    await WaitForDevice(primary.FriendlyName);
    Console.WriteLine("Rebound between two real WASAPI outputs and returned to the original endpoint.");
    return;

    Task WaitForDevice(string name) => WaitFor(() => engine.Current.Device == name,
        $"Did not capture {name}.");

    async Task WaitFor(Func<bool> check, string message)
    {
        for (int i = 0; i < 50 && !check(); i++) await Task.Delay(100);
        Require(check(), $"{message} State: {engine.Current.Status}.");
    }
}

if (args.Contains("--serve"))
{
    using (var devices = new MMDeviceEnumerator())
    {
        foreach (var device in devices.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        {
            using (device) Console.WriteLine($"Output: {device.FriendlyName}");
        }
    }
    await using var audio = new AudioEngine();
    await using var host = new ViewerHost(audio);
    Console.WriteLine(await host.StartAsync());
    await Task.Run(Console.ReadLine);
    return;
}

var stereo = new float[Spectrum.Hop * 2];
foreach ((double frequency, int group) in new[] { (90.0, 0), (870.0, 1), (7500.0, 2) })
{
    var spectrum = new Spectrum();
    SpectrumFrame result = SpectrumFrame.Empty;
    for (int hop = 0; hop < 18; hop++)
    {
        for (int i = 0; i < Spectrum.Hop; i++)
        {
            double time = (hop * Spectrum.Hop + i) / (double)Spectrum.SampleRate;
            float value = 0.18f * (float)Math.Sin(Math.Tau * frequency * time);
            stereo[i * 2] = value;
            stereo[i * 2 + 1] = -value; // Opposite phases should still register on a stereo mix.
        }
        result = spectrum.Analyze(stereo);
    }
    Require(result.Energy[group] > 0.7, $"Missed {frequency} Hz.");
    Require(Array.IndexOf(result.Energy, result.Energy.Max()) == group, $"Wrong band for {frequency} Hz.");
    Require(result.Hits[group] > 0, $"No onset detected at {frequency} Hz.");
    Console.WriteLine($"{frequency} Hz → group {group}.");
}

foreach (int bpm in new[] { 55, 90, 120, 150, 174, 210 })
{
    var spectrum = new Spectrum();
    SpectrumFrame result = SpectrumFrame.Empty;
    for (int hop = 0; hop < 1100; hop++)
    {
        for (int i = 0; i < Spectrum.Hop; i++)
        {
            double time = (hop * Spectrum.Hop + i) / (double)Spectrum.SampleRate;
            double phase = time % (60.0 / bpm);
            float value = (float)(0.55 * Math.Min(1, phase * 1000) * Math.Sin(Math.Tau * 95 * phase) * Math.Exp(-52 * phase));
            stereo[i * 2] = stereo[i * 2 + 1] = value;
        }
        result = spectrum.Analyze(stereo);
    }
    Require(result.Bpm is double estimate && Math.Abs(estimate - bpm) < 2, $"Expected {bpm} BPM, measured {result.Bpm}.");
    Console.WriteLine($"{bpm} BPM → {result.Bpm:F1} BPM (confidence {result.Confidence:P0}).");
    Array.Clear(stereo);
    for (int hop = 0; hop < 125; hop++) result = spectrum.Analyze(stereo);
    Require(result.Bpm is null && result.Level < 0.001 && result.Bands.All(band => band == 0), "Silence did not clear the analysis.");
}

var tempo = new Tempo();
var random = new Random(1729);
for (int hop = 0; hop < 1200; hop++)
{
    tempo.Add(random.NextSingle(), random.NextSingle(), random.NextSingle(), 0);
    Require(tempo.Bpm is null, "Irregular audio should not establish a tempo.");
}
tempo = new Tempo();
for (int hop = 0; hop < 400; hop++)
{
    tempo.Add(Pulse(hop, 120), 0, 0, 0);
    if (hop < 249) Require(tempo.Bpm is null, "Tempo locked before the rhythm was established.");
}
Require(tempo.Bpm is double initial && Math.Abs(initial - 120) < 1, "A steady rhythm should establish the lock.");
for (int hop = 0; hop < 75; hop++)
{
    tempo.Add(Pulse(hop, 180), 0, 0, 0);
    Require(Near(tempo.Bpm, 120), "A short drum fill should not alter the locked tempo.");
}
for (int hop = 0; hop < 225; hop++)
{
    tempo.Add(Pulse(hop, 120), 0, 0, 0);
    Require(Near(tempo.Bpm, 120), "Returning from a fill should keep the same lock.");
}
int changedAt = -1;
for (int hop = 0; hop < 450; hop++)
{
    tempo.Add(Pulse(hop, 126), 0, 0, 0);
    Require(Near(tempo.Bpm, 120, 2.5) || Near(tempo.Bpm, 126), $"Tempo should switch to the confirmed BPM without dropping the lock, measured {tempo.Bpm}.");
    if (changedAt < 0 && Near(tempo.Bpm, 126)) changedAt = hop;
}
Require(changedAt >= 3 * 50 && Near(tempo.Bpm, 126), "A sustained tempo change should establish a new lock after confirmation.");
for (int hop = 0; hop < 24 * 50; hop++)
{
    tempo.Add(0, 0, 0, 0);
    Require(Near(tempo.Bpm, 126), "The tempo should survive a section without clear transients.");
}
Require(tempo.Confidence < 0.4, "The hold should reflect the loss of evidence in its confidence.");
for (int hop = 0; hop < 14 * 50; hop++) tempo.Add(0, 0, 0, 0);
Require(tempo.Bpm is null && tempo.Confidence == 0, "A sustained loss of rhythmic evidence should clear the lock.");
Console.WriteLine($"Tempo held through a fill and switched from 120 to 126 BPM after {changedAt / 50.0:F1}s, without dropping the beat.");

tempo = new Tempo();
double beatPhase = 0;
for (int hop = 0; hop < 36 * 50; hop++)
{
    double bpm = 96 + Math.Clamp(hop / 50.0 - 7, 0, 25) * 0.6;
    beatPhase += bpm / 3000;
    double distance = (beatPhase - Math.Round(beatPhase)) * 3000 / bpm;
    tempo.Add(0, 0.75f * (float)Math.Exp(-0.7 * distance * distance), 0, 0);
    if (hop >= 7 * 50) Require(Near(tempo.Bpm, bpm, 3), $"Tempo lost gradual drift at {hop / 50.0:F1}s ({tempo.Bpm} vs {bpm:F1}).");
}
Require(Near(tempo.Bpm, 111), "Tempo did not settle after a gradual increase.");

// Exercise the FFT, onset detector and tempo tracker with arrangement changes in stereo PCM.
var arrangement = new Spectrum();
const int ArrangementTempoChange = 48;
int transitionAt = -1;
for (int hop = 0; hop < (ArrangementTempoChange + 12) * 50; hop++)
{
    for (int i = 0; i < Spectrum.Hop; i++)
    {
        double time = (hop * Spectrum.Hop + i) / (double)Spectrum.SampleRate;
        double beat = 60.0 / 108;
        float pad = 0.04f * (float)(Math.Sin(Math.Tau * 261.63 * time) + Math.Sin(Math.Tau * 329.63 * time));
        float rhythm = time switch
        {
            < 8 => Note(time % beat, 78, 0.52, 28) + Note((time + beat / 2) % beat, 7900, 0.07, 80),
            < 18 => Note((time + beat / 2) % (2 * beat), 790, 0.24, 42),
            < 38 => 0,
            < ArrangementTempoChange => Note(time % (beat / 2), 7250, 0.12, 60),
            _ => Note((time - ArrangementTempoChange) % (60.0 / 145), 950, 0.22, 28),
        };
        stereo[i * 2] = pad + rhythm;
        stereo[i * 2 + 1] = pad - rhythm * 0.8f;
    }
    var frame = arrangement.Analyze(stereo);
    if (hop >= 6 * 50 && hop < ArrangementTempoChange * 50)
        Require(Near(frame.Bpm, 108, 1.5), $"Lost the arrangement's beat at {hop / 50.0:F1}s ({frame.Bpm} BPM).");
    if (hop >= ArrangementTempoChange * 50)
    {
        Require(Near(frame.Bpm, 145, 1.5) || (transitionAt < 0 && Near(frame.Bpm, 108, 1.5)),
            $"Unexpected change at {hop / 50.0:F1}s ({frame.Bpm} BPM).");
        if (transitionAt < 0 && Near(frame.Bpm, 145, 1.5)) transitionAt = hop;
    }
}
Require(transitionAt >= (ArrangementTempoChange + 3) * 50, "The arrangement should switch to its sustained new tempo.");
Console.WriteLine($"Arrangement held 108 BPM through half-time, a 20s drumless break and double-time, then picked up 145 BPM after {(transitionAt - ArrangementTempoChange * 50) / 50.0:F1}s.");

var acoustic = new Spectrum();
for (int hop = 0; hop < 16 * 50; hop++)
{
    for (int i = 0; i < Spectrum.Hop; i++)
    {
        double time = (hop * Spectrum.Hop + i) / (double)Spectrum.SampleRate;
        double beat = 60.0 / 76;
        int step = (int)(time / beat);
        double onset = time % beat;
        double swing = onset - beat * 0.65;
        double root = step % 2 == 0 ? 261.63 : 293.66;
        float value = Note(onset, root, 0.13, 13) + Note(onset, root * 1.5, 0.06, 11) +
            Note(onset, root * 2, 0.04, 18) + Note(swing, root * 1.25, 0.035, 27);
        stereo[i * 2] = stereo[i * 2 + 1] = value;
    }
    var frame = acoustic.Analyze(stereo);
    if (hop >= 7 * 50) Require(Near(frame.Bpm, 76, 1.5), $"Swung chord pattern measured {frame.Bpm} BPM.");
}
Console.WriteLine("A swung, drumless chord pattern held 76 BPM.");

var demo = new DemoTrack();
var demoSpectrum = new Spectrum();
SpectrumFrame demoResult = SpectrumFrame.Empty;
for (int hop = 0; hop < 900; hop++)
{
    demo.Fill(stereo);
    demoResult = demoSpectrum.Analyze(stereo);
}
Require(demoResult.Hits.All(hit => hit > 20), "The demo must exercise every projectile family.");
Require(demoResult.Bpm is double demoBpm && Math.Abs(demoBpm - 120) < 2, "The demo should lock to its 120 BPM rhythm.");
Console.WriteLine($"Silent demo → {string.Join(", ", demoResult.Hits)} hits, {demoResult.Bpm} BPM.");

static float Pulse(int hop, int bpm)
{
    double period = 3000.0 / bpm;
    double offset = hop - Math.Round(hop / period) * period;
    return (float)(0.75 * Math.Exp(-0.7 * offset * offset));
}

static float Note(double age, double hz, double amplitude, double decay) => age < 0 ? 0 :
    (float)(amplitude * Math.Min(1, age * 1000) * Math.Sin(Math.Tau * hz * age) * Math.Exp(-decay * age));

static bool Near(double? value, double target, double tolerance = 1) =>
    value is double bpm && Math.Abs(bpm - target) < tolerance;

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
