# =================================================================
#  EINRICHTBLÄTTER — Excel-Dateien aus den Typ-Ordnern in die App
#
#  Läuft alle fünf Minuten in der Aufgabe "HoferTool" (hofertool.ps1),
#  ohne Knopf in der App (Wunsch Patrick 8. Oktober 2026). Unveränderte
#  Dateien erkennt es an Name, Grösse und Änderungszeit und lässt sie in
#  Ruhe. Welche Ordner es anschaut und zu welchem Maschinentyp
#  jeder gehört, steht in der App unter Einstellungen → Dokumente →
#  Einrichtblatt-Ordner.
#
#  In den Ordnern liegen auch PDFs, CAD-Dateien und anderes. Das
#  Programm nimmt nur Excel-Dateien (.xlsx, .xlsm, .xls) mit einer
#  HOCO Nr. im Namen, wie auch immer sie sonst heissen:
#
#     10844-0049.xlsx                    → Einrichtblatt der HOCO Nr.
#     Werkzeugprotokoll 10844-0049.xlsx    10844-0049 auf dem Typ des
#     10844-0049 neu.xlsm                  Ordners
#
#  Hat der Name ausser HOCO Nr., Typ und "Werkzeugprotokoll" noch ein
#  anderes Wort (Toleranzen, Plattenwechsel, Werkzeugkosten …), ist es
#  kein Einrichtblatt und bleibt weg. Gibt es für eine HOCO Nr. mehrere,
#  zählt das Werkzeugprotokoll, sonst die zuletzt geänderte Datei. Eine Datei wird nur hochgeladen, wenn
#  sie neu ist oder sich seit dem letzten Mal geändert hat.
#
#  Regel wie bei den Zeichnungen (Wunsch Patrick, 9. Oktober 2026: "WBGs
#  und Einrichtblätter kann jeder löschen; wenn man löscht, soll es eine
#  andere Datei versuchen; falls keine vorhanden, steht dort nicht
#  vorhanden; manuell hochgeladen ist Master"):
#   - Nimmt jemand das Einrichtblatt in der App weg ("Einrichtblatt
#     entfernen" im Betrachter oder bei der HOCO Nr.), kommt beim
#     nächsten Durchlauf die nächste Excel-Datei dieser Nummer im Ordner.
#     Die weggenommene steht in einrichtblaetter-stand.json unter
#     "abgelehnt" und kommt nie wieder. Gibt es keine andere mehr, bleibt
#     die Nummer ohne Blatt.
#   - Ein Blatt, das nicht von diesem Programm stammt (in der App von Hand
#     hinterlegt), ist Master und wird nie ersetzt. Woran man das erkennt:
#     Die Adresse in hoco_type_data.blatt_url ist nicht die, die das
#     Programm selbst hochgeladen hat ("adressen"). Blätter aus einer
#     Fassung vor dieser Regel zählen als eigene (einmalig aus "dateien"
#     übernommen), damit geänderte Excel-Dateien weiter hochkommen.
#
#  DAS PROGRAMM LIEST NUR. In den Ordnern wird nie etwas gelöscht,
#  verschoben, umbenannt oder geändert. Zum Hochladen kopiert es die
#  Datei zuerst nach %TEMP% und lädt die Kopie hoch, so stört es auch
#  nicht, wenn die Datei gerade in Excel offen ist.
#
#  Höchstens 150 Dateien je Durchlauf; sind es mehr, macht der nächste
#  Durchlauf weiter.
#
#  Aufruf:
#     .\einrichtblaetter.ps1            normaler Durchlauf
#     .\einrichtblaetter.ps1 -Probe     sofort ein Probelauf, nie hochladen
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "einrichtblaetter-stand.json"
$protDatei  = Join-Path $ordnerHier "einrichtblaetter.log"
$hoechstensJeLauf = 150
$listeHoechstens  = 300

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  if ($Probe) { Write-Host $zeile }
  try {
    Add-Content -Path $protDatei -Value $zeile -Encoding UTF8
    $alle = Get-Content -Path $protDatei -Encoding UTF8
    if ($alle.Count -gt 3000) { $alle | Select-Object -Last 2000 | Set-Content -Path $protDatei -Encoding UTF8 }
  } catch { }
}

