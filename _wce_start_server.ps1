# Minimal local static-file server for viewing this configurator export
# without needing a real web host. No installs required: this uses .NET's
# HttpListener, built into every Windows 7+ machine via PowerShell.
#
# Binds to localhost only (not a public network listener) - this does not
# require Administrator rights or a urlacl reservation, unlike binding to
# "+" or a real network interface would.

$root = $PSScriptRoot
$portsToTry = 8743..8760

$listener = $null
$port = $null
foreach ($p in $portsToTry) {
    try {
        $candidate = New-Object System.Net.HttpListener
        $candidate.Prefixes.Add("http://localhost:$p/")
        $candidate.Start()
        $listener = $candidate
        $port = $p
        break
    } catch {
        continue
    }
}

if (-not $listener) {
    Write-Host "Could not start the local server (no free port found in range $($portsToTry[0])-$($portsToTry[-1]))."
    Write-Host "Close other programs that might be using a local port and try again."
    exit 1
}

$url = "http://localhost:$port/"
Write-Host "Serving:  $root"
Write-Host "Open at:  $url"
Write-Host ""
Write-Host "Keep this window open while viewing the configurator."
Write-Host "Close this window (or press Ctrl+C) when you're done."
Write-Host ""

Start-Process $url

$mimeTypes = @{
    ".html" = "text/html"; ".htm" = "text/html"
    ".js"   = "application/javascript"; ".json" = "application/json"
    ".glb"  = "model/gltf-binary"; ".gltf" = "model/gltf+json"; ".bin" = "application/octet-stream"
    ".png"  = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"; ".svg" = "image/svg+xml"
    ".mp4"  = "video/mp4"; ".mp3" = "audio/mpeg"; ".wav" = "audio/wav"
    ".hdr"  = "application/octet-stream"; ".exr" = "application/octet-stream"; ".ico" = "image/x-icon"
}

$fullRoot = (Resolve-Path $root).Path

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        try {
            $reqPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath.TrimStart('/'))
            if ([string]::IsNullOrEmpty($reqPath)) { $reqPath = "index.html" }

            $filePath = Join-Path $root $reqPath
            $fullFile = $null
            if (Test-Path $filePath -PathType Leaf) {
                $fullFile = (Resolve-Path $filePath).Path
            }

            # Guard against "../" style paths escaping the export folder.
            if ($fullFile -and $fullFile.StartsWith($fullRoot)) {
                $bytes = [System.IO.File]::ReadAllBytes($fullFile)
                $ext = [System.IO.Path]::GetExtension($fullFile).ToLower()
                $mime = $mimeTypes[$ext]
                if (-not $mime) { $mime = "application/octet-stream" }
                $response.ContentType = $mime
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.ContentLength64 = $notFoundBytes.Length
                $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
            }
        } catch {
            try { $response.StatusCode = 500 } catch {}
        } finally {
            $response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
