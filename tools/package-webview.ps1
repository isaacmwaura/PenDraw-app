param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
# Fixed, official Microsoft runtime. Update this version for every public release.
$url = 'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/01b0fbd9-6ea3-4e12-818a-a71f73f3855b/Microsoft.WebView2.FixedVersionRuntime.155.0.4283.45.x64.cab'
$scratch = Join-Path (Get-Location) '.cache/webview-package'
New-Item -ItemType Directory -Force $scratch | Out-Null
$cab = Join-Path $scratch 'runtime.cab'
Invoke-WebRequest $url -OutFile $cab
if ((Get-FileHash $cab -Algorithm SHA256).Hash -ne 'EC533BF1B7354D288703CF821A2D640D0130108224F93E330BB9C09FAF3F8010') { throw 'WebView2 download checksum mismatch' }
$unpacked = Join-Path $scratch 'unpacked'
New-Item -ItemType Directory -Force $unpacked | Out-Null
& expand.exe $cab '-F:*' $unpacked | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'WebView2 extraction failed' }
$runtime = Get-ChildItem -LiteralPath $unpacked -Recurse -Filter msedgewebview2.exe | Select-Object -First 1
if (!$runtime) { throw 'WebView2 executable missing' }
if ((Get-AuthenticodeSignature -FilePath $runtime.FullName).Status -ne 'Valid') { throw 'Microsoft runtime signature invalid' }
New-Item -ItemType Directory -Force $Destination | Out-Null
Copy-Item -Path (Join-Path $runtime.Directory.FullName '*') -Destination $Destination -Recurse -Force
# Some MSVC toolchain builds import these DLLs. Supply Microsoft's unchanged
# copies from the same official runtime package beside PenDraw.exe as well.
$releaseFolder = (Get-Item -LiteralPath $Destination).Parent.FullName
foreach ($dll in @('vcruntime140.dll', 'vcruntime140_1.dll')) {
    Copy-Item -LiteralPath (Join-Path $runtime.Directory.FullName $dll) -Destination $releaseFolder -Force
}