# ---------- Einstellungen ----------
if (-not (Test-Path $einstDatei)) { Schreibe "abgleich-einstellungen.json fehlt"; exit 1 }
$E = Get-Content -Raw -Path $einstDatei -Encoding UTF8 | ConvertFrom-Json
$U = ($E.supabase_url).TrimEnd("/")
$KEY = $E.anon_key

# Anmeldung und welche Datei je HOCO Nr. und Typ zuletzt hochgeladen wurde
# (dateien: Kennung, adressen: die eigene Adresse in der App, abgelehnt:
# in der App weggenommene Dateien, volle Pfade)
$stand = @{ token = $null; ablauf = 0; auffrischen = $null; dateien = @{}; adressen = @{}; abgelehnt = @{}; erledigt = $null; letzter = $null }
$adressenNeu = $true
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
    $stand.erledigt = $g.erledigt; $stand.letzter = $g.letzter
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
    if ($g.PSObject.Properties.Name -contains "adressen") { $adressenNeu = $false }
    if ($g.adressen) { $g.adressen.PSObject.Properties | ForEach-Object { $stand.adressen[$_.Name] = [string]$_.Value } }
    if ($g.abgelehnt) { $g.abgelehnt.PSObject.Properties | ForEach-Object { $stand.abgelehnt[$_.Name] = @($_.Value | ForEach-Object { [string]$_ }) } }
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
}

. (Join-Path $ordnerHier "dokumente-teile.ps1")

# Ist die Excel-Datei ein Einrichtblatt? Im selben Ordner liegen auch
# Toleranzen, Plattenwechsel, Werkzeugkosten usw. mit derselben HOCO Nr.
#   1 = Werkzeugprotokoll im Namen (auch vertippt: Werkzeuprotokoll …)
#   2 = sonst nur HOCO Nr., Typ, Ziffern oder "Nr"
#   0 = ein anderes Wort im Namen: kein Einrichtblatt, bleibt weg
function Rang([string]$name, [string]$typName) {
  $ohne = [regex]::Replace([IO.Path]::GetFileNameWithoutExtension($name), '\d{4,6}\s?-\s?\d{3,5}', ' ')
  $typWoerter = @(($typName.ToLower() -split '[^a-zäöüß]+') | Where-Object { $_ })
  $fremd = @()
  $prot = $false
  foreach ($w in (($ohne.ToLower() -split '[^a-zäöüß]+') | Where-Object { $_ })) {
    # Alte Fassungen und Kopien nie, auch nicht als Werkzeugprotokoll
    if (@('alt', 'old', 'kopie', 'copy') -contains $w) { return @{ rang = 0; fremd = $w } }
    if ($w -match 'protokol') { $prot = $true; continue }
    if ($typWoerter -contains $w -or $w -eq 'sw' -or $w -eq 'nr') { continue }
    $fremd += $w
  }
  if ($prot) { return @{ rang = 1; fremd = "" } }
  if ($fremd.Count -eq 0) { return @{ rang = 2; fremd = "" } }
  return @{ rang = 0; fremd = ($fremd -join " ") }
}

# Wurde so ein Blatt (Toleranzen usw.) früher schon hochgeladen, als die
# Regel noch fehlte, kommt es in der App wieder weg. Nur in der App, die
# Datei im Ordner bleibt unberührt.
function FalschesEntfernen($d, [string]$h, $typ) {
  $alte = @(Lesen ("dokumente?select=id,datei_url&art=eq.einrichtblatt&hoco_nr=eq." + (W $h) +
                   "&type_id=eq." + $typ.id + "&dateiname=eq." + (W $d.Name)))
  if ($alte.Count -eq 0) { return $false }
  $urls = @($alte | ForEach-Object { [string]$_.datei_url })
  Aendern "Delete" ("dokumente?id=in.(" + (($alte | ForEach-Object { $_.id }) -join ",") + ")") $null $null
  $t = @(Lesen ("hoco_type_data?select=blatt_url&hoco_nr=eq." + (W $h) + "&type_id=eq." + $typ.id))
  if ($t.Count -gt 0 -and $urls -contains [string]$t[0].blatt_url) {
    Aendern "Patch" ("hoco_type_data?hoco_nr=eq." + (W $h) + "&type_id=eq." + $typ.id) @{ blatt_url = $null } $null
  }
  AblageLoeschen $urls
  try {
    Aendern "Post" "dokumente_verlauf" @{ dateiname = $d.Name; art = "einrichtblatt"; hoco_nr = $h; type_id = $typ.id;
      ziel = "entfernt: kein Einrichtblatt"; quelle = "eb-ordner"; ersetzt = $true } $null
  } catch { }
  return $true
}


