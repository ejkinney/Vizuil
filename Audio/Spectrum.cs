using NAudio.Dsp;

namespace Vizuil.Audio;

internal sealed record SpectrumFrame(float Level, float[] Bands, float[] Energy,
    long[] Hits, double? Bpm, float Confidence)
{
    public static readonly SpectrumFrame Empty = new(0, new float[Spectrum.BandCount], new float[3], new long[3], null, 0);
}

internal sealed class Spectrum
{
    public const int SampleRate = 48000;
    public const int Hop = SampleRate / 50;
    public const int BandCount = 32;
    private const int FftBits = 12;
    private const int FftSize = 1 << FftBits;
    private readonly float[] window = Enumerable.Range(0, FftSize)
        .Select(i => 0.5f - 0.5f * MathF.Cos(MathF.Tau * i / (FftSize - 1))).ToArray();
    private readonly Complex[] left = new Complex[FftSize];
    private readonly Complex[] right = new Complex[FftSize];
    private readonly float[] samples = new float[FftSize * 2];
    private readonly float[] power = new float[FftSize / 2];
    private readonly (int Start, int End)[] bins = Enumerable.Range(0, BandCount).Select(i =>
    {
        var start = (int)Math.Ceiling(40 * Math.Pow(400, i / (double)BandCount) * FftSize / SampleRate);
        var end = (int)Math.Ceiling(40 * Math.Pow(400, (i + 1.0) / BandCount) * FftSize / SampleRate);
        return (start, Math.Max(start + 1, end));
    }).ToArray();
    private readonly float[] previousBands = new float[BandCount];
    private readonly float[] previousTempoBands = new float[BandCount];
    private readonly float[] tempoBaseline = new float[3];
    private readonly float[] fluxBaseline = new float[3];
    private readonly float[] smoothEnergy = new float[3];
    private readonly long[] hits = new long[3];
    private readonly int[] nextHit = new int[3];
    private readonly Tempo tempo = new();
    private int cursor;
    private int tick;
    private int quietTicks;
    private float level;

    // Each call accepts 20 ms of interleaved stereo. Raw samples never leave this process.
    public SpectrumFrame Analyze(ReadOnlySpan<float> stereo)
    {
        float squared = 0;
        for (int i = 0; i < stereo.Length; i++)
        {
            float sample = float.IsFinite(stereo[i]) ? Math.Clamp(stereo[i], -1, 1) : 0;
            samples[cursor] = sample;
            cursor = (cursor + 1) % samples.Length;
            squared += sample * sample;
        }
        float rms = MathF.Sqrt(squared / stereo.Length);
        bool silent = rms < 0.0006f;
        quietTicks = silent ? quietTicks + 1 : 0;
        float target = silent ? 0 : Scale(rms, -60, -8);
        level = Follow(level, target, 0.52f, 0.15f);

        for (int i = 0; i < FftSize; i++)
        {
            int index = (cursor + 2 * i) % samples.Length;
            left[i] = new Complex { X = samples[index] * window[i] };
            right[i] = new Complex { X = samples[index + 1] * window[i] };
        }
        FastFourierTransform.FFT(true, FftBits, left);
        FastFourierTransform.FFT(true, FftBits, right);
        for (int i = 0; i < power.Length; i++)
            power[i] = 8 * (Square(left[i]) + Square(right[i]));

        var bands = new float[BandCount];
        Span<float> flux = stackalloc float[3];
        Span<float> tempoFlux = stackalloc float[3];
        Span<float> groupEnergy = stackalloc float[3];
        Span<int> counts = stackalloc int[3];
        flux.Clear();
        tempoFlux.Clear();
        groupEnergy.Clear();
        counts.Clear();
        for (int i = 0; i < bands.Length; i++)
        {
            var (start, end) = bins[i];
            float peak = 0;
            for (int k = start; k < end; k++) peak = Math.Max(peak, power[k]);
            float db = Decibels(MathF.Sqrt(peak));
            float band = Math.Clamp((db + 65) / 53, 0, 1);
            // Keep dynamics above the display ceiling and use a softer floor for quiet instruments.
            float tempoBand = Math.Max(0, (db + 72) / 53);
            int group = i < 8 ? 0 : i < 22 ? 1 : 2;
            flux[group] += Math.Max(0, band - previousBands[i]);
            tempoFlux[group] += Math.Max(0, tempoBand - previousTempoBands[i]);
            groupEnergy[group] = Math.Max(groupEnergy[group], band);
            counts[group]++;
            previousBands[i] = band;
            previousTempoBands[i] = tempoBand;
            bands[i] = band;
        }

        tick++;
        for (int i = 0; i < flux.Length; i++)
        {
            flux[i] /= counts[i];
            if (!silent && tick >= nextHit[i] && flux[i] > Math.Max(0.017f, fluxBaseline[i] * 2.1f))
            {
                hits[i]++;
                nextHit[i] = tick + (i == 0 ? 8 : 5);
            }
            fluxBaseline[i] += 0.07f * (flux[i] - fluxBaseline[i]);
            smoothEnergy[i] = Follow(smoothEnergy[i], groupEnergy[i], 0.5f, 0.16f);
            float onset = silent ? 0 : tempoFlux[i] / counts[i];
            tempoBaseline[i] += 0.025f * (onset - tempoBaseline[i]);
            tempoFlux[i] = onset / (0.035f + 2 * tempoBaseline[i] + onset);
        }
        tempo.Add(tempoFlux[0], tempoFlux[1], tempoFlux[2], quietTicks);

        return new SpectrumFrame(level, bands, (float[])smoothEnergy.Clone(), (long[])hits.Clone(), tempo.Bpm, tempo.Confidence);
    }

    private static float Square(Complex bin) => bin.X * bin.X + bin.Y * bin.Y;
    private static float Decibels(float amplitude) => 20 * MathF.Log10(Math.Max(amplitude, 1e-8f));
    private static float Scale(float amplitude, float floor, float ceiling) =>
        Math.Clamp((Decibels(amplitude) - floor) / (ceiling - floor), 0, 1);
    private static float Follow(float value, float target, float attack, float release) =>
        value + (target > value ? attack : release) * (target - value);
}
