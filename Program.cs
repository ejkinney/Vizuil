using System.Diagnostics;
using Vizuil.Audio;

namespace Vizuil;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var instance = new Mutex(false, "Local\\Vizuil", out bool created);
        if (!created)
        {
            MessageBox.Show("Vizuil is already running. Open it from the Windows system tray.", "Vizuil");
            return;
        }

        var audio = new AudioEngine();
        var host = new ViewerHost(audio);
        try
        {
            string url = host.StartAsync().GetAwaiter().GetResult();
            using var icon = Icon.ExtractAssociatedIcon(Environment.ProcessPath!);
            using var tray = new NotifyIcon { Text = "Vizuil", Icon = icon ?? SystemIcons.Application, Visible = true };
            using var menu = new ContextMenuStrip();
            using var context = new ApplicationContext();
            menu.Items.Add("Open Vizuil", null, (_, _) => OpenBrowser(url));
            menu.Items.Add("Quit", null, (_, _) => context.ExitThread());
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (_, _) => OpenBrowser(url);
            OpenBrowser(url);
            Application.Run(context);
            tray.Visible = false;
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Vizuil could not start.\n\n{ex.Message}", "Vizuil", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            Task.Run(async () =>
            {
                try { await host.DisposeAsync(); }
                finally { await audio.DisposeAsync(); }
            }).GetAwaiter().GetResult();
        }
    }

    private static void OpenBrowser(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            Clipboard.SetText(url);
            MessageBox.Show("Open your browser and paste the Vizuil address. The address is on your clipboard.", "Vizuil");
        }
    }
}
