# Build the production image and run it locally against the repo's own res/ +
# public/games as the mounted data — lets you smoke-test the real nginx image
# (not the Vite dev server) at http://localhost:42199.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

docker build -t map-viewer:local .
docker rm -f map-viewer-local 2>$null | Out-Null
docker run -d --name map-viewer-local -p 42199:80 `
    -v "${PWD}\res:/data/res:ro" `
    -v "${PWD}\public\games:/data/games:ro" `
    map-viewer:local | Out-Null

Write-Host "map-viewer running at http://localhost:42199  (docker logs -f map-viewer-local)"