# ---------- Durchlauf ----------
# immer = true sagt der App, dass diese Fassung ohne Knopf läuft
$jetztIso = (Get-Date).ToUniversalTime().ToString("o")
$status = @{ immer = $true; zeit = $jetztIso; gesehen = $jetztIso; rechner = $env:COMPUTERNAME;
             scharf = $false; ordner = @(); excel = 0; neu = 0; ersetzt = 0; gleich = 0; rest = 0;
             ohneNr = 0; fremd = 0; aelter = 0; hochgeladen = 0; manuell = 0; abgelehnt = 0; keineMehr = 0;
             fehler = $null; liste = @() }
function Eintrag($o, [string]$datei, [string]$hoco, [string]$was) {
  if ($status.liste.Count -lt $listeHoechstens) {
    $status.liste += @{ o = $o; d = $datei; h = $hoco; w = $was }
  }
}

try {
  Anmelden

  $werte = @{}
  Lesen "app_config?select=schluessel,wert&schluessel=in.(eb_ordner)" |
    ForEach-Object { if ($_.wert) { try { $werte[$_.schluessel] = $_.wert | ConvertFrom-Json } catch { } } }
  $konf = $werte["eb_ordner"]
  if (-not $konf -or -not $konf.ordner -or @($konf.ordner).Count -eq 0) {
    throw "In der App sind noch keine Einrichtblatt-Ordner eingetragen (Einstellungen → Dokumente)."
  }
  $scharf = -not $Probe
  $status.scharf = $scharf
  if (-not $scharf) { Schreibe "Probelauf: es wird nichts hochgeladen." }

  $typen = @(Lesen "machine_types?select=id,name")
  # Welche HOCO Nr. auf welchem Typ hat in der App schon ein Einrichtblatt, und welches?
  $vorhanden = @{}; $blattVon = @{}
  Lesen "hoco_type_data?select=hoco_nr,type_id,blatt_url&blatt_url=not.is.null" |
    ForEach-Object { $k = [string]$_.hoco_nr + "|" + [string]$_.type_id; $vorhanden[$k] = $true; $blattVon[$k] = [string]$_.blatt_url }
  # Einmalig nach dem Wechsel auf diese Fassung: Was das Programm früher
  # hochgeladen hat (dateien), gilt als eigenes Blatt, nicht als Master
  if ($adressenNeu) {
    foreach ($k in @($stand.dateien.Keys)) { if ($blattVon[$k]) { $stand.adressen[$k] = [string]$blattVon[$k] } }
    $adressenNeu = $false
    StandSichern
  }

  $nochFrei = $hoechstensJeLauf
  $oi = -1
  foreach ($o in @($konf.ordner)) {
    $oi++
    $pfad = PfadAufloesen ([string]$o.pfad)
    $typ = $typen | Where-Object { [string]$_.id -eq [string]$o.typ } | Select-Object -First 1
    $info = @{ pfad = $pfad; typ = $(if ($typ) { $typ.name } else { "" }); excel = 0; fehler = $null }
    $status.ordner += $info
    if (-not $pfad) { continue }
    if (-not $typ) { $info.fehler = "Kein Maschinentyp gewählt"; Schreibe ("Ordner ohne Typ: " + $pfad); continue }
    if (-not (Test-Path -LiteralPath $pfad)) {
      $info.fehler = "Ordner nicht erreichbar"
      if ($pfad -match '^[D-Zd-z]:') {
        $info.fehler += ". Das Laufwerk " + $pfad.Substring(0, 2) + " kennt die Aufgabe nicht, besser \\Server\Freigabe\... eintragen"
      }
      Schreibe ("Ordner nicht erreichbar: " + $pfad)
      continue
    }

    # *.xls* trifft .xls, .xlsx und .xlsm. "~$…" sind Sperrdateien von Excel.
    $alle = @(Get-ChildItem -LiteralPath $pfad -File -Filter "*.xls*" -Recurse:([bool]$o.unter) -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -match '^\.(xlsx|xlsm|xls)$' -and $_.Name -notlike '~$*' })
    $info.excel = $alle.Count
    $status.excel += $alle.Count

    # Je HOCO Nr. das Werkzeugprotokoll, sonst die Datei nur mit Nummer;
    # bei mehreren davon die zuletzt geänderte
    $jeNr = @{}
    foreach ($d in $alle) {
      $h = HocoAusName $d.Name
      if (-not $h) { $status.ohneNr++; Eintrag $oi $d.Name "" "ohne HOCO Nr. im Namen, bleibt weg"; continue }
      $r = Rang $d.Name $typ.name
      if ($r.rang -eq 0) {
        $status.fremd++
        $was = "kein Einrichtblatt (" + $r.fremd + "), bleibt weg"
        if ($scharf) {
          try {
            if (FalschesEntfernen $d $h $typ) {
              $was = "kein Einrichtblatt (" + $r.fremd + "), aus der App entfernt"
              Schreibe ("aus der App entfernt: " + $d.FullName)
            }
          } catch { Schreibe ("Entfernen ging nicht: " + $d.Name + ": " + $_.Exception.Message) }
        }
        Eintrag $oi $d.Name $h $was
        continue
      }
      $d | Add-Member -NotePropertyName HoferRang -NotePropertyValue $r.rang -Force
      if (-not $jeNr[$h]) { $jeNr[$h] = @() }
      $jeNr[$h] += $d
    }
    foreach ($h in ($jeNr.Keys | Sort-Object)) {
      $schluessel = $h + "|" + [string]$typ.id
      $jetzt = [string]$blattVon[$schluessel]
      $eigene = [string]$stand.adressen[$schluessel]

      # In der App von Hand hinterlegt: Master, bleibt
      if ($jetzt -and ($jetzt -ne $eigene)) { $status.manuell++; Eintrag $oi "" $h "in der App von Hand hinterlegt (Master), bleibt"; continue }

      # Das eigene Blatt ist in der App weggenommen worden: diese Datei
      # kommt nie wieder, die nächste ist dran
      if (-not $jetzt -and $stand.dateien[$schluessel]) {
        $weg = ([string]$stand.dateien[$schluessel]).Split("|")[0]
        if ($weg) {
          if (-not $stand.abgelehnt[$schluessel]) { $stand.abgelehnt[$schluessel] = @() }
          if ($stand.abgelehnt[$schluessel] -notcontains $weg) { $stand.abgelehnt[$schluessel] += $weg }
        }
        $stand.dateien.Remove($schluessel); $stand.adressen.Remove($schluessel)
        StandSichern
        $status.abgelehnt++
        Schreibe ("Einrichtblatt von " + $h + " auf " + $typ.name + " in der App entfernt, nächste Datei: " + $weg)
      }

      $gruppe = @($jeNr[$h] | Where-Object { @($stand.abgelehnt[$schluessel]) -notcontains $_.FullName } |
        Sort-Object @{ Expression = { $_.HoferRang } }, @{ Expression = { $_.LastWriteTimeUtc }; Descending = $true })
      if ($gruppe.Count -eq 0) { $status.keineMehr++; Eintrag $oi "" $h "alle Dateien in der App entfernt, bleibt ohne Blatt"; continue }
      $d = $gruppe[0]
      foreach ($x in ($gruppe | Select-Object -Skip 1)) {
        $status.aelter++; Eintrag $oi $x.Name $h ("weiteres Blatt, es zählt " + $d.Name)
      }
      $kennung = Kennung $d
      if ($jetzt -and $stand.dateien[$schluessel] -eq $kennung) { $status.gleich++; continue }

      $ersetzt = [bool]$vorhanden[$schluessel]
      if ($ersetzt) { $status.ersetzt++ } else { $status.neu++ }
      $was = $(if ($ersetzt) { "ersetzt das Einrichtblatt in der App" } else { "neu" })
      if (-not $scharf) { Eintrag $oi $d.Name $h ("würde hochladen: " + $was); Schreibe ("Probe: " + $d.FullName + "  →  " + $h + " auf " + $typ.name + ", " + $was); continue }
      if ($nochFrei -le 0) { $status.rest++; Eintrag $oi $d.Name $h "kommt beim nächsten Durchlauf"; continue }

      $kopie = $null
      try {
        $kopie = LesendKopieren $d
        $z = @{ hoco = $h; typ = $typ; art = "einrichtblatt"; titel = $h; fa = $null; auftrag = $null; grund = ""; passt = $true }
        $script:letzteAdresse = $null
        Hochladen $kopie $z "eb-ordner"
        $stand.dateien[$schluessel] = $kennung
        $stand.adressen[$schluessel] = [string]$script:letzteAdresse
        StandSichern
        $blattVon[$schluessel] = [string]$script:letzteAdresse
        $vorhanden[$schluessel] = $true
        $status.hochgeladen++
        $nochFrei--
        Eintrag $oi $d.Name $h ("hochgeladen, " + $was)
        Schreibe ($d.FullName + "  →  " + $h + " auf " + $typ.name)
      } catch {
        Eintrag $oi $d.Name $h ("Fehler: " + $_.Exception.Message)
        Schreibe ("Fehler bei " + $d.FullName + ": " + $_.Exception.Message)
        $status.fehler = "Fehler bei " + $d.Name + ": " + $_.Exception.Message
      } finally {
        # Nur die eigene Kopie in %TEMP% wegräumen, nie das Original
        if ($kopie) { Remove-Item -LiteralPath (Split-Path -Parent $kopie.FullName) -Recurse -Force -ErrorAction SilentlyContinue }
      }
    }
  }
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

