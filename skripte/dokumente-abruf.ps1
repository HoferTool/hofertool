# =================================================================
#  DOKUMENTE AUF ABRUF — WBG und Zeichnung, sobald jemand sie öffnet
#
#  Wunsch Patrick 8. Oktober 2026: Keine Knöpfe mehr und nicht mehr
#  alle fünf Minuten. Wer in der App (Pad, Planwand, HOCO Nr.) eine
#  WBG oder eine Zeichnung öffnet, legt in der Tabelle dok_abruf eine
#  Anfrage an. Dieses Programm schaut alle zwei Sekunden nach:
#
#   - WBG: Es leert den Pool-Ordner wie bisher dokumente-pool.ps1.
#     Jede WBG wird am Namen zugeordnet, hochgeladen und danach aus
#     dem Ordner gelöscht. Nur hochgeladene WBGs werden gelöscht, der
#     Ordner selbst bleibt. Anderes kommt in den Unterordner "nicht
#     zugeordnet", eine WBG ohne geplanten Auftrag wartet bis zu
#     sieben Tage. Dann meldet es der App die WBG des Auftrags oder
#     "keines".
#   - Zeichnung: Es sucht im Zeichnungs-Ordner die PDF der HOCO Nr. mit
#     "hofer" im Namen, sonst die mit "kunde", und lädt sie hoch, wenn
#     sie neu ist oder sich geändert hat. DAS PROGRAMM LIEST DORT NUR:
#     nie löschen, verschieben, umbenennen oder ändern. Hochgeladen
#     wird eine Kopie aus %TEMP%.
#
#  Alle 30 Sekunden meldet es sich unter app_config.dok_abruf_status,
#  damit die App weiss, dass jemand lauscht. Ohne Meldung zeigt die
#  App nur, was schon hochgeladen ist, und wartet nicht.
#
#  Die Aufgabe "Hofer Dokumente" startet es alle fünf Minuten; läuft
#  es schon, passiert nichts. So ist es nach einem Absturz oder
#  Neustart spätestens nach fünf Minuten wieder da. Wird diese Datei
#  oder dokumente-teile.ps1 ersetzt (einrichten.ps1), beendet es sich
#  von selbst und kommt mit der neuen Fassung wieder.
#
#  Aufruf:
#     .\dokumente-abruf.ps1          lauschen (so startet es die Aufgabe)
#     .\dokumente-abruf.ps1 -Probe   zeigt Ordner und Pool, ändert nichts
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$diesesSkript = $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "abruf-stand.json"
$protDatei  = Join-Path $ordnerHier "abruf.log"
$takt = 2            # Sekunden zwischen zwei Blicken in dok_abruf
$lebenAlle = 30      # Sekunden zwischen zwei Meldungen an die App
$wartenTage = 7      # so lange wartet eine WBG auf ihren Auftrag
$zuAltMinuten = 10   # ältere Anfragen (Rechner war aus) nicht mehr bearbeiten

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  if ($Probe) { Write-Host $zeile }
  try {
    Add-Content -Path $protDatei -Value $zeile -Encoding UTF8
    if ((Get-Item -LiteralPath $protDatei).Length -gt 1MB) {
      Get-Content -Path $protDatei -Encoding UTF8 | Select-Object -Last 3000 | Set-Content -Path $protDatei -Encoding UTF8
    }
  } catch { }
}

# ---------- Einstellungen ----------
if (-not (Test-Path $einstDatei)) { Schreibe "abgleich-einstellungen.json fehlt"; exit 1 }
$E = Get-Content -Raw -Path $einstDatei -Encoding UTF8 | ConvertFrom-Json
$U = ($E.supabase_url).TrimEnd("/")
$KEY = $E.anon_key

