namespace VisualWaltz.Audio;

internal sealed class Tempo
{
    private const int TicksPerSecond = Spectrum.SampleRate / Spectrum.Hop;
    private const int TicksPerMinute = 60 * TicksPerSecond;
    private const int Window = 5 * TicksPerSecond;
    private const int MinimumHistory = 4 * TicksPerSecond;
    private const int CheckInterval = TicksPerSecond / 2;
    private const int ChecksToLock = 3;
    private const int ChecksToChange = 7;
    private const int ChecksWithoutPulse = 30 * TicksPerSecond / CheckInterval;
    private const float MinimumStrength = 0.34f;
    private const float ChangeMargin = 0.09f;
    private const int BinsPerTick = 8;
    private const int MinimumBpm = 50;
    private const int MaximumBpm = 220;
    private const int FirstBin = TicksPerMinute * BinsPerTick / MaximumBpm;
    private const int LastBin = TicksPerMinute * BinsPerTick / MinimumBpm;
    private const int MaximumLag = 2 * TicksPerMinute / MinimumBpm + 2;
    private static ReadOnlySpan<float> BandWeights => [1f, 0.94f, 0.87f, 0.98f];

    // Mirror the ring so the latest window is contiguous even when the cursor wraps.
    private readonly float[][] history = [new float[2 * Window], new float[2 * Window],
        new float[2 * Window], new float[2 * Window]];
    private int cursor;
    private int count;
    private int ticksSinceCheck;
    private int matchingChecks;
    private int weakChecks;
    private double candidate;
    private double? lockedBpm;

    public double? Bpm => lockedBpm is double bpm ? Math.Round(bpm, 1) : null;
    public float Confidence { get; private set; }

    public void Add(float bass, float mid, float treble, int quietTicks)
    {
        if (quietTicks >= 2 * TicksPerSecond)
        {
            ClearLock();
            count = ticksSinceCheck = 0;
            return;
        }

        Store(0, bass);
        Store(1, mid);
        Store(2, treble);
        Store(3, (bass + 0.8f * mid + 0.7f * treble) / 2.5f);
        cursor = (cursor + 1) % Window;
        count = Math.Min(count + 1, Window);
        if (++ticksSinceCheck < CheckInterval || count < MinimumHistory) return;
        ticksSinceCheck = 0;

        var (bpm, strength, lockedStrength) = Estimate();
        if (lockedBpm is not double locked)
        {
            if (strength >= MinimumStrength) Consider(bpm, strength, ChecksToLock);
            else matchingChecks = 0;
            return;
        }

        if (strength >= MinimumStrength && Agrees(locked, bpm))
        {
            // Follow small, consistent drift in the performance without chasing each estimate.
            if (Math.Abs(bpm - locked) > 0.25) lockedBpm = locked + (bpm - locked) * 0.25;
            Sustain(strength);
        }
        else if (strength >= MinimumStrength && IsRelatedPulse(locked, bpm))
        {
            // Half-time, double-time and triplet patterns can all fit the current beat grid.
            Sustain(Math.Max(lockedStrength, strength * 0.7f));
        }
        else if (strength >= MinimumStrength && strength >= lockedStrength + ChangeMargin)
        {
            weakChecks = 0;
            Confidence *= 0.9f;
            Consider(bpm, strength, ChecksToChange);
        }
        else if (lockedStrength >= MinimumStrength * 0.8f)
        {
            Sustain(lockedStrength);
        }
        else
        {
            matchingChecks = 0;
            Confidence *= 0.88f;
            if (++weakChecks >= ChecksWithoutPulse) ClearLock();
        }
    }