# Wann zuletzt etwas hochkam, bleibt stehen, auch wenn die nächsten
# Durchläufe nichts Neues finden
if ($status.hochgeladen -gt 0) { $status.zuletzt = @{ zeit = $jetztIso; anzahl = $status.hochgeladen } }
elseif ($stand.letzter) { try { $l = $stand.letzter | ConvertFrom-Json; if ($l.zuletzt) { $status.zuletzt = $l.zuletzt } } catch { } }
try {
  Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "eb_ordner_status";
    wert = ($status | ConvertTo-Json -Compress -Depth 4) } "resolution=merge-duplicates"
} catch { Schreibe ("Stand nicht an die App gemeldet (sql/einrichtblatt-ordner.sql ausgeführt?): " + $_.Exception.Message) }
$stand.letzter = ($status | ConvertTo-Json -Compress -Depth 4)
StandSichern

if ($Probe -or -not $status.scharf) {
  Write-Host ""
  Write-Host ("Probelauf: " + $status.excel + " Excel-Dateien gefunden, " + ($status.neu + $status.ersetzt) +
    " würden hochgeladen (" + $status.neu + " neu, " + $status.ersetzt + " ersetzen ein vorhandenes), " +
    $status.ohneNr + " ohne HOCO Nr., " + $status.fremd + " keine Einrichtblätter (Toleranzen usw.), " + $status.aelter + " weitere Blätter derselben Nummer, " +
    $status.manuell + " von Hand hinterlegt (Master), " + $status.keineMehr + " ohne Blatt, weil alle entfernt. Nichts hochgeladen, im Ordner nichts verändert.")
  foreach ($o in $status.ordner) {
    $t = "  " + $o.pfad + "  (Typ " + $o.typ + "): " + $o.excel + " Excel-Dateien"
    if ($o.fehler) { $t += " — " + $o.fehler }
    Write-Host $t
  }
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
