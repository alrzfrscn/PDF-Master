$ErrorActionPreference = "Stop"

# ==============================================================================
# 1. PROJECT PATH, CUSTOM IGNORES & SMART OPTIMIZATION SWITCHES
# ==============================================================================
$ProjectRoot = (Get-Location).Path

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
Set-Location $ProjectRoot

# --- A) CUSTOM USER EXCLUSIONS (Add your own folders, files, or paths here) ---

# 1. Ignore folders by name anywhere in the project (supports wildcards like "temp*")
$CustomIgnoredDirs = @(
    # "backups",
    # "old_code"
)

# 2. Ignore files by name or pattern anywhere in the project (supports wildcards like "*.bak")
$CustomIgnoredFiles = @(
    # "notes.txt",
    # "*.bak"
)

# 3. Ignore specific relative paths (folders or files) from the project root
$CustomIgnoredPaths = @(
    # "src\chess_master\web\assets\fonts",
    # "scripts\create_shortcut.ps1"
)

# --- B) SMART TOKEN OPTIMIZATION SWITCHES ---
$SmartSummarizeCSS   = $true   # Extracts design tokens (:root/@theme) & headers from large CSS (>25KB)
$SmartSummarizeTests = $true   # Extracts test function signatures (def test_*) instead of full test bodies
$SkipDocsAndLicenses = $true   # Skips historical docs/ reports & license files (keeps README.md & SKILL.md)
$CompactHtmlSvgIcons = $true   # Collapses inline <symbol> SVG path numbers in HTML files

$ProjectName = Split-Path $ProjectRoot -Leaf
$SafeProjectName = ($ProjectName -replace '[^a-zA-Z0-9_-]', '_').ToLower()
$OutputFileName = "${SafeProjectName}_ai_context_bundle.txt"
$OutputFile = Join-Path $ProjectRoot $OutputFileName
$CurrentScriptName = if ($PSCommandPath) { Split-Path $PSCommandPath -Leaf } else { "Export-ProjectForAI.ps1" }

# Optional: Load rules from .aiignore file in project root if it exists
$AiIgnoreFile = Join-Path $ProjectRoot ".aiignore"
if (Test-Path $AiIgnoreFile) {
    Get-Content -LiteralPath $AiIgnoreFile -Encoding UTF8 | ForEach-Object {
        $Rule = $_.Trim()
        if ($Rule -and -not $Rule.StartsWith("#")) {
            if ($Rule.Contains("/") -or $Rule.Contains("\")) {
                $CustomIgnoredPaths += $Rule.TrimEnd('/', '\')
            } elseif ($Rule.Contains(".")) {
                $CustomIgnoredFiles += $Rule
            } else {
                $CustomIgnoredDirs += $Rule
            }
        }
    }
}

# Smart Size Limits
$MaxSourceCodeSizeKB = 500   # Full source code files (.py, .js, .html, etc.) up to 500 KB
$MaxDataFileSizeKB   = 50    # Data/JSON/XML/TXT files larger than 50 KB are auto-previewed
$DatasetPreviewLines = 25    # Number of preview lines for datasets (.tsv, .csv, etc.)
$MaxAssetsPerFolder  = 10    # Max binary/asset files to list per folder in the tree

# Tree Drawing Characters (Generated via char codes for 100% PowerShell 5.1 compatibility)
$CharTee  = [string][char]0x251C + [string][char]0x2500 + [string][char]0x2500 + " "
$CharLast = [string][char]0x2514 + [string][char]0x2500 + [string][char]0x2500 + " "
$CharPipe = [string][char]0x2502 + "   "
$CharSpc  = "    "

# ==============================================================================
# 2. SMART EXCLUSION & CLASSIFICATION LISTS
# ==============================================================================

$IgnoredDirs = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    ".git", ".hg", ".svn", ".venv", "venv", "env", "virtualenv",
    "node_modules", "bower_components", "jspm_packages", "vendor", "third_party",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", ".nox", ".hypothesis",
    "dist", "build", "out", "target", "bin", "obj", "Debug", "Release", "x64", "x86",
    ".next", ".nuxt", ".svelte-kit", ".angular", ".expo", ".parcel-cache", ".turbo", ".vercel", ".netlify",
    ".idea", ".vscode", ".vs", ".fleet", ".openchamber", ".cursor",
    "coverage", "htmlcov", ".nyc_output", "test-results", "playwright-report",
    ".gradle", ".mvn", "Pods", ".dart_tool", ".pub-cache", "_build", "deps"
) | ForEach-Object { [void]$IgnoredDirs.Add($_) }

# Auto-detect external third-party AI skills from skills-lock.json
$ExternalLockedSkills = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$SkillsLockPath = Join-Path $ProjectRoot "skills-lock.json"
if (Test-Path $SkillsLockPath) {
    try {
        $SkillsLockJson = Get-Content -LiteralPath $SkillsLockPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($SkillsLockJson -and $SkillsLockJson.skills) {
            foreach ($Prop in $SkillsLockJson.skills.PSObject.Properties) {
                [void]$ExternalLockedSkills.Add($Prop.Name)
            }
        }
    } catch {}
}

# Lockfiles, Bundler Scripts, License texts, and System Noise
$LockAndNoiseFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
    "poetry.lock", "Pipfile.lock", "pdm.lock", "uv.lock",
    "Cargo.lock", "Gemfile.lock", "composer.lock", "mix.lock", "pubspec.lock",
    "go.sum", "packages.lock.json", "project.assets.json", "skills-lock.json",
    ".DS_Store", "Thumbs.db", "desktop.ini", ".aiignore",
    "chess_master_source_bundle.txt", "Export-ProjectForAI.ps1", $CurrentScriptName, $OutputFileName
) | ForEach-Object { [void]$LockAndNoiseFiles.Add($_) }