    private (double Bpm, float Strength, float LockedStrength) Estimate()
    {
        Span<float> scores = stackalloc float[LastBin - FirstBin + 3];
        Span<float> correlation = stackalloc float[MaximumLag + 1];
        Span<float> centered = stackalloc float[count];
        scores.Clear();
        for (int band = 0; band < history.Length; band++)
        {
            var samples = history[band].AsSpan(cursor + Window - count, count);
            float mean = 0;
            foreach (float sample in samples) mean += sample;
            mean /= samples.Length;
            float energy = 0;
            for (int i = 0; i < samples.Length; i++)
            {
                centered[i] = samples[i] - mean;
                energy += centered[i] * centered[i];
            }
            if (energy < 1e-6f) continue;

            // A quiet or nearly flat band should have less influence even if its noise repeats.
            float weight = BandWeights[band] * Math.Min(1, energy / (count * 0.004f));
            for (int lag = FirstBin / BinsPerTick - 1; lag <= MaximumLag; lag++)
                correlation[lag] = Correlate(centered, lag);

            for (int i = 0; i < scores.Length; i++)
            {
                float period = (FirstBin + i - 1) / (float)BinsPerTick;
                // Look for the pulse and its repeat. The repeat sharpens small BPM differences.
                float strength = 0.68f * Interpolate(correlation, period) +
                    0.32f * Interpolate(correlation, 2 * period);
                scores[i] = Math.Max(scores[i], weight * strength);
            }
        }

        // If the same rhythm repeats equally well at two periods, favor the earlier repeat.
        int best = 1;
        float bestRank = 0;
        for (int i = 1; i < scores.Length - 1; i++)
        {
            float rank = scores[i] - 0.09f * i / (scores.Length - 1);
            if (rank <= bestRank) continue;
            best = i;
            bestRank = rank;
        }

        float curvature = scores[best - 1] - 2 * scores[best] + scores[best + 1];
        float offset = curvature < 0
            ? Math.Clamp(0.5f * (scores[best - 1] - scores[best + 1]) / curvature, -0.5f, 0.5f)
            : 0;
        double bpm = Math.Clamp(TicksPerMinute * BinsPerTick / (FirstBin + best - 1 + (double)offset), MinimumBpm, MaximumBpm);
        float lockedStrength = lockedBpm is double locked
            ? Interpolate(scores, (float)(TicksPerMinute * BinsPerTick / locked) - FirstBin + 1)
            : 0;
        return (bpm, scores[best], lockedStrength);
    }

    private void Store(int band, float onset) => history[band][cursor + Window] = history[band][cursor] = onset;

    private void Consider(double bpm, float strength, int required)
    {
        if (matchingChecks == 0 || !Agrees(candidate, bpm))
        {
            candidate = bpm;
            matchingChecks = 1;
            return;
        }
        candidate += (bpm - candidate) / ++matchingChecks;
        if (matchingChecks < required) return;
        lockedBpm = candidate;
        Sustain(strength);
    }

    private void Sustain(float strength)
    {
        Confidence = strength;
        weakChecks = matchingChecks = 0;
    }

    private void ClearLock()
    {
        lockedBpm = null;
        Sustain(0);
    }

    private static float Correlate(ReadOnlySpan<float> samples, int lag)
    {
        float dot = 0, a2 = 0, b2 = 0;
        for (int i = lag; i < samples.Length; i++)
        {
            float a = samples[i], b = samples[i - lag];
            dot += a * b;
            a2 += a * a;
            b2 += b * b;
        }
        return a2 * b2 > 1e-12f ? dot / MathF.Sqrt(a2 * b2) : 0;
    }

    private static float Interpolate(ReadOnlySpan<float> values, float index)
    {
        int center = (int)(index + 0.5f);
        float x = index - center;
        float left = values[center - 1], peak = values[center], right = values[center + 1];
        return Math.Clamp(peak + 0.5f * x * (right - left + x * (left - 2 * peak + right)), -1, 1);
    }

    private static bool IsRelatedPulse(double locked, double bpm)
    {
        double ratio = Math.Max(locked, bpm) / Math.Min(locked, bpm);
        return Agrees(2, ratio) || Agrees(3, ratio);
    }

    private static bool Agrees(double reference, double estimate) => Math.Abs(reference - estimate) <= reference * 0.025;
}
