# Visual Waltz

Visual Waltz is a second-screen music visualizer you can run in your browser. The first visual, **Bullet Hell**, follows a small plane through Ion Gorge as it dodges patterns fired by a mechanical carrier. Bass makes blue fans, mids make violet curves, and treble makes amber sparks. The carrier's antenna sends out a cyan pulse on each locked beat.

Choose **Block Party** from the **Scene** menu for a 3D spectrograph on a seven-row pyramid of 28 blocks, with the highest steps at the back. Rainbow stripes run from front to back, with bass at the red left edge and treble at the violet right edge. The newest spectrum appears at the front and moves up the steps as history. The blocks can rise nearly a full step above their resting heights. Every critter bounces on each beat. Neighboring pairs trade places every fourth beat, and the **Density** slider controls how many pairs swap.

Choose **Tidal Garden** for a low-poly 3D aquarium. The tempo sets the swimming pace, and beats accent tail strokes, flipper strokes, and jellyfish pulses. A single line of waving kelp shows the live spectrum from bass to treble, with louder frequencies making their plants grow taller and glow brighter. Treble brings up more bubbles, and **Density** adjusts the size of the shoal and the bubble streams. The aquarium also swims gently while the audio is off. It requires a browser with WebGL enabled.

Choose **Signal Swarm** for a top-down arcade fleet of 24 enemy ships in eight colored wings. Once the tempo locks, the fleet sweeps left and right on each beat, dives and climbs over four beats, or lunges in wings according to which frequencies are loudest. The scene randomly switches to a different pattern every eight beats. Follow the four beat markers at the top and look for matching flashes on the firing ship and the exact frequency row at the right edge of the spectrogram. Each wing fires at most one bolt per beat, using its strongest active band. Bass produces large, slow bolts, and treble produces small, fast bolts. The player also fires on every beat. Clear a fleet to bring in the next wave. Autopilot starts automatically. Use **arrow keys** or **WASD** to steer and press **P** to toggle autopilot. Hold **Space** to fire manually before the tempo locks. On a touch screen, drag to steer or tap the top edge to reveal the app controls. Dragging also fires before the tempo locks. **Density** adjusts how strong a frequency needs to be to join the volley.

Choose **Stick Dancer** for a floppy stick figure that attempts the **Running Man**, **Jersey Slide**, and **Rock Yo Hips** once the tempo locks. The moves change every eight beats. The dancer and backdrop also switch to a new neon palette every eight beats. Frequency spikes still add independent kicks and flicks before and after tempo lock. From low to high, the ranges drive the leg on the left (40–123 Hz), the leg on the right (123–378 Hz), the arm on the left (378 Hz–1.69 kHz), and the arm on the right (1.69–16 kHz). Turn up **Density** to make softer hits move the dancer.

Choose **Beat Stack** for an autoplay falling-block game. The stick figure keeps up a four-beat step, rocks left or right with each sideways move, and throws both hands down when a piece drops. Full rows and runs of four matching tiles from separate pieces clear on a beat. Eight frequency ranges each have their own piece and color. The scrolling spectrogram highlights the frequency that supplied the next piece. **Density** controls how often quieter active ranges contribute pieces.

Choose **Block Brawl** to watch two block-built fighters face off on a neon rooftop. Once the tempo locks, they trade eight-beat exchanges with a blocked punch, a duck, a counter, and a heavy kick. The camera moves closer as the exchange builds. **Density** adjusts the rain and sparks.

Choose **Signal Desk** for a 3D CRT control room. The scrolling spectrogram sends bass and lower mids to one hand and upper mids and treble to the other. Each hand moves toward its strongest frequencies. The room changes accent colors every two measures of 4/4 once the tempo locks. The scene requires WebGL.

## Use the hosted site