if ($SkipDocsAndLicenses) {
    @("LICENSE", "LICENSE.txt", "LICENSE.md", "THIRD_PARTY_NOTICES.md", "COPYING", "COPYING.txt") |
        ForEach-Object { [void]$LockAndNoiseFiles.Add($_) }
}

$SourceCodeExtensions = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue", ".svelte",
    ".html", ".htm", ".css", ".scss", ".sass", ".less",
    ".rs", ".go", ".cs", ".java", ".kt", ".kts", ".swift", ".dart", ".php", ".rb",
    ".c", ".cpp", ".cc", ".h", ".hpp", ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd",
    ".toml", ".yaml", ".yml", ".ini", ".cfg", ".conf", ".env",
    ".md", ".rst", ".pgn", ".prisma", ".graphql", ".gql", ".proto", ".sql"
) | ForEach-Object { [void]$SourceCodeExtensions.Add($_) }

$DatasetExtensions = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(".csv", ".tsv", ".jsonl", ".ndjson", ".log") | ForEach-Object { [void]$DatasetExtensions.Add($_) }

$BinaryAndAssetExtensions = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".svg", ".psd", ".ai",
    ".mp3", ".wav", ".ogg", ".flac", ".mp4", ".webm", ".avi", ".mov", ".mkv",
    ".ttf", ".otf", ".woff", ".woff2", ".eot",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".tgz",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".obj", ".o", ".a", ".lib", ".pyc", ".pyo", ".pyd", ".class", ".jar", ".war",
    ".db", ".sqlite", ".sqlite3", ".mdb", ".accdb", ".parquet", ".feather", ".h5", ".pkl", ".onnx", ".pt", ".pth", ".safetensors",
    ".map"
) | ForEach-Object { [void]$BinaryAndAssetExtensions.Add($_) }

# ==============================================================================
# 3. HELPER & SMART SUMMARIZER FUNCTIONS
# ==============================================================================

function Format-FileSize {
    param([long]$Bytes)
    if ($Bytes -lt 1024) { return "$Bytes B" }
    elseif ($Bytes -lt 1048576) { return "{0:N1} KB" -f ($Bytes / 1024) }
    else { return "{0:N2} MB" -f ($Bytes / 1048576) }
}

