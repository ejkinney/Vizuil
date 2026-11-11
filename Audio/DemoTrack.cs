namespace Vizuil.Audio;

// A repeating drum-and-synth arrangement. It feeds the analyzer directly and has no playback output.
internal sealed class DemoTrack
{
    private const double BeatLength = 0.5;
    private static readonly double[] Notes = [65.41, 55, 73.42, 49];
    private long sample;
    private uint random = 0x901cf3a7;
    private double previousNoise;

    public void Fill(Span<float> stereo)
    {
        for (int i = 0; i < stereo.Length; i += 2, sample++)
        {
            double time = sample / (double)Spectrum.SampleRate;
            double beat = time / BeatLength;
            int step = (int)beat % 32;
            double phase = time % BeatLength;
            double eighth = phase % (BeatLength / 2);
            double bass = Notes[(step / 4) % Notes.Length];
            double kick = Math.Sin(Math.Tau * (51 * phase + 3.2 * (1 - Math.Exp(-38 * phase)))) * Math.Exp(-19 * phase) * 0.64;
            double note = (Math.Sin(Math.Tau * bass * phase) + 0.24 * Math.Sin(Math.Tau * bass * 3 * phase)) * Math.Exp(-9 * phase) * 0.19;
            double chord = (Math.Sin(Math.Tau * bass * 6 * eighth) + Math.Sin(Math.Tau * bass * 9 * eighth)) * Math.Exp(-16 * eighth) * 0.065;
            random ^= random << 13;
            random ^= random >> 17;
            random ^= random << 5;
            double noise = random / (double)uint.MaxValue * 2 - 1;
            double hat = (noise - previousNoise) * Math.Exp(-95 * eighth) * 0.10;
            double snare = step % 2 == 1 ? (noise * 0.24 + Math.Sin(Math.Tau * 194 * phase) * 0.13) * Math.Exp(-38 * phase) : 0;
            previousNoise = noise;
            double build = step < 24 ? 1 : 0.45;
            double attack = Math.Min(1, eighth * 1500);
            stereo[i] = (float)((kick * build + note + chord + hat + snare * build) * attack * 0.8);
            stereo[i + 1] = (float)((kick * build + note + chord * 0.8 + hat * 0.75 + snare * build) * attack * 0.8);
        }
    }
}