Open [Visual Waltz](https://visual-waltz.kinneyelliot289.chatgpt.site/) in desktop Chrome or Edge. Choose an **Audio source**, click **Start Listening**, then select the matching tab, window, or screen in the browser picker and enable its audio switch. **Browser tab** follows one tab. **App window** follows the selected app when the browser and operating system offer window audio. **Entire screen** uses system playback when the picker offers **Also share system audio**.

Choose another source and click **Change Source** to switch while listening. The visualizer analyzes the shared audio in your browser. **Stop** releases the share. **Demo** runs the scenes without a sharing prompt.

If the in-app preview blocks audio sharing, open the published site in a browser tab. For native Windows listening without the browser sharing picker, use the portable app below. The portable app also provides **Share to Phone** for a second screen on your local network.

## Run on Windows

1. Open `dist\portable` and double-click `VisualWaltz.exe`. This ready-to-run folder includes the runtime and opens in your default browser. No ZIP extraction or installation is needed. You can move or copy the whole folder anywhere you like.
2. Click **Start Listening**, then play music through the default Windows sound output. **Demo** runs a silent test. **Stop** releases the audio capture.
3. Move the browser to your second monitor. Press **F** or click the fullscreen icon. You can also use the browser’s **F11** shortcut. After three seconds of inactivity or when the browser loses focus, the controls and labels fade away, and inset scenes move to the center and grow. Move the mouse over the focused window, tap the scene, or press a key to bring the controls back.
4. Right-click the Visual Waltz icon in the Windows system tray and select **Quit** when you’re done. **Open Visual Waltz** opens the controls again if you closed the tab.

Beat-driven animation starts after Visual Waltz locks onto a steady tempo. The detector listens for repeating bass, midrange, and treble onsets and tracks tempos from about 50 to 220 BPM. The scenes use bass onsets to align their beat timing and keep the pulse through fills, half-time and double-time passages, and drumless breaks. A clearly different tempo takes over after several seconds of consistent evidence. Silence or a prolonged loss of rhythmic evidence clears the lock. The spectrum and other direct audio reactions continue while Visual Waltz looks for a steady beat. The spectrum history runs from treble at the top to bass at the bottom. If the scene waits for audio while music is playing, check that the player is using the Windows default output. Playback routed to an exclusive or protected audio stream may be unavailable to loopback capture.

## Share to a phone

Put the phone on the same local network as the PC. On the PC, open **Share to Phone**, select the connection that reaches the phone, and click **Start Sharing**. Scan the QR code with the phone camera. If Windows prompts for network access, allow Visual Waltz on the private network. Guest Wi-Fi may isolate devices from one another.

The phone follows the PC’s scene, source, and density settings and adjusts when you rotate it. It shows its own composition using the same live analysis. The music continues on the PC. **Stop Sharing** closes the viewer and expires the link. Sharing is off on every launch.

## Publish the site and add a scene

Edit the shared visualizer in `Web`. Run `node Prepare-Site.mjs` to refresh `Site/dist`, then publish the updated static build to the existing Visual Waltz Site using `Site/.openai/hosting.json`. Verify the deployment at the hosted URL. The hosted version supplies analysis frames through Web Audio, and the optional portable app supplies them through the Windows audio engine.

Put a scene module under `Web` and register it in `Web/scenes.mjs` with a slug and display name. Its `create(canvas)` function returns `resize(width, height)`, `render(dt, frame, presentation)`, and optionally `dispose()`. Choose the Canvas 2D or WebGL context inside `create`. Recompose for portrait inside `resize`. `dt` is seconds and `frame` is the latest shared analysis, or `null` during a connection loss. `presentation` eases between `0` for the controls view and `1` for the centered visual. `frame.spectrum` contains `level`, 32 low-to-high `bands`, three `energy` values, cumulative bass/mid/treble `hits`, `bpm`, and `confidence`. When `frame.generation` changes, reset any remembered hit counts.

Run the deterministic 30-minute flight simulations with `node tests/flight.test.mjs`, the aquarium's tempo and spectrum checks with `node tests/aquarium.test.mjs`, and Signal Swarm's frequency and combat checks with `node tests/swarm.test.mjs`.

## Build the optional Windows app

Build with the .NET 10 SDK from the project folder.

```powershell
dotnet run --project VisualWaltz.csproj
.\Publish.ps1
```

`Publish.ps1` builds and verifies the latest `dist\portable\VisualWaltz.exe`. Use `-OutputDirectory` to also save a copy elsewhere. You can publish while Visual Waltz is running. To use the new build, quit Visual Waltz from the system tray and reopen the portable executable.

Run the Windows audio checks with `dotnet run --project tests/VisualWaltz.Checks.csproj -c Release`.