function Normalize-RelPath {
    param([string]$PathStr)
    return ($PathStr -replace '/', '\').Trim('\')
}

function Test-MatchesCustomPath {
    param([string]$RelPath)
    $NormRel = Normalize-RelPath -PathStr $RelPath
    foreach ($Pattern in $CustomIgnoredPaths) {
        if ([string]::IsNullOrWhiteSpace($Pattern)) { continue }
        $NormPattern = Normalize-RelPath -PathStr $Pattern
        if ($NormRel -like $NormPattern -or $NormRel.StartsWith("$NormPattern\", [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }
    return $false
}

function Test-IsIgnoredDir {
    param([System.IO.DirectoryInfo]$Dir, [string]$RelDirPath)
    $DirName = $Dir.Name

    # 1. Check Custom User Exclusions first
    foreach ($Pattern in $CustomIgnoredDirs) {
        if (-not [string]::IsNullOrWhiteSpace($Pattern) -and ($DirName -like $Pattern)) {
            return "Custom User Ignored Dir"
        }
    }
    if (Test-MatchesCustomPath -RelPath $RelDirPath) {
        return "Custom User Ignored Path"
    }

    # 2. Check Built-in Smart Exclusions
    if ($IgnoredDirs.Contains($DirName)) { return "System/Dependency/Build Dir" }
    if ($DirName.EndsWith(".egg-info", [System.StringComparison]::OrdinalIgnoreCase)) { return "Build Metadata Dir" }
    if ($DirName.EndsWith(".dist-info", [System.StringComparison]::OrdinalIgnoreCase)) { return "Build Metadata Dir" }
    if ($DirName.EndsWith(".framework", [System.StringComparison]::OrdinalIgnoreCase)) { return "Framework Binary Dir" }
    if ($SkipDocsAndLicenses -and $DirName -eq "docs") { return "Historical Docs/Screenshots Dir" }

    if ($Dir.Parent -and $Dir.Parent.Name -eq "skills" -and $ExternalLockedSkills.Contains($DirName)) {
        return "External Third-Party Skill (skills-lock.json)"
    }
    return $null
}

function Test-IsCustomIgnoredFile {
    param([System.IO.FileInfo]$File, [string]$RelPath)
    foreach ($Pattern in $CustomIgnoredFiles) {
        if (-not [string]::IsNullOrWhiteSpace($Pattern) -and ($File.Name -like $Pattern)) {
            return $true
        }
    }
    if (Test-MatchesCustomPath -RelPath $RelPath) {
        return $true
    }
    return $false
}

function Test-IsBinaryFile {
    param([System.IO.FileInfo]$File)
    if ($BinaryAndAssetExtensions.Contains($File.Extension)) { return $true }
    if ($File.Length -eq 0) { return $false }

    try {
        $SampleSize = [Math]::Min([int]$File.Length, 4096)
        $Buffer = New-Object byte[] $SampleSize
        $Stream = [System.IO.File]::OpenRead($File.FullName)
        $BytesRead = $Stream.Read($Buffer, 0, $SampleSize)
        $Stream.Close()
        for ($i = 0; $i -lt $BytesRead; $i++) {
            if ($Buffer[$i] -eq 0) { return $true }
        }
        return $false
    } catch {
        return $true
    }
}

function Detect-ProjectStack {
    param([string]$Root)
    $Stack = New-Object System.Collections.Generic.List[string]
    if ((Test-Path "$Root\pyproject.toml") -or (Test-Path "$Root\requirements.txt") -or (Test-Path "$Root\setup.py")) { $Stack.Add("Python") }
    if (Test-Path "$Root\package.json") { $Stack.Add("Node.js / JavaScript") }
    if (Test-Path "$Root\tsconfig.json") { $Stack.Add("TypeScript") }
    if (Test-Path "$Root\Cargo.toml") { $Stack.Add("Rust") }
    if (Test-Path "$Root\go.mod") { $Stack.Add("Go (Golang)") }
    if ((Get-ChildItem -Path $Root -Filter "*.csproj" -File -ErrorAction SilentlyContinue) -or (Get-ChildItem -Path $Root -Filter "*.sln" -File -ErrorAction SilentlyContinue)) { $Stack.Add(".NET / C#") }
    if ((Test-Path "$Root\pom.xml") -or (Test-Path "$Root\build.gradle") -or (Test-Path "$Root\build.gradle.kts")) { $Stack.Add("Java / Kotlin") }
    if (Test-Path "$Root\composer.json") { $Stack.Add("PHP") }
    if (Test-Path "$Root\pubspec.yaml") { $Stack.Add("Flutter / Dart") }
    if ((Test-Path "$Root\Dockerfile") -or (Test-Path "$Root\docker-compose.yml") -or (Test-Path "$Root\docker-compose.yaml")) { $Stack.Add("Docker") }

    if ($Stack.Count -eq 0) { return "General Software Project" }
    return ($Stack -join ", ")
}

function Mask-EnvContent {
    param([string[]]$Lines)
    $MaskedLines = foreach ($Line in $Lines) {
        if ($Line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($Line)) {
            $Line
        } elseif ($Line -match '^(\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*)(.+)$') {
            $KeyPart = $Matches[1]
            $ValPart = $Matches[2].Trim()
            if ($ValPart -in @('true', 'false', 'null', '""', "''", '0', '1', 'development', 'production', 'local')) {
                $Line
            } else {
                "${KeyPart}[REDACTED_SECRET]"
            }
        } else {
            $Line
        }
    }
    return ($MaskedLines -join "`r`n")
}

function Get-SmartTestSummary {
    param([string[]]$Lines, [string]$Ext)
    $Out = New-Object System.Collections.Generic.List[string]
    $HeadLimit = [Math]::Min($Lines.Count, 12)
    for ($i = 0; $i -lt $HeadLimit; $i++) {
        $Trimmed = $Lines[$i].Trim()
        if ($Trimmed.StartsWith('"""') -or $Trimmed.StartsWith('#') -or $Trimmed.StartsWith('//') -or $Trimmed.StartsWith('/*') -or $Trimmed.StartsWith('*')) {
            $Out.Add($Lines[$i])
        }
    }
    $SigCount = 0
    foreach ($Line in $Lines) {
        if ($Line -match '^\s*(async\s+)?def\s+test_' -or
            $Line -match '^\s*class\s+Test' -or
            $Line -match '^\s*@pytest\.fixture' -or
            $Line -match '^\s*(describe|it|test)\s*\(') {
            $Out.Add($Line)
            $SigCount++
        }
    }
    $Out.Add("")
    $Out.Add("# ... [SMART TEST SUMMARY: Extracted $SigCount test/fixture signatures from $($Lines.Count) lines. Set `$SmartSummarizeTests = `$false for full code] ...")
    return ($Out -join "`r`n")
}

function Get-SmartCssSummary {
    param([string[]]$Lines, [string]$SizeStr)
    $Out = New-Object System.Collections.Generic.List[string]
    $HeadCount = [Math]::Min($Lines.Count, 115)
    for ($i = 0; $i -lt $HeadCount; $i++) {
        $Out.Add($Lines[$i])
    }
    $Out.Add("")
    $Out.Add("/* --- EXTRACTED CSS ARCHITECTURE, CUSTOM TOKENS & MEDIA QUERIES --- */")
    $ExtraCount = 0
    for ($i = $HeadCount; $i -lt $Lines.Count; $i++) {
        $Line = $Lines[$i]
        if ($Line -match '^\s*/\*' -or $Line -match '^\s*:[a-zA-Z]' -or $Line -match '^\s*@(media|keyframes|layer|utility)') {
            $Out.Add($Line)
            $ExtraCount++
            if ($ExtraCount -ge 120) { break }
        }
    }
    $Out.Add("/* ... [SMART CSS SUMMARY: Design tokens & section headers extracted from $($Lines.Count) lines ($SizeStr). Set `$SmartSummarizeCSS = `$false for full CSS] ... */")
    return ($Out -join "`r`n")
}

# ==============================================================================
# 4. DIRECTORY TRAVERSAL & TREE GENERATION
# ==============================================================================

$TreeBuilder = New-Object System.Text.StringBuilder
$IncludedFiles = New-Object System.Collections.Generic.List[PSCustomObject]
$Stats = @{
    CodeFilesCount   = 0
    SummarizedCount  = 0
    BinaryAssetCount = 0
    SkippedDirsCount = 0
}

function Traverse-ProjectDirectory {
    param(
        [string]$CurrentDir,
        [string]$Indent = ""
    )

    $Items = @(Get-ChildItem -LiteralPath $CurrentDir -Force -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -ne $OutputFileName -and $_.Name -ne "chess_master_source_bundle.txt" -and $_.Name -ne $CurrentScriptName } |
             Sort-Object @{Expression = { -not $_.PSIsContainer }}, Name)

    $Dirs  = @($Items | Where-Object { $_.PSIsContainer })
    $Files = @($Items | Where-Object { -not $_.PSIsContainer })

    $AssetFiles = @()
    $NonAssetFiles = @()
    foreach ($F in $Files) {
        if ($BinaryAndAssetExtensions.Contains($F.Extension)) {
            $AssetFiles += $F
        } else {
            $NonAssetFiles += $F
        }
    }

    $TruncateAssets = $AssetFiles.Count -gt $MaxAssetsPerFolder
    if ($TruncateAssets) {
        $VisibleFiles = $NonAssetFiles + @($AssetFiles | Select-Object -First 5)
    } else {
        $VisibleFiles = $Files
    }

    $ExtraEntry = if ($TruncateAssets) { 1 } else { 0 }
    $TotalVisibleEntries = $Dirs.Count + $VisibleFiles.Count + $ExtraEntry
    $EntryIndex = 0

    # 1. Process Subdirectories
    foreach ($Dir in $Dirs) {
        $EntryIndex++
        $IsLast = ($EntryIndex -eq $TotalVisibleEntries)
        $Branch = if ($IsLast) { $CharLast } else { $CharTee }
        $NextIndent = $Indent + $(if ($IsLast) { $CharSpc } else { $CharPipe })
        $RelDirPath = $Dir.FullName.Substring($ProjectRoot.Length).TrimStart('\', '/')

        $IgnoreReason = Test-IsIgnoredDir -Dir $Dir -RelDirPath $RelDirPath
        if ($IgnoreReason) {
            $Stats.SkippedDirsCount++
            [void]$TreeBuilder.AppendLine("$Indent$Branch$($Dir.Name)/  [Excluded: $IgnoreReason]")
            continue
        }

        [void]$TreeBuilder.AppendLine("$Indent$Branch$($Dir.Name)/")
        Traverse-ProjectDirectory -CurrentDir $Dir.FullName -Indent $NextIndent
    }

    # 2. Process Files
    foreach ($File in $VisibleFiles) {
        $EntryIndex++
        $IsLast = ($EntryIndex -eq $TotalVisibleEntries)
        $Branch = if ($IsLast) { $CharLast } else { $CharTee }
        $RelPath = $File.FullName.Substring($ProjectRoot.Length).TrimStart('\', '/')
        $SizeStr = Format-FileSize -Bytes $File.Length

        if (Test-IsCustomIgnoredFile -File $File -RelPath $RelPath) {
            [void]$TreeBuilder.AppendLine("$Indent$Branch$($File.Name) ($SizeStr) [Skipped: Custom User Ignore]")
            continue
        }

        $IsFontLicense = $SkipDocsAndLicenses -and ($File.Name -like "OFL-*.txt" -or $File.Name -like "LICENSE*")
        if ($LockAndNoiseFiles.Contains($File.Name) -or $IsFontLicense) {
            [void]$TreeBuilder.AppendLine("$Indent$Branch$($File.Name) ($SizeStr) [Skipped: Lock/License/Noise File]")
            continue
        }

        if (Test-IsBinaryFile -File $File) {
            $Stats.BinaryAssetCount++
            [void]$TreeBuilder.AppendLine("$Indent$Branch$($File.Name) ($SizeStr) [Asset/Binary]")
            continue
        }

        [void]$TreeBuilder.AppendLine("$Indent$Branch$($File.Name) ($SizeStr)")

        $IncludedFiles.Add([PSCustomObject]@{
            FileInfo = $File
            RelPath  = $RelPath
        })
    }

    if ($TruncateAssets) {
        $HiddenCount = $AssetFiles.Count - 5
        $Stats.BinaryAssetCount += $HiddenCount
        [void]$TreeBuilder.AppendLine("$Indent$CharLast... (+$HiddenCount more asset/binary files in this folder)")
    }
}

Write-Host "Scanning project structure in: $ProjectRoot ..." -ForegroundColor Yellow
[void]$TreeBuilder.AppendLine("$ProjectName/")
Traverse-ProjectDirectory -CurrentDir $ProjectRoot -Indent ""

# ==============================================================================
# 5. BUILD AI CONTEXT OUTPUT FILE
# ==============================================================================

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Builder = New-Object System.Text.StringBuilder
$DetectedStack = Detect-ProjectStack -Root $ProjectRoot

[void]$Builder.AppendLine("================================================================================")
[void]$Builder.AppendLine("AI PROJECT CONTEXT & ARCHITECTURE BUNDLE")
[void]$Builder.AppendLine("================================================================================")
[void]$Builder.AppendLine("Project Name   : $ProjectName")
[void]$Builder.AppendLine("Detected Stack : $DetectedStack")
[void]$Builder.AppendLine("Root Path      : $ProjectRoot")
[void]$Builder.AppendLine("Generated At   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$Builder.AppendLine("Included Files : $($IncludedFiles.Count) source/config/data files")
[void]$Builder.AppendLine("")
[void]$Builder.AppendLine("GUIDE FOR AI ASSISTANT:")
[void]$Builder.AppendLine("1. SECTION 1 shows the complete visual directory tree of the project, including")
[void]$Builder.AppendLine("   where binary assets, images, fonts, and excluded dependency folders exist.")
[void]$Builder.AppendLine("2. SECTION 2 contains the full source code and configuration files. Large data")
[void]$Builder.AppendLine("   files (.tsv/.csv), large stylesheets, and test suites are smartly summarized")
[void]$Builder.AppendLine("   to preserve context window tokens while retaining 100% architectural clarity.")
[void]$Builder.AppendLine("================================================================================")
[void]$Builder.AppendLine("")

[void]$Builder.AppendLine("################################################################################")
[void]$Builder.AppendLine("# SECTION 1: PROJECT DIRECTORY TREE & ARCHITECTURE")
[void]$Builder.AppendLine("################################################################################")
[void]$Builder.AppendLine($TreeBuilder.ToString().TrimEnd())
[void]$Builder.AppendLine("")

[void]$Builder.AppendLine("################################################################################")
[void]$Builder.AppendLine("# SECTION 2: SOURCE CODE & CONFIGURATION FILES")
[void]$Builder.AppendLine("################################################################################")
[void]$Builder.AppendLine("")

$SortedFiles = $IncludedFiles | Sort-Object `
    @{Expression = { ($_.RelPath -split '[\\/]').Count -gt 1 }}, `
    RelPath

foreach ($Item in $SortedFiles) {
    $File     = $Item.FileInfo
    $RelPath  = $Item.RelPath
    $FullPath = $File.FullName
    $Ext      = $File.Extension.ToLowerInvariant()
    $SizeStr  = Format-FileSize -Bytes $File.Length

    [void]$Builder.AppendLine("================================================================================")
    [void]$Builder.AppendLine("FILE: $RelPath ($SizeStr)")
    [void]$Builder.AppendLine("================================================================================")

    if ($File.Length -eq 0) {
        [void]$Builder.AppendLine("[EMPTY FILE]")
        [void]$Builder.AppendLine("")
        continue
    }

    try {
        $Lines = [System.IO.File]::ReadAllLines($FullPath, $Utf8NoBom)
    } catch {
        [void]$Builder.AppendLine("[ERROR READING FILE: $($_.Exception.Message)]")
        [void]$Builder.AppendLine("")
        continue
    }

    $TotalLines = $Lines.Count
    if ($TotalLines -eq 0) {
        [void]$Builder.AppendLine("[EMPTY FILE]")
        [void]$Builder.AppendLine("")
        continue
    }

    # 1. Mask secrets in .env files
    $IsEnvSecretFile = ($File.Name -like ".env*") -and ($File.Name -notmatch "\.(example|sample|template)$")
    if ($IsEnvSecretFile) {
        [void]$Builder.AppendLine("# [SECURITY NOTICE: Secret values have been automatically redacted]")
        [void]$Builder.AppendLine((Mask-EnvContent -Lines $Lines))
        [void]$Builder.AppendLine("")
        $Stats.CodeFilesCount++
        continue
    }

    # 2. Accurate Minified / Bundled JS & CSS Detection
    $IsMinifiedName = $File.Name -match "\.(min|bundle|compiled)\.(js|mjs|cjs|css)$"
    $IsMinifiedContent = $false
    if ($Ext -in @(".js", ".mjs", ".cjs", ".css")) {
        $AvgLineLength = $File.Length / [Math]::Max(1, $TotalLines)
        if ($AvgLineLength -gt 300) {
            $IsMinifiedContent = $true
        } else {
            $SampleCheckCount = [Math]::Min($TotalLines, 30)
            for ($i = 0; $i -lt $SampleCheckCount; $i++) {
                if ($Lines[$i].Length -gt 1500) {
                    $IsMinifiedContent = $true
                    break
                }
            }
        }
    }

    if ($IsMinifiedName -or $IsMinifiedContent) {
        $Stats.SummarizedCount++
        $PreviewCount = [Math]::Min($TotalLines, 10)
        for ($i = 0; $i -lt $PreviewCount; $i++) {
            $LineText = $Lines[$i]
            if ($LineText.Length -gt 300) {
                $LineText = $LineText.Substring(0, 300) + " ... [LINE TRUNCATED]"
            }
            [void]$Builder.AppendLine($LineText)
        }
        [void]$Builder.AppendLine("... [AUTO-TRUNCATED: Minified or Compiled Output ($TotalLines lines, $SizeStr)] ...")
        [void]$Builder.AppendLine("")
        continue
    }

    # 3. Smart CSS Token & Architecture Summary for large stylesheets (> 25 KB)
    if ($SmartSummarizeCSS -and $Ext -in @(".css", ".scss") -and $File.Length -gt 25KB) {
        $Stats.SummarizedCount++
        [void]$Builder.AppendLine((Get-SmartCssSummary -Lines $Lines -SizeStr $SizeStr))
        [void]$Builder.AppendLine("")
        continue
    }

    # 4. Smart Test Suite Signature Extraction
    $IsTestFile = ($RelPath -match '^(tests?|__tests__|spec)[\\/]') -and ($File.Name -match '(^test_|_test\.|\.test\.|\.spec\.)')
    if ($SmartSummarizeTests -and $IsTestFile) {
        $Stats.SummarizedCount++
        [void]$Builder.AppendLine((Get-SmartTestSummary -Lines $Lines -Ext $Ext))
        [void]$Builder.AppendLine("")
        continue
    }

    # 5. Auto-detect Datasets (.tsv, .csv, etc.) or Oversized Data Files
    $IsDatasetFile = $DatasetExtensions.Contains($Ext)
    $IsSourceCode  = $SourceCodeExtensions.Contains($Ext)
    $SizeLimitKB   = if ($IsSourceCode) { $MaxSourceCodeSizeKB } else { $MaxDataFileSizeKB }
    $IsOversized   = ($File.Length / 1KB) -gt $SizeLimitKB

    if ($IsDatasetFile -or $IsOversized) {
        $Stats.SummarizedCount++
        $PreviewCount = [Math]::Min($TotalLines, $DatasetPreviewLines)
        $PreviewLines = for ($i = 0; $i -lt $PreviewCount; $i++) { $Lines[$i] }
        [void]$Builder.AppendLine(($PreviewLines -join "`r`n"))
        [void]$Builder.AppendLine("")
        [void]$Builder.AppendLine("... [AUTO-TRUNCATED: Showing first $PreviewCount of $TotalLines lines ($SizeStr) to save AI tokens] ...")
        [void]$Builder.AppendLine("")
        continue
    }

    # 6. Full Source Code (with optional SVG icon path compaction in HTML)
    $Stats.CodeFilesCount++
    $Content = ($Lines -join "`r`n").TrimEnd()
    if ($CompactHtmlSvgIcons -and $Ext -in @(".html", ".htm")) {
        $Content = [regex]::Replace($Content, '(<symbol\s+id="[^"]+"[^>]*>)\s*[\s\S]*?\s*(</symbol>)', '$1[SVG_ICON]$2')
    }
    [void]$Builder.AppendLine($Content)
    [void]$Builder.AppendLine("")
}

# Write Final Output
[System.IO.File]::WriteAllText($OutputFile, $Builder.ToString(), $Utf8NoBom)

# ==============================================================================
# 6. SUMMARY REPORT
# ==============================================================================
$FinalSize = Format-FileSize -Bytes (Get-Item $OutputFile).Length
$EstimatedTokens = [Math]::Round((Get-Item $OutputFile).Length / 4)

Write-Host ""
Write-Host "==================================================================" -ForegroundColor DarkGray
Write-Host "[DONE] AI Context Bundle Successfully Generated!" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor DarkGray
Write-Host "Project Name        : $ProjectName" -ForegroundColor White
Write-Host "Detected Tech Stack : $DetectedStack" -ForegroundColor Yellow
Write-Host "Full Code Files     : $($Stats.CodeFilesCount) files" -ForegroundColor Cyan
Write-Host "Smart Summarized    : $($Stats.SummarizedCount) files (CSS/Tests/Datasets)" -ForegroundColor Magenta
Write-Host "Binary/Assets Mapped: $($Stats.BinaryAssetCount) files (listed in tree only)" -ForegroundColor DarkCyan
Write-Host "Final Bundle Size   : $FinalSize (~$($EstimatedTokens.ToString('N0')) AI tokens)" -ForegroundColor Green
Write-Host "Saved To            : $OutputFile" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor DarkGray