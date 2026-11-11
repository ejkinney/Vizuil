using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using QRCoder;
using Vizuil.Audio;

namespace Vizuil;

internal sealed class ViewerHost(AudioEngine audio) : IAsyncDisposable
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly Dictionary<string, Asset> Assets = LoadAssets();
    private readonly string adminToken = NewToken();
    private readonly SemaphoreSlim shareLock = new(1, 1);
    private readonly SemaphoreSlim desktopStreams = new(8, 8);
    private readonly CancellationTokenSource ending = new();
    private WebApplication? desktop;
    private volatile Share? share;
    private volatile float density = 0.65f;
    private volatile string scene = "bullet-hell";

    public async Task<string> StartAsync()
    {
        desktop = MakeServer(IPAddress.Loopback);
        MapAssets(desktop);
        desktop.MapGet("/", () => Assets["index.html"].Response());
        var api = desktop.MapGroup("/api");
        api.AddEndpointFilter(async (context, next) =>
        {
            var request = context.HttpContext.Request;
            string supplied = request.Path == "/api/frames"
                ? request.Query["key"].ToString()
                : request.Headers.Authorization.ToString().Replace("Bearer ", "", StringComparison.Ordinal);
            return TokenMatches(supplied, adminToken) ? await next(context) : Results.Unauthorized();
        });
        api.MapGet("/frames", (HttpContext context) => Stream(context, ending.Token, desktopStreams));
        api.MapPost("/source", (SourceChange change) =>
        {
            if (change.Source is not ("live" or "demo" or "off")) return Results.BadRequest();
            audio.SelectSource(change.Source);
            return Results.NoContent();
        });
        api.MapPost("/density", (DensityChange change) =>
        {
            if (!float.IsFinite(change.Density) || change.Density is < 0 or > 1) return Results.BadRequest();
            density = change.Density;
            return Results.NoContent();
        });
        api.MapPost("/scene", (SceneChange change) =>
        {
            if (change.Scene is not { Length: > 0 and <= 40 } id || id.Any(c => c is not (>= 'a' and <= 'z' or >= '0' and <= '9' or '-')))
                return Results.BadRequest();
            scene = id;
            return Results.NoContent();
        });
        api.MapGet("/networks", GetNetworks);
        api.MapGet("/share", () => Results.Ok(share?.Info));
        api.MapPost("/share", StartSharing);
        api.MapDelete("/share", async () => { await StopSharing(); return Results.NoContent(); });
        await desktop.StartAsync();
        return $"{desktop.Urls.Single()}/#key={adminToken}";
    }

    private async Task<IResult> StartSharing(ShareRequest request)
    {
        if (!GetNetworks().Any(network => network.Address == request.Address))
            return Results.BadRequest(new { message = "Choose an active local Wi-Fi or Ethernet connection." });

        await shareLock.WaitAsync();
        try
        {
            if (ending.IsCancellationRequested) return Results.StatusCode(503);
            if (share is { } existing)
                return existing.Info.Address == request.Address ? Results.Ok(existing.Info) : Results.Conflict();

            string token = NewToken();
            string path = $"/v/{token}";
            var revoked = new CancellationTokenSource();
            var viewers = new SemaphoreSlim(12, 12);
            var web = MakeServer(IPAddress.Parse(request.Address));
            try
            {
                MapAssets(web);
                web.MapGet(path, () => Assets["index.html"].Response());
                web.MapGet($"{path}/frames", (HttpContext context) => Stream(context, revoked.Token, viewers));
                await web.StartAsync(ending.Token);
                string url = web.Urls.Single() + path;
                using var qrData = QRCodeGenerator.GenerateQrCode(url, QRCodeGenerator.ECCLevel.M);
                using var qr = new PngByteQRCode(qrData);
                var info = new ShareInfo(url, request.Address, Convert.ToBase64String(qr.GetGraphic(6)));
                share = new Share(web, revoked, info);
                return Results.Ok(info);
            }
            catch (Exception ex) when (ex is IOException or SocketException or InvalidOperationException or OperationCanceledException)
            {
                await web.DisposeAsync();
                revoked.Dispose();
                return Results.Problem("Could not open the local viewer. Check your Wi-Fi connection and try again.", statusCode: 503);
            }
        }
        finally { shareLock.Release(); }
    }

    private async Task StopSharing()
    {
        await shareLock.WaitAsync();
        try
        {
            if (share is not { } active) return;
            await active.Revoked.CancelAsync();
            using var limit = new CancellationTokenSource(TimeSpan.FromSeconds(1));
            await active.Web.StopAsync(limit.Token);
            await active.Web.DisposeAsync();
            active.Revoked.Dispose();
            share = null;
        }
        finally { shareLock.Release(); }
    }

    private async Task Stream(HttpContext context, CancellationToken stop, SemaphoreSlim slots)
    {
        if (!slots.Wait(0)) { context.Response.StatusCode = 503; return; }
        using var streamLifetime = CancellationTokenSource.CreateLinkedTokenSource(stop, context.RequestAborted);
        CancellationToken cancellation = streamLifetime.Token;
        try
        {
            context.Response.ContentType = "text/event-stream";
            context.Response.Headers.CacheControl = "no-store, no-transform";
            await context.Response.WriteAsync("retry: 800\n\n", cancellation);
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(50));
            do
            {
                AudioState state = audio.Current;
                string data = JsonSerializer.Serialize(new DisplayFrame(scene, density, state.Source, state.Status,
                    context.Request.Path == "/api/frames" ? state.Device : null, state.Generation, state.Spectrum), Json);
                using var writeLimit = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                writeLimit.CancelAfter(TimeSpan.FromSeconds(1));
                await context.Response.WriteAsync($"data: {data}\n\n", writeLimit.Token);
                await context.Response.Body.FlushAsync(writeLimit.Token);
            } while (await timer.WaitForNextTickAsync(cancellation));
        }
        catch (OperationCanceledException) { }
        catch (IOException) { }
        finally { slots.Release(); }
    }

    private static WebApplication MakeServer(IPAddress address)
    {
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { Args = [], ContentRootPath = AppContext.BaseDirectory });
        builder.Logging.ClearProviders();
        builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.AddServerHeader = false;
            options.Limits.MaxRequestBodySize = 2048;
            options.Listen(address, 0);
        });
        var web = builder.Build();
        web.Use(async (context, next) =>
        {
            if (context.Request.Host.Host != address.ToString() || context.Request.Host.Port != context.Connection.LocalPort)
            {
                context.Response.StatusCode = 400;
                return;
            }
            context.Response.Headers.ContentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            context.Response.Headers.CacheControl = "no-store";
            await next(context);
        });
        return web;
    }

    private static void MapAssets(WebApplication web) => web.MapGet("/assets/{name}", (string name) =>
        name != "index.html" && Assets.TryGetValue(name, out var asset) ? asset.Response() : Results.NotFound());

    private static Dictionary<string, Asset> LoadAssets()
    {
        var assembly = Assembly.GetExecutingAssembly();
        return assembly.GetManifestResourceNames().Where(name => name.StartsWith("web/", StringComparison.Ordinal))
            .ToDictionary(name => name[4..], name =>
            {
                using var stream = assembly.GetManifestResourceStream(name)!;
                using var bytes = new MemoryStream();
                stream.CopyTo(bytes);
                string type = Path.GetExtension(name) switch
                {
                    ".html" => "text/html; charset=utf-8",
                    ".css" => "text/css; charset=utf-8",
                    ".mjs" => "text/javascript; charset=utf-8",
                    ".svg" => "image/svg+xml",
                    _ => "application/octet-stream"
                };
                return new Asset(bytes.ToArray(), type);
            });
    }

    private static NetworkChoice[] GetNetworks() => NetworkInterface.GetAllNetworkInterfaces()
        .Where(network => network.OperationalStatus == OperationalStatus.Up &&
            network.NetworkInterfaceType is NetworkInterfaceType.Wireless80211 or NetworkInterfaceType.Ethernet)
        .SelectMany(network => network.GetIPProperties().UnicastAddresses
            .Where(info => info.Address.AddressFamily == AddressFamily.InterNetwork && IsPrivate(info.Address))
            .Select(info => new NetworkChoice(network.Name, info.Address.ToString())))
        .DistinctBy(network => network.Address).ToArray();

    private static bool IsPrivate(IPAddress address)
    {
        byte[] octets = address.GetAddressBytes();
        return octets[0] == 10 || octets[0] == 192 && octets[1] == 168 || octets[0] == 172 && octets[1] is >= 16 and <= 31;
    }

    private static string NewToken() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(18));
    private static bool TokenMatches(string actual, string expected) => actual.Length == expected.Length &&
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(actual), Encoding.UTF8.GetBytes(expected));

    public async ValueTask DisposeAsync()
    {
        await ending.CancelAsync();
        await StopSharing();
        if (desktop is not null)
        {
            using var limit = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            await desktop.StopAsync(limit.Token);
            await desktop.DisposeAsync();
        }
        ending.Dispose();
        shareLock.Dispose();
        desktopStreams.Dispose();
    }

    private sealed record Asset(byte[] Bytes, string Type) { public IResult Response() => Results.Bytes(Bytes, Type); }
    private sealed record Share(WebApplication Web, CancellationTokenSource Revoked, ShareInfo Info);
    private sealed record ShareInfo(string Url, string Address, string Qr);
    private sealed record NetworkChoice(string Name, string Address);
    private sealed record ShareRequest(string Address);
    private sealed record SourceChange(string Source);
    private sealed record DensityChange(float Density);
    private sealed record SceneChange(string Scene);
    private sealed record DisplayFrame(string Scene, float Density, string Source, string Status, string? Device, int Generation, SpectrumFrame Spectrum);
}