# Anmeldung, welche Zeichnung je HOCO Nr. zuletzt hochgeladen wurde
# und welche wartenden WBGs schon im Protokoll stehen
$stand = @{ token = $null; ablauf = 0; auffrischen = $null; dateien = @{}; gemeldet = @{} }
function StandHolen([string]$datei) {
  if (-not (Test-Path $datei)) { return $null }
  try { return Get-Content -Raw -Path $datei -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}
$g = StandHolen $standDatei
if ($g) {
  $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
  if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
  if ($g.gemeldet) { $g.gemeldet.PSObject.Properties | ForEach-Object { $stand.gemeldet[$_.Name] = $_.Value } }
} else {
  # Beim ersten Start übernehmen, was zeichnungen.ps1 schon hochgeladen
  # hat, damit nichts ein zweites Mal kommt
  $alt = StandHolen (Join-Path $ordnerHier "zeichnungen-stand.json")
  if ($alt -and $alt.dateien) { $alt.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
}

. (Join-Path $ordnerHier "dokumente-teile.ps1")

function JetztIso { return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ") }

#   1 = "hofer" im Namen, 2 = "kunde" im Namen, 0 = keins von beiden
function Rang([string]$name) {
  $n = $name.ToLower()
  if ($n.Contains("hofer")) { return 1 }
  if ($n.Contains("kunde")) { return 2 }
  return 0
}

function KonfLesen {
  $k = @{}
  Lesen "app_config?select=schluessel,wert&schluessel=in.(dok_pool_pfad,zng_ordner)" |
    ForEach-Object { $k[$_.schluessel] = [string]$_.wert }
  return $k
}

# =================================================================
#  POOL LEEREN (wie bisher dokumente-pool.ps1)
# =================================================================

# Eine Datei, die gerade noch kopiert wird, lässt sich nicht exklusiv öffnen
function NochInArbeit($datei) {
  try { $s = [IO.File]::Open($datei.FullName, "Open", "Read", "None"); $s.Close(); return $false }
  catch { return $true }
}

# In den Unterordner schieben, ohne eine gleichnamige Datei zu überschreiben
function Beiseite($datei, [string]$ziel) {
  if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Path $ziel | Out-Null }
  $neu = Join-Path $ziel $datei.Name
  if (Test-Path -LiteralPath $neu) {
    $neu = Join-Path $ziel ($datei.BaseName + " (" + (Get-Date -Format "yyyy-MM-dd HHmmss") + ")" + $datei.Extension)
  }
  Move-Item -LiteralPath $datei.FullName -Destination $neu
}

function PoolPfad($konf) {
  $p = [string]$E.pool_ordner
  if (-not $p) { $p = [string]$konf["dok_pool_pfad"] }
  if (-not $p) { $p = "C:\Hofer\Pool" }
  return PfadAufloesen $p
}

# Gibt den Stand zurück und meldet ihn unter dok_pool_status
# abruf = true sagt der App, dass dieser Stand vom neuen Programm kommt
function PoolLeeren($konf, [bool]$nurZeigen) {
  $status = @{ abruf = $true; zeit = (JetztIso); rechner = $env:COMPUTERNAME; dateien = 0; neu = 0;
               fehler = $null; ohne = @(); wartet = @() }
  try {
    $pfad = PoolPfad $konf
    if (-not (Test-Path -LiteralPath $pfad)) {
      if ($nurZeigen) { throw "Den Pool-Ordner $pfad gibt es nicht oder er ist nicht erreichbar." }
      New-Item -ItemType Directory -Path $pfad | Out-Null
      Schreibe ("Pool-Ordner angelegt: " + $pfad)
    }
    $beiseite = Join-Path $pfad "nicht zugeordnet"
    $typen = @(Lesen "machine_types?select=id,name")

    # Nur der Ordner selbst, nicht "nicht zugeordnet" darunter
    $dateien = @(Get-ChildItem -LiteralPath $pfad -File |
      Where-Object { $_.Extension -match '^\.(pdf|png|jpe?g|webp|tiff?|xlsx|xlsm|xls)$' })
    $status.dateien = $dateien.Count
    $nochDa = @{}

    foreach ($d in $dateien) {
      if (NochInArbeit $d) { $nochDa[$d.Name] = $true; continue }   # beim nächsten Mal
      $z = Erkennen $d.Name $typen
      # Nur WBGs: alles andere bleibt unangetastet in "nicht zugeordnet"
      if ($z.art -ne "wbg") {
        $z.passt = $false
        if ($d.Extension -match '^\.(xlsx|xlsm|xls)$') { $z.grund = "Einrichtblätter kommen aus den Einrichtblatt-Ordnern, nicht aus dem Pool" }
        else { $z.grund = "im Pool nur WBGs (FA Nr. oder WBG im Namen)" }
      }
      elseif (BrauchtZiel $z) { $z = ZielSuchen $z $typen }

      if (-not $z.passt) {
        # WBG mit FA Nr., deren Auftrag noch nicht geplant ist: warten
        $alter = ((Get-Date) - $d.CreationTime).TotalDays
        if ($z.art -eq "wbg" -and $z.fa -and $alter -lt $wartenTage) {
          $status.wartet += $d.Name
          $nochDa[$d.Name] = $true
          if ($nurZeigen) { Write-Host ("  wartet: " + $d.Name + "  " + $z.grund); continue }
          if (-not $stand.gemeldet[$d.Name]) {
            Schreibe ("wartet: " + $d.Name + " — " + $z.grund)
            $stand.gemeldet[$d.Name] = (Get-Date).ToString("o")
          }
          continue
        }
        $status.ohne += $d.Name
        if ($nurZeigen) { Write-Host ("  nicht zuzuordnen: " + $d.Name + "  " + $z.grund); continue }
        Beiseite $d $beiseite
        Schreibe ("nicht zuzuordnen, in 'nicht zugeordnet' verschoben: " + $d.Name + "  " + $z.grund)
        continue
      }
      if ($nurZeigen) { Write-Host ("  " + $d.Name + "  ->  " + (ZielText $z)); continue }

      try {
        Hochladen $d $z "pool"
        # Nur was hochgeladen ist, wird aus dem Pool gelöscht
        Remove-Item -LiteralPath $d.FullName -Force
        $status.neu++
        Schreibe ($d.Name + "  →  " + (ZielText $z))
      } catch {
        # Datei bleibt liegen, beim nächsten Abruf noch einmal
        $nochDa[$d.Name] = $true
        Schreibe ("Fehler bei " + $d.Name + ": " + $_.Exception.Message)
        $status.fehler = "Fehler bei " + $d.Name + ": " + $_.Exception.Message
      }
    }
    # Gemeldete Wartende, die nicht mehr da sind, vergessen
    foreach ($n in @($stand.gemeldet.Keys)) { if (-not $nochDa[$n]) { $stand.gemeldet.Remove($n) } }
  } catch {
    $status.fehler = $_.Exception.Message
    Schreibe ("Pool: " + $_.Exception.Message)
  }
  if (-not $nurZeigen) {
    StandSichern
    try {
      Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "dok_pool_status";
        wert = ($status | ConvertTo-Json -Compress -Depth 3) } "resolution=merge-duplicates"
    } catch { Schreibe ("Pool-Stand nicht gemeldet: " + $_.Exception.Message) }
  }
  return $status
}

# =================================================================
#  ZEICHNUNG EINER HOCO NR. (wie bisher zeichnungen.ps1, nur eine)
# =================================================================

function ZngOrdner($konf) {
  $z = $null
  try { if ($konf["zng_ordner"]) { $z = $konf["zng_ordner"] | ConvertFrom-Json } } catch { }
  if (-not $z -or -not ([string]$z.pfad).Trim()) {
    throw "In der App ist noch kein Zeichnungs-Ordner eingetragen (Einstellungen → Dokumente)."
  }
  $pfad = PfadAufloesen ([string]$z.pfad)
  if (-not (Test-Path -LiteralPath $pfad)) {
    $f = "Zeichnungs-Ordner nicht erreichbar: " + $pfad
    if ($pfad -match '^[D-Zd-z]:') { $f += ". Besser \\Server\Freigabe\... eintragen" }
    throw $f
  }
  return @{ pfad = $pfad; unter = [bool]$z.unter }
}

# Die PDF mit "hofer" im Namen, sonst die mit "kunde"; bei mehreren die
# zuletzt geänderte. Der Filter nimmt nur den vorderen Teil der Nummer,
# weil sie im Namen auch als "10844 - 0049" stehen kann; er wirkt schon
# auf dem Server, darum ist die Suche auch in grossen Ordnern schnell.
function ZeichnungSuchen($ordner, [string]$hoco) {
  $vorne = $hoco.Split("-")[0]
  $treffer = @(Get-ChildItem -LiteralPath $ordner.pfad -File -Filter ("*" + $vorne + "*.pdf") -Recurse:($ordner.unter) -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -eq ".pdf" -and (HocoAusName $_.Name) -eq $hoco -and (Rang $_.Name) -gt 0 })
  if ($treffer.Count -eq 0) { return $null }
  return ($treffer | Sort-Object @{ Expression = { Rang $_.Name } }, @{ Expression = { $_.LastWriteTimeUtc }; Descending = $true } |
    Select-Object -First 1)
}

function ZeichnungJetzt([string]$hoco) {
  $t = @(Lesen ("hoco_parts?select=zeichnung_url&hoco_nr=eq." + (W $hoco)))
  if ($t.Count -gt 0 -and $t[0].zeichnung_url) { return [string]$t[0].zeichnung_url }
  return $null
}

# Ergebnis für die App: ergebnis (neu, gleich, keines), adresse, meldung
function ZeichnungHolen($konf, [string]$hoco) {
  $jetzt = ZeichnungJetzt $hoco
  try { $ordner = ZngOrdner $konf }
  catch { return @{ ergebnis = "keines"; adresse = $jetzt; meldung = $_.Exception.Message } }
  $d = ZeichnungSuchen $ordner $hoco
  if (-not $d) {
    return @{ ergebnis = "keines"; adresse = $jetzt; meldung = "Im Zeichnungs-Ordner liegt keine PDF der HOCO Nr. " + $hoco + " mit 'hofer' oder 'kunde' im Namen." }
  }
  $kennung = Kennung $d
  if ($jetzt -and $stand.dateien[$hoco] -eq $kennung) {
    return @{ ergebnis = "gleich"; adresse = $jetzt; meldung = $d.Name }
  }
  $kopie = $null
  try {
    $kopie = LesendKopieren $d
    # Ohne Stammeintrag der HOCO Nr. hätte die Zeichnung keinen Platz
    try { Aendern "Post" "hoco_parts?on_conflict=hoco_nr" @{ hoco_nr = $hoco } "resolution=ignore-duplicates" } catch { }
    $z = @{ hoco = $hoco; typ = $null; art = "zeichnung"; titel = $hoco; fa = $null; auftrag = $null; grund = ""; passt = $true }
    Hochladen $kopie $z "abruf"
    $stand.dateien[$hoco] = $kennung
    StandSichern
    Schreibe ($d.FullName + "  →  Zeichnung " + $hoco)
    return @{ ergebnis = "neu"; adresse = (ZeichnungJetzt $hoco); meldung = $d.Name }
  } finally {
    # Nur die eigene Kopie in %TEMP% wegräumen, nie das Original
    if ($kopie) { Remove-Item -LiteralPath (Split-Path -Parent $kopie.FullName) -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

# =================================================================
#  ANFRAGEN BEARBEITEN
# =================================================================

function WbgVon($r) {
  if ($r.auftrag_id) {
    $j = @(Lesen ("jobs?select=wbg_url&id=eq." + (W ([string]$r.auftrag_id))))
    if ($j.Count -gt 0 -and $j[0].wbg_url) { return [string]$j[0].wbg_url }
    return $null
  }
  if ($r.hoco_nr) {
    $j = @(OffeneAuftraege ([string]$r.hoco_nr) | Where-Object { $_.wbg_url }) | Select-Object -First 1
    if ($j) { return [string]$j.wbg_url }
  }
  return $null
}

function Erledigen($r, [string]$ergebnis, $adresse, [string]$meldung) {
  Aendern "Patch" ("dok_abruf?id=eq." + $r.id) @{ erledigt = (JetztIso); ergebnis = $ergebnis;
    adresse = $adresse; meldung = $meldung } $null
}

$script:zuletztZng = $null
function Bearbeiten($offen) {
  $ids = ($offen | ForEach-Object { [string]$_.id }) -join ","
  # Zeigt der App, dass jemand dran ist (sonst gibt sie nach 15 Sekunden auf)
  Aendern "Patch" ("dok_abruf?id=in.(" + $ids + ")") @{ angefangen = (JetztIso) } $null

  $grenze = (Get-Date).ToUniversalTime().AddMinutes(-$zuAltMinuten)
  $frisch = @()
  foreach ($r in $offen) {
    if (([datetime]$r.angelegt).ToUniversalTime() -lt $grenze) { Erledigen $r "zu alt" $null "" }
    else { $frisch += $r }
  }
  if ($frisch.Count -eq 0) { return }
  $konf = KonfLesen

  # WBG: Pool einmal leeren, dann jeder Anfrage ihre WBG
  $wbg = @($frisch | Where-Object { $_.art -eq "wbg" })
  if ($wbg.Count -gt 0) {
    $vorher = @{}
    foreach ($r in $wbg) { $vorher[[string]$r.id] = WbgVon $r }
    $ps = PoolLeeren $konf $false
    foreach ($r in $wbg) {
      try {
        $a = WbgVon $r
        if ($a) {
          $erg = "gleich"; if ($a -ne $vorher[[string]$r.id]) { $erg = "neu" }
          Erledigen $r $erg $a ""
        } else {
          $m = "Im Pool-Ordner liegt keine WBG für diesen Auftrag."
          if ($ps.fehler) { $m = $ps.fehler }
          Erledigen $r "keines" $null $m
        }
      } catch { Erledigen $r "fehler" $null $_.Exception.Message }
    }
  }

  # Zeichnung: je HOCO Nr. einmal suchen
  $zng = @($frisch | Where-Object { $_.art -eq "zeichnung" })
  foreach ($gruppe in ($zng | Group-Object -Property hoco_nr)) {
    $hoco = [string]$gruppe.Name
    $e = $null
    if (-not $hoco) { $e = @{ ergebnis = "keines"; adresse = $null; meldung = "Ohne HOCO Nr. gibt es keine Zeichnung." } }
    else {
      try { $e = ZeichnungHolen $konf $hoco }
      catch {
        Schreibe ("Zeichnung " + $hoco + ": " + $_.Exception.Message)
        $e = @{ ergebnis = "fehler"; adresse = $null; meldung = $_.Exception.Message }
        try { $e.adresse = ZeichnungJetzt $hoco } catch { }
      }
    }
    $texte = @{ neu = "neu hochgeladen"; gleich = "unverändert"; keines = "keine im Ordner"; fehler = "Fehler" }
    $script:zuletztZng = @{ zeit = (JetztIso); hoco = $hoco; ergebnis = $e.ergebnis; text = $texte[$e.ergebnis] }
    foreach ($r in $gruppe.Group) { Erledigen $r $e.ergebnis $e.adresse ([string]$e.meldung) }
  }
}

$script:seit = JetztIso
function LebenMelden([string]$fehler) {
  $w = @{ gesehen = (JetztIso); rechner = $env:COMPUTERNAME; seit = $script:seit; fehler = $fehler }
  if ($script:zuletztZng) { $w.zng = $script:zuletztZng }
  Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "dok_abruf_status";
    wert = ($w | ConvertTo-Json -Compress -Depth 3) } "resolution=merge-duplicates"
}

# =================================================================
#  PROBE
# =================================================================

if ($Probe) {
  Anmelden
  Write-Host "Anmeldung klappt."
  $konf = KonfLesen
  Write-Host ""
  Write-Host ("Pool-Ordner: " + (PoolPfad $konf))
  PoolLeeren $konf $true | Out-Null
  Write-Host ""
  try { $o = ZngOrdner $konf; Write-Host ("Zeichnungs-Ordner erreichbar: " + $o.pfad + $(if ($o.unter) { " (mit Unterordnern)" } else { "" })) }
  catch { Write-Host ("Zeichnungs-Ordner: " + $_.Exception.Message) }
  Write-Host ""
  try { Lesen "dok_abruf?select=id&limit=1" | Out-Null; Write-Host "Tabelle dok_abruf ist da." }
  catch { Write-Host "Tabelle dok_abruf fehlt noch: sql/dok-abruf.sql im Supabase SQL Editor ausführen." }
  Write-Host ""
  Write-Host "Probe fertig: nichts hochgeladen, nichts gelöscht, nichts verschoben."
  exit 0
}

# =================================================================
#  LAUSCHEN
# =================================================================

# Nur einmal gleichzeitig: Die Aufgabe startet es alle fünf Minuten
$sperre = New-Object Threading.Mutex($false, "HoferDokumenteAbruf")
$habSperre = $false
try { $habSperre = $sperre.WaitOne(0) } catch [Threading.AbandonedMutexException] { $habSperre = $true }
if (-not $habSperre) { exit 0 }

# Eine neue Fassung (einrichten.ps1) soll gleich gelten
function Fassung {
  return ((Get-Item -LiteralPath $diesesSkript).LastWriteTimeUtc.Ticks.ToString() + "|" +
          (Get-Item -LiteralPath (Join-Path $ordnerHier "dokumente-teile.ps1")).LastWriteTimeUtc.Ticks)
}
$meineFassung = Fassung
Schreibe ("Lauscht auf Anfragen aus der App (" + $env:COMPUTERNAME + ")")

$letztesLeben = [datetime]::MinValue
$letztesAufraeumen = [datetime]::MinValue
$letzterFehler = ""
$runden = 0
try {
  while ($true) {
    $pause = $takt
    try {
      Anmelden
      if (((Get-Date) - $letztesLeben).TotalSeconds -ge $lebenAlle) {
        try { LebenMelden $null } catch {
          if ($letzterFehler -ne "leben") { Schreibe ("Meldung an die App geht nicht: " + $_.Exception.Message) }
          $letzterFehler = "leben"
        }
        $letztesLeben = Get-Date
      }
      $offen = @(Lesen "dok_abruf?select=id,art,hoco_nr,auftrag_id,fa_nr,angelegt&erledigt=is.null&order=id&limit=50")
      if ($offen.Count -gt 0) {
        Bearbeiten $offen
        # Gleich die Meldung nachziehen, damit die Einstellungen das Neueste zeigen
        $letztesLeben = [datetime]::MinValue
      }
      if (((Get-Date) - $letztesAufraeumen).TotalHours -ge 1) {
        $alt = (Get-Date).ToUniversalTime().AddDays(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")
        try { Aendern "Delete" ("dok_abruf?angelegt=lt." + $alt) $null $null } catch { }
        $letztesAufraeumen = Get-Date
      }
      if ($letzterFehler -and $letzterFehler -ne "leben") { Schreibe "Läuft wieder." }
      if ($letzterFehler -ne "leben") { $letzterFehler = "" }
    } catch {
      $text = $_.Exception.Message
      if ($text -match "dok_abruf" -and $text -match "PGRST205|schema cache|does not exist") {
        $text = "Tabelle dok_abruf fehlt: sql/dok-abruf.sql im Supabase SQL Editor ausführen."
      }
      if ($text -ne $letzterFehler) { Schreibe ("Fehler: " + $text) }
      $letzterFehler = $text
      # Netz weg oder Anmeldung abgelaufen: nicht im Zwei-Sekunden-Takt hämmern
      $pause = 15
      if ($text -match "401|JWT") { $stand.ablauf = 0 }
      try { LebenMelden $text; $letztesLeben = Get-Date } catch { }
    }
    # Neue Fassung da? Dann aufhören, die Aufgabe startet die neue
    $runden++
    if ($runden % 15 -eq 0) {
      try { if ((Fassung) -ne $meineFassung) { Schreibe "Neue Fassung, starte neu."; break } } catch { }
    }
    Start-Sleep -Seconds $pause
  }
} finally {
  try { $sperre.ReleaseMutex() } catch { }
}
